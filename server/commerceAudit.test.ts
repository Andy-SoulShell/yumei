/** End-to-end financial and publication recovery on the dedicated test database. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import express from "express";
import axios from "axios";
import { eq } from "drizzle-orm";
import {
  coinCheckouts,
  creatorProfiles,
  coinOrders,
  users,
  creatorEarnings,
  communityCharacters,
  mediaDeletions,
  girlfriends,
} from "../drizzle/schema";
import { DEFAULT_ECONOMY } from "../shared/economy";
import { appRouter } from "./routers";
import { createTestUser, createTestGirlfriend } from "./testFixtures";
import { stubProductConfig } from "./testProductConfig";
import { getDb, withUserTransaction } from "./database";
import { handleCoinOrder } from "./coinPayments";
import {
  walletInfo,
  reserveCoins,
  settleCreatorEarnings,
  creatorBalance,
} from "./economy";
import { buildChatSystemPrompt } from "../shared/chatPrompt";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { registerBillingRoutes } from "./billing";
import { createConversation } from "./repositories/conversations";
import { storagePut } from "./storage";
import { canReadMedia } from "./mediaAuthorization";
const db = async () => (await getDb())!;
const caller = (id?: string, admin = false) =>
  appRouter.createCaller({
    user: id ? { id, birthDate: new Date("1990-01-01") } : null,
    administrator: admin ? { id: "qa-admin" } : null,
    req: {},
    res: {},
  } as any);
const policy = {
  ...structuredClone(DEFAULT_ECONOMY),
  enabled: true,
  minimumPayoutCents: 100,
  packs: [
    {
      id: "audit",
      coins: 1000,
      priceCents: 1000,
      currency: "USD" as const,
      variantId: "71001",
      checkoutUrl: "https://audit.lemonsqueezy.com/checkout/buy/audit",
      enabled: true,
    },
  ],
};
beforeEach(() => {
  stubProductConfig("billing.mode", "free");
  stubProductConfig("billing.economy", structuredClone(policy));
  vi.stubEnv("LEMONSQUEEZY_TEST_MODE", "0");
  vi.stubEnv("LEMONSQUEEZY_API_KEY", "synthetic-audit-key");
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "synthetic-audit-secret");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function verified() {
  const id = await createTestUser();
  await (
    await db()
  )
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, id));
  return id;
}
function order(userId: string, checkoutId?: string) {
  return {
    meta: {
      event_name: "order_created",
      custom_data: { user_id: userId, checkout_id: checkoutId },
    },
    data: {
      id: String(Math.floor(Math.random() * 1e14) + 1),
      attributes: {
        status: "paid",
        currency: "USD",
        total: 1000,
        refunded_amount: 0,
        test_mode: false,
        first_order_item: { variant_id: 71001, price: 1000, quantity: 1 } as {
          variant_id: number;
          price: number;
          quantity?: number;
          id?: string;
        },
      },
    },
  };
}
it("persists a single checkout intent and honors its original terms after a pack is changed or retired", async () => {
  const user = await verified(),
    id = crypto.randomUUID(),
    input = { packId: "audit", clientRequestId: id };
  const [a, b] = await Promise.all([
    caller(user).economy.checkout(input),
    caller(user).economy.checkout(input),
  ]);
  expect(a).toEqual(b);
  expect(new URL(a.url).searchParams.get("checkout[custom][checkout_id]")).toBe(
    id
  );
  expect(
    (await walletInfo(user)).checkouts.filter(row => row.id === id)
  ).toHaveLength(1);
  expect((await walletInfo(user)).paid).toBe(0);
  stubProductConfig("billing.economy.packs", []);
  const event = order(user, id);
  expect(await handleCoinOrder(event)).toEqual({ ok: true });
  expect((await walletInfo(user)).paid).toBe(1000);
  expect((await walletInfo(user)).checkouts[0].status).toBe("confirmed");
  await expect(caller(user).economy.checkout(input)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  event.meta.event_name = "order_refunded";
  event.data.attributes.status = "refunded";
  event.data.attributes.refunded_amount = 1000;
  await handleCoinOrder(event);
  expect((await walletInfo(user)).checkouts[0].status).toBe("refunded");
  await handleCoinOrder(event);
  expect((await walletInfo(user)).paid).toBe(0);
});
it("blocks unverified, unconfigured and unmetered checkout, isolates intents and expires resume links", async () => {
  const user = await createTestUser(),
    id = crypto.randomUUID(),
    input = { packId: "audit", clientRequestId: id };
  await expect(caller(user).economy.checkout(input)).rejects.toMatchObject({
    message: "verifyEmail",
  });
  await (
    await db()
  )
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, user));
  await caller(user).economy.checkout(input);
  const other = await verified();
  await expect(caller(other).economy.checkout(input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await (
    await db()
  )
    .update(coinCheckouts)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(coinCheckouts.id, id));
  await expect(caller(user).economy.checkout(input)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  // A completed payment is still credited even if its local resume link has expired.
  expect(await handleCoinOrder(order(user, id))).toEqual({ ok: true });
  stubProductConfig("billing.mode", "none");
  expect((await walletInfo(user)).chargingEnabled).toBe(false);
  await expect(
    caller(user).economy.checkout({ packId: "audit" })
  ).rejects.toMatchObject({ message: "checkoutUnavailable" });
  stubProductConfig("billing.mode", "free");
  vi.stubEnv("LEMONSQUEEZY_API_KEY", "");
  expect((await walletInfo(user)).checkoutReady).toBe(false);
});
it("credits verified quantities and discounted paid orders using a server-verified item, without real provider calls", async () => {
  const user = await verified(),
    intent = await caller(user).economy.checkout({ packId: "audit" }),
    event = order(user, intent.id);
  delete event.data.attributes.first_order_item.quantity;
  event.data.attributes.first_order_item.id = "88221";
  event.data.attributes.total = 1800;
  const get = vi.spyOn(axios, "get").mockResolvedValue({
    data: {
      data: {
        type: "order-items",
        id: "88221",
        attributes: {
          order_id: event.data.id,
          variant_id: 71001,
          price: 1000,
          quantity: 2,
        },
      },
    },
  });
  expect(await handleCoinOrder(event)).toEqual({ ok: true });
  expect((await walletInfo(user)).paid).toBe(2000);
  await handleCoinOrder(event);
  expect(get).toHaveBeenCalledTimes(1);
  expect(
    (
      await (
        await db()
      )
        .select()
        .from(coinOrders)
        .where(eq(coinOrders.id, event.data.id))
    )[0].netCents
  ).toBe(1800);
  const another = order(user, intent.id);
  delete another.data.attributes.first_order_item.quantity;
  another.data.attributes.first_order_item.id = "88221";
  get.mockRejectedValueOnce(new Error("temporary outage"));
  expect((await handleCoinOrder(another)).ok).toBe(false);
  expect((await walletInfo(user)).paid).toBe(2000);
});
it("accepts signed coin callbacks in free mode, rejects invalid signatures, and posts repeated deliveries exactly once", async () => {
  const user = await verified(),
    intent = await caller(user).economy.checkout({ packId: "audit" }),
    payload = JSON.stringify(order(user, intent.id));
  const app = express();
  registerBillingRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address() as { port: number },
      url = `http://127.0.0.1:${address.port}/api/billing/lemon-webhook`;
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-signature": "invalid",
          },
          body: payload,
        })
      ).status
    ).toBe(401);
    const signature = createHmac("sha256", "synthetic-audit-secret")
      .update(payload)
      .digest("hex");
    const responses = await Promise.all(
      [1, 2, 3].map(() =>
        fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-signature": signature,
          },
          body: payload,
        })
      )
    );
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    expect((await walletInfo(user)).paid).toBe(1000);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
});
it("keeps the live version public during edits, hides draft media, preserves retry identity and rejects stale reviews", async () => {
  const user = await verified(),
    role = await createTestGirlfriend({
      userId: user,
      name: "Audit character",
      personality: "A warm, calm adult companion.",
      appearance: "An adult, 28 years old.",
      referenceImageKey: `audit-${crypto.randomUUID()}.png`,
      referenceImageUrl: "/audit.png",
    });
  await storagePut(
    role.referenceImageKey,
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    "image/png"
  );
  await caller(user).economy.saveProfile({
    handle: `a_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    displayName: "Audit creator",
    bio: "Original creations",
  });
  const input = {
    girlfriendId: role.id,
    summary: "An original adult character.",
    scenario: "Meet in a quiet bookshop.",
    adultAndRightsConfirmed: true as const,
    clientRequestId: crypto.randomUUID(),
  };
  await caller(user).economy.submitCharacter(input);
  let row = (await caller(user).economy.creator()).publications[0];
  await caller(undefined, true).economy.admin.moderate({
    id: row.id,
    expectedImageKey: row.snapshot.imageKey,
    expectedReviewVersion: row.reviewVersion,
    status: "published",
    note: "Approved original adult character",
  });
  const profile = (await caller(user).economy.creator()).profile!;
  const publicPage = await caller().economy.creatorPage({
    handle: profile.handle,
  });
  expect(Object.keys(publicPage.profile).sort()).toEqual([
    "bio",
    "displayName",
    "handle",
  ]);
  expect(publicPage.characters.map(item => item.id)).toContain(row.id);
  const liveKey = row.snapshot.imageKey;
  const update = {
    ...input,
    summary: "An updated original adult character.",
    clientRequestId: crypto.randomUUID(),
  };
  await caller(user).economy.submitCharacter(update);
  row = (await caller(user).economy.creator()).publications[0];
  await expect(
    caller(user).economy.submitCharacter({
      ...update,
      clientRequestId: crypto.randomUUID(),
      expectedReviewVersion: 1,
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const version = row.reviewVersion,
    candidate = row.pendingSnapshot!;
  await caller(user).economy.submitCharacter(update);
  expect(
    (await caller(user).economy.creator()).publications[0].reviewVersion
  ).toBe(version);
  expect(await canReadMedia(liveKey)).toBe(true);
  expect(await canReadMedia(candidate.imageKey)).toBe(false);
  expect(await canReadMedia(candidate.imageKey, user)).toBe(true);
  expect(
    (await caller().economy.community({ selectedId: row.id })).find(
      item => item.id === row.id
    )?.snapshot.summary
  ).toBe(input.summary);
  await caller(undefined, true).economy.admin.moderate({
    id: row.id,
    expectedImageKey: candidate.imageKey,
    expectedReviewVersion: version,
    status: "rejected",
    note: "Please adjust the updated summary.",
  });
  row = (await caller(user).economy.creator()).publications[0];
  expect(row.status).toBe("published");
  expect(row.reviewState).toBe("rejected");
  await expect(
    caller(undefined, true).economy.admin.moderate({
      id: row.id,
      expectedImageKey: candidate.imageKey,
      expectedReviewVersion: version,
      status: "published",
      note: "Stale approval",
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await caller(user).economy.submitCharacter({
    ...update,
    clientRequestId: crypto.randomUUID(),
  });
  row = (await caller(user).economy.creator()).publications[0];
  await caller(undefined, true).economy.admin.moderate({
    id: row.id,
    expectedImageKey: row.pendingSnapshot!.imageKey,
    expectedReviewVersion: row.reviewVersion,
    status: "published",
    note: "Approved revised summary",
  });
  expect(
    (await caller().economy.community({ selectedId: row.id })).find(
      item => item.id === row.id
    )?.snapshot.summary
  ).toBe(update.summary);
  expect(
    (
      await (
        await db()
      )
        .select()
        .from(mediaDeletions)
        .where(eq(mediaDeletions.key, liveKey))
    ).length
  ).toBe(1);
  await caller(undefined, true).economy.admin.moderate({
    id: row.id,
    expectedImageKey: row.pendingSnapshot!.imageKey,
    expectedReviewVersion: row.reviewVersion + 1,
    status: "unlisted",
    note: "Withdrawn after review",
  });
  expect(
    (await caller().economy.community()).some(item => item.id === row.id)
  ).toBe(false);
});
it("keeps referral retries idempotent after first purchase and allows a second payout after the first resolves", async () => {
  const owner = await verified(),
    friend = await verified(),
    code = (await walletInfo(owner)).referralCode;
  await caller(friend).economy.claimReferral({ code });
  await handleCoinOrder(order(friend));
  await expect(caller(friend).economy.claimReferral({ code })).resolves.toEqual(
    { success: true }
  );
  await (await db()).insert(creatorEarnings).values({
    id: crypto.randomUUID(),
    userId: owner,
    requestId: crypto.randomUUID(),
    orderId: "audit-payout",
    units: 3000000,
    availableAt: new Date(Date.now() - 1000),
  });
  const first = crypto.randomUUID();
  await caller(owner).economy.requestPayout({ id: first, amountCents: 100 });
  await caller(undefined, true).economy.admin.settlePayout({
    id: first,
    status: "paid",
    reference: "audit-external-proof",
    note: "Synthetic external payment recorded",
  });
  stubProductConfig("billing.economy.coinsPerUsd", 10000);
  const second = crypto.randomUUID();
  await caller(owner).economy.requestPayout({ id: second, amountCents: 100 });
  expect((await caller(owner).economy.creator()).availableUnits).toBe(1000000);
  await caller(undefined, true).economy.admin.settlePayout({
    id: second,
    status: "rejected",
    reference: "",
    note: "Synthetic review rejected",
  });
  expect((await caller(owner).economy.creator()).availableUnits).toBe(2000000);
});
it("values earnings from the actual amount paid for a coin pack, independent of later exchange-rate settings", async () => {
  const owner = await verified(),
    buyer = await verified(),
    id = crypto.randomUUID();
  await (await db()).insert(communityCharacters).values({
    id,
    userId: owner,
    sourceId: 1,
    status: "published",
    snapshot: {
      name: "Original",
      summary: "Original adult",
      scenario: "At a cafe",
      personality: "warm",
      appearance: "adult",
      interests: "art",
      imageUrl: "/audit.png",
      imageKey: "audit.png",
      behavior: null,
    },
  });
  const role = await createTestGirlfriend({
      userId: buyer,
      communitySourceId: id,
      name: "Original",
      personality: "warm",
      appearance: "adult",
      referenceImageKey: "audit.png",
      referenceImageUrl: "/audit.png",
    }),
    conversation = await createConversation({
      userId: buyer,
      girlfriendId: role.id,
    });
  const event = order(buyer);
  event.data.attributes.total = 500;
  await handleCoinOrder(event);
  await withUserTransaction(buyer, tx =>
    reserveCoins(tx, buyer, "generation:audit-free", "chat", 55)
  );
  await withUserTransaction(buyer, tx =>
    reserveCoins(tx, buyer, "generation:audit-paid", "chat", 100)
  );
  stubProductConfig("billing.economy.coinsPerUsd", 99999);
  await withUserTransaction(buyer, tx =>
    settleCreatorEarnings(tx, {
      id: "audit-paid",
      userId: buyer,
      conversationId: conversation.id,
    })
  );
  expect(
    (await withUserTransaction(owner, tx => creatorBalance(tx, owner)))
      .heldUnits
  ).toBe(100000);
  // Adopting a scenario must not overflow the personality field.
  await (
    await db()
  )
    .update(communityCharacters)
    .set({
      snapshot: {
        name: "Original",
        summary: "Original adult",
        scenario: "x".repeat(1900),
        personality: "p".repeat(1900),
        appearance: "adult",
        interests: "art",
        imageUrl: "/audit.png",
        imageKey: "audit-adopt.png",
        behavior: null,
      },
    })
    .where(eq(communityCharacters.id, id));
  await storagePut(
    "audit-adopt.png",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    "image/png"
  );
  const reader = await verified(),
    adopted = await caller(reader).economy.adoptCharacter({ id });
  const [copy] = await (
    await db()
  )
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, adopted.id));
  expect(copy.personality).toHaveLength(1900);
  expect(copy.openingScenario).toHaveLength(1900);
  expect(
    buildChatSystemPrompt(await getPublishedProductConfig(), copy)
  ).toContain(`"openingScenario":"${"x".repeat(1900)}"`);
});

it("recovers a shared publication outside the latest page while keeping unapproved selections private", async () => {
  const a = await verified(),
    b = await verified();
  for (const [index, userId] of Array.from([a, b].entries()))
    await (await db()).insert(creatorProfiles).values({
      userId,
      handle: `p${index}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
      displayName: "Page audit",
      bio: "Public",
    });
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: crypto.randomUUID(),
    userId: index < 100 ? a : b,
    sourceId: index + 1,
    status: "published" as const,
    snapshot: {
      name: "Page audit",
      summary: "An original adult character.",
      scenario: "At a cafe",
      personality: "warm",
      appearance: "adult",
      interests: "art",
      imageUrl: "/audit.png",
      imageKey: `audit-${index}.png`,
      behavior: null,
    },
    createdAt: new Date(index === 0 ? 1000 : Date.now() + index * 1000),
  }));
  try {
    await (await db()).insert(communityCharacters).values(rows);
    expect(
      (await caller().economy.community()).some(row => row.id === rows[0].id)
    ).toBe(false);
    expect(
      (await caller().economy.community({ selectedId: rows[0].id })).some(
        row => row.id === rows[0].id
      )
    ).toBe(true);
    await (
      await db()
    )
      .update(communityCharacters)
      .set({ status: "pending" })
      .where(eq(communityCharacters.id, rows[0].id));
    expect(
      (await caller().economy.community({ selectedId: rows[0].id })).some(
        row => row.id === rows[0].id
      )
    ).toBe(false);
  } finally {
    await (await db()).delete(users).where(eq(users.id, a));
    await (await db()).delete(users).where(eq(users.id, b));
  }
});
