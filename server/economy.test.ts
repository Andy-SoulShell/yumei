/** 使用独立 MySQL 验证真实账本、退款、发布权限和结算原子性，无付费服务调用。 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  coinWallets,
  coinLedger,
  creatorEarnings,
  creatorPayouts,
  communityCharacters,
  girlfriends,
  users,
} from "../drizzle/schema";
import { DEFAULT_ECONOMY } from "../shared/economy";
import { getDb, withUserTransaction } from "./database";
import {
  walletInfo,
  reserveCoins,
  refundCoins,
  settleCreatorEarnings,
  creatorBalance,
} from "./economy";
import { handleCoinOrder } from "./coinPayments";
import { handleLemonEvent } from "./billing";
import { stubProductConfig } from "./testProductConfig";
import { createTestUser, createTestGirlfriend } from "./testFixtures";
import { createConversation } from "./repositories/conversations";
import { reserveGeneration, failGeneration } from "./generations";
import { appRouter } from "./routers";
import { canReadMedia } from "./mediaAuthorization";
import { storagePut } from "./storage";
import { exportAccountData } from "./privacy";
const db = async () => (await getDb())!;
const caller = (id?: string, admin = false) =>
  appRouter.createCaller({
    user: id ? { id, birthDate: new Date("1990-01-01") } : null,
    administrator: admin ? { id: "management" } : null,
    req: {},
    res: {},
  } as any);
const policy = {
  ...structuredClone(DEFAULT_ECONOMY),
  enabled: true,
  welcomeCoins: 55,
  minimumPayoutCents: 100,
  packs: [
    {
      id: "small",
      coins: 1000,
      priceCents: 1000,
      currency: "USD" as const,
      variantId: "81234",
      checkoutUrl: "https://yumei.lemonsqueezy.com/checkout/buy/test",
      enabled: true,
    },
  ],
};
const order = (
  userId: string,
  id = String(Math.floor(Math.random() * 1e14) + 1),
  refunded = 0
) => ({
  meta: {
    event_name: refunded ? "order_refunded" : "order_created",
    custom_data: { user_id: userId },
  },
  data: {
    id,
    attributes: {
      status: refunded ? "refunded" : "paid",
      currency: "USD",
      total: 1000,
      refunded_amount: refunded,
      test_mode: false,
      first_order_item: { variant_id: 81234, price: 1000 },
    },
  },
});
async function seed() {
  const userId = await createTestUser();
  const role = await createTestGirlfriend({
    userId,
    name: "Mia",
    personality: "warm",
    appearance: "adult, 25 years old",
    referenceImageKey: `economy-${crypto.randomUUID()}.png`,
    referenceImageUrl: "/test.png",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: role.id,
  });
  return { userId, role, conversation };
}
beforeEach(() => {
  stubProductConfig("billing.mode", "free");
  stubProductConfig("billing.economy", structuredClone(policy));
  vi.stubEnv("LEMONSQUEEZY_TEST_MODE", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("grants welcome coins once across concurrent wallet reads and keeps accounts isolated", async () => {
  const a = await createTestUser(),
    b = await createTestUser();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => walletInfo(a))
  );
  expect(responses.every(row => row.balance === 55)).toBe(true);
  expect((await walletInfo(b)).balance).toBe(55);
  expect(
    await (await db()).select().from(coinLedger).where(eq(coinLedger.userId, a))
  ).toHaveLength(1);
  await expect(caller().economy.wallet()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});
it("replaces the old usage meter, rejects overspending and refunds concurrent failures exactly once", async () => {
  const { userId, conversation } = await seed();
  const ids = await Promise.all(
    Array.from({ length: 11 }, () =>
      reserveGeneration({
        userId,
        conversationId: conversation.id,
        kind: "selfie",
        meter: { name: "selfie", period: "day", limit: 1, what: "images" },
      })
    )
  );
  expect((await walletInfo(userId)).balance).toBe(0);
  await expect(
    reserveGeneration({ userId, conversationId: conversation.id, kind: "chat" })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  await Promise.all(
    Array.from({ length: 5 }, () => failGeneration(ids[0], userId))
  );
  expect((await walletInfo(userId)).balance).toBe(5);
});
it("does not charge platform coins for BYOK requests", async () => {
  const { userId, conversation } = await seed();
  await reserveGeneration({
    userId,
    conversationId: conversation.id,
    kind: "selfie",
    chargeCoins: false,
  });
  expect((await walletInfo(userId)).balance).toBe(55);
});
it("posts purchases once, consumes bonus coins first and returns the exact split", async () => {
  const user = await createTestUser(),
    event = order(user);
  await Promise.all(Array.from({ length: 6 }, () => handleCoinOrder(event)));
  expect((await walletInfo(user)).balance).toBe(1055);
  await withUserTransaction(user, tx =>
    reserveCoins(tx, user, "generation:split", "selfie", 60)
  );
  let wallet = await walletInfo(user);
  expect([wallet.bonus, wallet.paid]).toEqual([0, 995]);
  await withUserTransaction(user, tx => refundCoins(tx, user, "split"));
  await withUserTransaction(user, tx => refundCoins(tx, user, "split"));
  wallet = await walletInfo(user);
  expect([wallet.bonus, wallet.paid]).toEqual([55, 1000]);
});
it("handles out-of-order and repeated purchase refunds without regranting, including retired packs", async () => {
  const user = await createTestUser(),
    event = order(user);
  event.data.attributes.refunded_amount = 1000;
  event.data.attributes.status = "refunded";
  event.meta.event_name = "order_refunded";
  expect(await handleCoinOrder(event)).toEqual({ ok: true });
  expect((await walletInfo(user)).paid).toBe(0);
  const paid = order(user, event.data.id);
  await handleCoinOrder(paid);
  expect((await walletInfo(user)).paid).toBe(0);
  const second = order(user);
  await handleCoinOrder(second);
  stubProductConfig("billing.economy.packs", []);
  await handleCoinOrder(order(user, second.data.id, 1000));
  expect((await walletInfo(user)).paid).toBe(0);
});
it("tracks refund debt instead of clamping it away, and rejects mismatched owners or test payments", async () => {
  const a = await createTestUser(),
    b = await createTestUser(),
    event = order(a);
  await handleCoinOrder(event);
  await withUserTransaction(a, tx =>
    reserveCoins(tx, a, "generation:spent", "selfie", 155)
  );
  await handleCoinOrder(order(a, event.data.id, 1000));
  expect((await walletInfo(a)).paid).toBe(-100);
  await expect(
    withUserTransaction(a, tx =>
      reserveCoins(tx, a, "generation:again", "chat")
    )
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect((await handleCoinOrder(order(b, event.data.id))).ok).toBe(false);
  const test = order(a);
  test.data.attributes.test_mode = true;
  expect((await handleCoinOrder(test)).ok).toBe(false);
});
it("binds one referral before the first purchase, rewards only confirmed payments and reverses refunds", async () => {
  const inviter = await createTestUser(),
    invitee = await createTestUser();
  await (
    await db()
  )
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, invitee));
  const code = (await walletInfo(inviter)).referralCode;
  await expect(
    caller(inviter).economy.claimReferral({ code })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await caller(invitee).economy.claimReferral({ code });
  await caller(invitee).economy.claimReferral({ code });
  expect((await walletInfo(inviter)).bonus).toBe(55);
  const event = order(invitee);
  await handleCoinOrder(event);
  await handleCoinOrder(event);
  expect((await walletInfo(inviter)).bonus).toBe(155);
  expect((await walletInfo(invitee)).bonus).toBe(80);
  await handleCoinOrder(order(invitee, event.data.id, 1000));
  expect((await walletInfo(inviter)).bonus).toBe(55);
  expect((await walletInfo(invitee)).bonus).toBe(55);
});
it("requires a verified account and an early claim for referral rewards", async () => {
  const a = await createTestUser(),
    b = await createTestUser(),
    code = (await walletInfo(a)).referralCode;
  await expect(caller(b).economy.claimReferral({ code })).rejects.toMatchObject(
    { code: "PRECONDITION_FAILED" }
  );
  await (
    await db()
  )
    .update(users)
    .set({
      emailVerified: true,
      createdAt: new Date(Date.now() - 8 * 86400000),
    })
    .where(eq(users.id, b));
  await expect(caller(b).economy.claimReferral({ code })).rejects.toMatchObject(
    { code: "PRECONDITION_FAILED" }
  );
});
it("keeps submitted portraits private until review, rejects stale approval and excludes private behavior", async () => {
  const { userId, role } = await seed();
  await storagePut(
    role.referenceImageKey,
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    "image/png"
  );
  const handle = `c_${crypto.randomUUID().slice(0, 12).replaceAll("-", "")}`;
  await caller(userId).economy.saveProfile({
    handle,
    displayName: "Creator",
    bio: "My creations",
  });
  const input = {
    girlfriendId: role.id,
    summary: "A warm and friendly companion.",
    scenario: "You meet in a quiet cafe.",
    adultAndRightsConfirmed: true as const,
  };
  await caller(userId).economy.submitCharacter(input);
  let own = await caller(userId).economy.creator();
  const first = own.publications[0];
  expect(first.snapshot.behavior).toBeNull();
  expect(await canReadMedia(first.snapshot.imageKey)).toBe(false);
  expect(await canReadMedia(first.snapshot.imageKey, userId)).toBe(true);
  expect(await canReadMedia(first.snapshot.imageKey, undefined, true)).toBe(
    true
  );
  await expect(
    caller(userId).economy.admin.moderate({
      id: first.id,
      expectedImageKey: first.snapshot.imageKey,
      status: "published",
      note: "Approved adult character",
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await caller(userId).economy.submitCharacter(input);
  await expect(
    caller(undefined, true).economy.admin.moderate({
      id: first.id,
      expectedImageKey: first.snapshot.imageKey,
      status: "published",
      note: "Approved adult character",
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  own = await caller(userId).economy.creator();
  const current = own.publications[0];
  await caller(undefined, true).economy.admin.moderate({
    id: current.id,
    expectedImageKey: (current.pendingSnapshot ?? current.snapshot).imageKey,
    status: "published",
    note: "Approved adult character",
  });
  expect(
    await canReadMedia((current.pendingSnapshot ?? current.snapshot).imageKey)
  ).toBe(true);
  await caller(userId).economy.unlistCharacter({ id: current.id });
  expect(
    await canReadMedia((current.pendingSnapshot ?? current.snapshot).imageKey)
  ).toBe(false);
});
it("accrues exact creator revenue only for purchased coins, reverses order refunds, and never duplicates settlement", async () => {
  const owner = await createTestUser(),
    publication = crypto.randomUUID();
  await (await db()).insert(communityCharacters).values({
    id: publication,
    userId: owner,
    sourceId: 1,
    status: "published",
    snapshot: {
      name: "Mia",
      summary: "A character",
      scenario: "Cafe",
      personality: "warm",
      appearance: "adult",
      interests: "reading",
      imageUrl: "/x",
      imageKey: "x",
      behavior: null,
    },
  });
  const { userId, role, conversation } = await seed();
  await (
    await db()
  )
    .update(girlfriends)
    .set({ communitySourceId: publication })
    .where(eq(girlfriends.id, role.id));
  const event = order(userId);
  await handleCoinOrder(event);
  await withUserTransaction(userId, tx =>
    reserveCoins(tx, userId, "generation:free", "selfie", 55)
  );
  await withUserTransaction(userId, tx =>
    settleCreatorEarnings(tx, {
      id: "free",
      userId,
      conversationId: conversation.id,
    })
  );
  expect(
    (await withUserTransaction(owner, tx => creatorBalance(tx, owner)))
      .totalUnits
  ).toBe(0);
  await withUserTransaction(userId, tx =>
    reserveCoins(tx, userId, "generation:paid", "selfie", 100)
  );
  for (let i = 0; i < 3; i++)
    await withUserTransaction(userId, tx =>
      settleCreatorEarnings(tx, {
        id: "paid",
        userId,
        conversationId: conversation.id,
      })
    );
  expect(
    (await withUserTransaction(owner, tx => creatorBalance(tx, owner)))
      .totalUnits
  ).toBe(200000);
  await handleCoinOrder(order(userId, event.data.id, 500));
  expect(
    (await withUserTransaction(owner, tx => creatorBalance(tx, owner)))
      .totalUnits
  ).toBe(100000);
});
it("reserves eligible payouts once and requires a recorded external payment reference", async () => {
  const owner = await createTestUser();
  await (
    await db()
  )
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, owner));
  await (await db()).insert(creatorEarnings).values({
    id: crypto.randomUUID(),
    userId: owner,
    requestId: crypto.randomUUID(),
    orderId: "test-earning",
    units: 2000000,
    availableAt: new Date(Date.now() - 1000),
  });
  const input = { id: crypto.randomUUID(), amountCents: 100 };
  await Promise.all([
    caller(owner).economy.requestPayout(input),
    caller(owner).economy.requestPayout(input),
  ]);
  expect(
    await (
      await db()
    )
      .select()
      .from(creatorPayouts)
      .where(eq(creatorPayouts.userId, owner))
  ).toHaveLength(1);
  await expect(
    caller(owner).economy.requestPayout({
      id: crypto.randomUUID(),
      amountCents: 100,
    })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  await expect(
    caller(undefined, true).economy.admin.settlePayout({
      id: input.id,
      status: "paid",
      reference: "",
      note: "Paid",
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await caller(undefined, true).economy.admin.settlePayout({
    id: input.id,
    status: "paid",
    reference: "external-test-payment-1",
    note: "Confirmed externally",
  });
  expect((await caller(owner).economy.creator()).payouts[0].status).toBe(
    "paid"
  );
});
it("exports financial data only for its owner and cascades private financial records on account deletion", async () => {
  const a = await createTestUser(),
    b = await createTestUser();
  await handleCoinOrder(order(a));
  await walletInfo(b);
  expect((await exportAccountData(a)).coinOrders).toHaveLength(1);
  expect((await exportAccountData(b)).coinOrders).toHaveLength(0);
  await (await db()).delete(users).where(eq(users.id, a));
  expect(
    await (
      await db()
    )
      .select()
      .from(coinWallets)
      .where(eq(coinWallets.userId, a))
  ).toHaveLength(0);
});
it("applies subscription coins once even when payment arrives before the subscription snapshot", async () => {
  const userId = await createTestUser(),
    subId = `sub-${crypto.randomUUID()}`,
    invoiceId = `inv-${crypto.randomUUID()}`;
  stubProductConfig("billing.plans.1.lemonVariantId", "999");
  stubProductConfig("billing.economy.planCoins", { plus: 200 });
  const paid = {
    meta: {
      event_name: "subscription_payment_success",
      custom_data: { user_id: userId },
    },
    data: {
      id: invoiceId,
      attributes: {
        subscription_id: subId,
        updated_at: new Date().toISOString(),
      },
    },
  };
  expect((await handleLemonEvent(paid)).ok).toBe(true);
  expect((await walletInfo(userId)).bonus).toBe(55);
  await handleLemonEvent({
    meta: {
      event_name: "subscription_created",
      custom_data: { user_id: userId },
    },
    data: {
      id: subId,
      attributes: {
        status: "active",
        variant_id: 999,
        updated_at: new Date().toISOString(),
      },
    },
  });
  expect((await walletInfo(userId)).bonus).toBe(255);
  await handleLemonEvent({
    ...paid,
    meta: { ...paid.meta, event_name: "subscription_payment_recovered" },
  });
  expect((await walletInfo(userId)).bonus).toBe(255);
  await handleLemonEvent({
    ...paid,
    meta: { ...paid.meta, event_name: "subscription_payment_refunded" },
  });
  expect((await walletInfo(userId)).bonus).toBe(55);
});
it("rejects paying a payout whose earnings were reversed after the request", async () => {
  const owner = await createTestUser();
  await (
    await db()
  )
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, owner));
  const earningId = crypto.randomUUID();
  await (await db()).insert(creatorEarnings).values({
    id: earningId,
    userId: owner,
    requestId: crypto.randomUUID(),
    orderId: "reversed",
    units: 2000000,
    availableAt: new Date(Date.now() - 1000),
  });
  const input = { id: crypto.randomUUID(), amountCents: 100 };
  await caller(owner).economy.requestPayout(input);
  await (
    await db()
  )
    .update(creatorEarnings)
    .set({ reversedUnits: 2000000 })
    .where(eq(creatorEarnings.id, earningId));
  await expect(
    caller(undefined, true).economy.admin.settlePayout({
      id: input.id,
      status: "paid",
      reference: "would-be-payment",
      note: "Must be rejected",
    })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
});
it("creates and charges one character for a repeated request, and rolls back a create with insufficient coins", async () => {
  const { createGirlfriend } = await import("./repositories/companions");
  const userId = await createTestUser();
  const input = {
    userId,
    name: "Creator test",
    personality: "warm",
    appearance: "adult woman",
    referenceImageKey: "fixture.png",
    referenceImageUrl: "/fixture.png",
    creationRequestId: crypto.randomUUID(),
  };
  const [a, b] = await Promise.all([
    createGirlfriend(input, 1, false, true),
    createGirlfriend(input, 1, false, true),
  ]);
  expect(a.id).toBe(b.id);
  expect((await walletInfo(userId)).balance).toBe(50);
  await expect(
    createGirlfriend({ ...input, name: "changed" }, 1, false, true)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const empty = await createTestUser();
  await withUserTransaction(empty, tx =>
    reserveCoins(tx, empty, "generation:all", "selfie", 55)
  );
  await expect(
    createGirlfriend(
      { ...input, userId: empty, creationRequestId: crypto.randomUUID() },
      1,
      false,
      true
    )
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect(
    await (
      await db()
    )
      .select()
      .from(girlfriends)
      .where(eq(girlfriends.userId, empty))
  ).toHaveLength(0);
});
it("never updates another creator when concurrent users request the same public handle", async () => {
  const a = await createTestUser(),
    b = await createTestUser(),
    handle = `race_${crypto.randomUUID().slice(0, 8)}`;
  const results = await Promise.allSettled([
    caller(a).economy.saveProfile({ handle, displayName: "First", bio: "A" }),
    caller(b).economy.saveProfile({ handle, displayName: "Second", bio: "B" }),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(
    1
  );
  const profiles = [
    (await caller(a).economy.creator()).profile,
    (await caller(b).economy.creator()).profile,
  ].filter(Boolean);
  expect(profiles).toHaveLength(1);
  expect(profiles[0]!.displayName).toBe(
    profiles[0]!.userId === a ? "First" : "Second"
  );
});
