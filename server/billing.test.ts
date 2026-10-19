/** 覆盖计费模式、套餐映射、签名与订阅更新。 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { billingEvents } from "../drizzle/schema";
import { createHmac } from "node:crypto";
import { nanoid } from "nanoid";
import {
  getBillingMode,
  getUserTier,
  getSubscription,
  handleLemonEvent as handleProviderEvent,
  isBillingEnforced,
  resolvePlan,
  verifyLemonSignature,
} from "./billing";
import { createTestUser } from "./testFixtures";
import { getDb } from "./db";
import { TIER_LIMITS } from "../shared/quotas";

let eventSequence = 0;
async function handleLemonEvent(
  payload: Parameters<typeof handleProviderEvent>[0]
) {
  if (payload.meta?.custom_data?.user_id)
    await createTestUser(payload.meta.custom_data.user_id);
  return handleProviderEvent(payload);
}

const SECRET = "test-webhook-secret";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(Buffer.from(body)).digest("hex");
}

function subscriptionPayload(overrides: {
  userId: string;
  subId?: string;
  event?: string;
  status?: string;
  variantName?: string;
  endsAt?: string | null;
}) {
  return {
    meta: {
      event_name: overrides.event ?? "subscription_created",
      custom_data: { user_id: overrides.userId },
    },
    data: {
      id: overrides.subId ?? `ls-${nanoid(8)}`,
      attributes: {
        customer_id: 12345,
        updated_at: new Date(Date.now() + eventSequence++ * 1000).toISOString(),
        status: overrides.status ?? "active",
        renews_at: "2027-01-01T00:00:00.000000Z",
        ends_at: overrides.endsAt ?? null,
        variant_id: 999,
        variant_name: overrides.variantName ?? "Plus Monthly",
        product_name: "YUMEI",
      },
    },
  };
}

beforeEach(() => {
  delete process.env.BILLING_PROVIDER;
  delete process.env.LEMONSQUEEZY_VARIANT_PLUS;
  delete process.env.LEMONSQUEEZY_VARIANT_PRO;
});

afterEach(() => {
  delete process.env.BILLING_PROVIDER;
});

describe("billing modes", () => {
  it("defaults to free (caps enforced, no paid tiers)", async () => {
    expect(getBillingMode()).toBe("free");
    expect(isBillingEnforced()).toBe(true);
    expect(await getUserTier("any-user")).toBe("free");
  });

  it("none = self-host: pro tier, nothing enforced", async () => {
    process.env.BILLING_PROVIDER = "none";
    expect(isBillingEnforced()).toBe(false);
    expect(await getUserTier("any-user")).toBe("pro");
  });

  it("falls back to free on unknown values", () => {
    process.env.BILLING_PROVIDER = "stripe";
    expect(getBillingMode()).toBe("free");
  });
});

describe("verifyLemonSignature", () => {
  it("accepts a correct HMAC and rejects everything else", () => {
    const body = '{"hello":"world"}';
    const good = sign(body);
    expect(verifyLemonSignature(Buffer.from(body), good, SECRET)).toBe(true);
    expect(verifyLemonSignature(Buffer.from(body), good, "other-secret")).toBe(
      false
    );
    expect(verifyLemonSignature(Buffer.from(body + " "), good, SECRET)).toBe(
      false
    );
    expect(verifyLemonSignature(Buffer.from(body), "", SECRET)).toBe(false);
    expect(verifyLemonSignature(Buffer.from(body), good, "")).toBe(false);
  });
});

describe("resolvePlan", () => {
  it("prefers explicit variant-id mapping", () => {
    process.env.LEMONSQUEEZY_VARIANT_PLUS = "111";
    process.env.LEMONSQUEEZY_VARIANT_PRO = "222";
    expect(resolvePlan({ variant_id: 111, variant_name: "Pro" })).toBe("plus");
    expect(resolvePlan({ variant_id: 222, variant_name: "Plus" })).toBe("pro");
  });

  it("falls back to name matching", () => {
    expect(resolvePlan({ variant_name: "YUMEI Plus (monthly)" })).toBe("plus");
    expect(resolvePlan({ product_name: "Pro Annual" })).toBe("pro");
    expect(resolvePlan({ variant_name: "Mystery Box" })).toBeNull();
  });
});

describe("webhook state machine (DB)", () => {
  it("created -> active plus tier", async () => {
    if (!(await getDb())) return;
    process.env.BILLING_PROVIDER = "lemonsqueezy";
    const userId = `bill-user-${nanoid(8)}`;

    const result = await handleLemonEvent(subscriptionPayload({ userId }));
    expect(result.ok).toBe(true);
    expect(await getUserTier(userId)).toBe("plus");
  });

  it("upgrade to pro via subscription_updated", async () => {
    if (!(await getDb())) return;
    process.env.BILLING_PROVIDER = "lemonsqueezy";
    const userId = `bill-user-${nanoid(8)}`;
    const subId = `ls-${nanoid(8)}`;

    await handleLemonEvent(subscriptionPayload({ userId, subId }));
    await handleLemonEvent(
      subscriptionPayload({
        userId,
        subId,
        event: "subscription_updated",
        variantName: "Pro Monthly",
      })
    );
    expect(await getUserTier(userId)).toBe("pro");
  });

  it("cancelled keeps access until endsAt, then drops to free", async () => {
    if (!(await getDb())) return;
    process.env.BILLING_PROVIDER = "lemonsqueezy";
    const userId = `bill-user-${nanoid(8)}`;
    const subId = `ls-${nanoid(8)}`;

    await handleLemonEvent(subscriptionPayload({ userId, subId }));

    // Cancelled but paid through a future date → still plus.
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await handleLemonEvent(
      subscriptionPayload({
        userId,
        subId,
        event: "subscription_cancelled",
        status: "cancelled",
        endsAt: future,
      })
    );
    expect(await getUserTier(userId)).toBe("plus");

    // Expired in the past → free.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await handleLemonEvent(
      subscriptionPayload({
        userId,
        subId,
        event: "subscription_expired",
        status: "expired",
        endsAt: past,
      })
    );
    expect(await getUserTier(userId)).toBe("free");
  });

  it("payment invoice does not override the canonical subscription snapshot", async () => {
    if (!(await getDb())) return;
    process.env.BILLING_PROVIDER = "lemonsqueezy";
    const userId = `bill-user-${nanoid(8)}`;
    const subId = `ls-${nanoid(8)}`;

    await handleLemonEvent(subscriptionPayload({ userId, subId }));
    // Payment events reference the sub via attributes.subscription_id.
    const result = await handleLemonEvent({
      meta: {
        event_name: "subscription_payment_failed",
        custom_data: { user_id: userId },
      },
      data: { id: "inv-1", attributes: { subscription_id: subId as any } },
    } as any);
    expect(result.ok).toBe(true);
    expect(await getUserTier(userId)).toBe("plus"); // past_due grace
  });

  it("rejects events without user attribution", async () => {
    if (!(await getDb())) return;
    const result = await handleLemonEvent({
      meta: { event_name: "subscription_created" },
      data: { id: "x", attributes: {} },
    });
    expect(result.ok).toBe(false);
  });

  it("ignores unrelated events", async () => {
    const result = await handleLemonEvent({
      meta: { event_name: "order_created", custom_data: { user_id: "u" } },
      data: { id: "x", attributes: {} },
    });
    expect(result.ok).toBe(true);
    expect((result as any).ignored).toBeTruthy();
  });
});

describe("tier limits shape", () => {
  it("matches the frozen tier table", () => {
    expect(TIER_LIMITS.free.dailyMessages).toBe(30);
    expect(TIER_LIMITS.free.dailySelfies).toBe(1);
    expect(TIER_LIMITS.free.maxGirlfriends).toBe(1);
    expect(TIER_LIMITS.free.voiceTranscription).toBe(false);
    expect(TIER_LIMITS.plus.dailyMessages).toBe(500);
    expect(TIER_LIMITS.plus.monthlySelfies).toBe(30);
    expect(TIER_LIMITS.plus.ttsProviders).toContain("elevenlabs");
    expect(TIER_LIMITS.pro.dailyMessages).toBeNull();
    expect(TIER_LIMITS.pro.monthlySelfies).toBe(100);
    expect(TIER_LIMITS.pro.maxGirlfriends).toBeNull();
    expect(TIER_LIMITS.pro.ttsProviders).toContain("fishaudio");
  });
});

describe("billing event ordering regressions", () => {
  it("does not reactivate expired access for delayed payment failures or recoveries", async () => {
    process.env.BILLING_PROVIDER = "lemonsqueezy";
    const userId = `expired-${nanoid(8)}`;
    const subId = `ls-${nanoid(8)}`;
    await handleLemonEvent(
      subscriptionPayload({
        userId,
        subId,
        status: "expired",
        event: "subscription_expired",
        endsAt: new Date(Date.now() - 86_400_000).toISOString(),
      })
    );
    for (const event of [
      "subscription_payment_failed",
      "subscription_payment_recovered",
      "subscription_payment_success",
    ]) {
      await handleLemonEvent({
        meta: { event_name: event, custom_data: { user_id: userId } },
        data: {
          id: `invoice-${event}`,
          attributes: { subscription_id: subId },
        },
      });
      expect(await getUserTier(userId)).toBe("free");
      expect((await getSubscription(userId))?.status).toBe("expired");
    }
  });

  it("ignores older and equal-version snapshots and deduplicates concurrent retries", async () => {
    const userId = `ordered-${nanoid(8)}`;
    const subId = `ls-${nanoid(8)}`;
    const expired = subscriptionPayload({
      userId,
      subId,
      status: "expired",
      event: "subscription_expired",
    });
    expired.data.attributes.updated_at = "2026-10-19T02:00:00.123Z";
    const results = await Promise.all(
      Array.from({ length: 6 }, () => handleLemonEvent(expired))
    );
    expect(results.filter(r => r.ok && !r.ignored)).toHaveLength(1);
    const old = subscriptionPayload({
      userId,
      subId,
      status: "active",
      event: "subscription_updated",
    });
    for (const time of [
      "2026-10-19T01:00:00.000Z",
      "2026-10-19T02:00:00.123Z",
    ]) {
      old.data.attributes.updated_at = time;
      expect(await handleLemonEvent(old)).toMatchObject({
        ok: true,
        ignored: "stale subscription snapshot",
      });
    }
    expect((await getSubscription(userId))?.status).toBe("expired");
    const receipts = await (await getDb())!
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.userId, userId));
    expect(receipts).toHaveLength(3);
  });

  it("does not extend the seven-day overdue grace on later failed-payment snapshots", async () => {
    process.env.BILLING_PROVIDER = "lemonsqueezy";
    const userId = `grace-${nanoid(8)}`;
    const subId = `ls-${nanoid(8)}`;
    const first = subscriptionPayload({ userId, subId, status: "past_due" });
    first.data.attributes.updated_at = new Date(
      Date.now() - 8 * 86_400_000
    ).toISOString();
    await handleLemonEvent(first);
    await handleLemonEvent(
      subscriptionPayload({
        userId,
        subId,
        status: "past_due",
        event: "subscription_updated",
      })
    );
    expect(await getUserTier(userId)).toBe("free");
  });

  it("rejects a subscription belonging to another user", async () => {
    const subId = `ls-${nanoid(8)}`;
    const owner = `owner-${nanoid(8)}`;
    await handleLemonEvent(subscriptionPayload({ userId: owner, subId }));
    expect(
      await handleLemonEvent(
        subscriptionPayload({ userId: `other-${nanoid(8)}`, subId })
      )
    ).toMatchObject({ ok: false, error: "subscription owner mismatch" });
    expect((await getSubscription(owner))?.lsSubscriptionId).toBe(subId);
  });
});
