import axios from "axios";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { subscriptions, billingEvents } from "../drizzle/schema";
import { getDb } from "./database";
import { createTestUser } from "./testFixtures";
import { productFixture } from "./testProductConfig";
import * as config from "./repositories/productConfig";
import {
  subscriptionPortal,
  readProviderSubscription,
} from "./subscriptionManagement";
import { getSubscription } from "./billing";
const snapshot = () => ({
  data: {
    data: {
      id: "901",
      type: "subscriptions",
      attributes: {
        customer_id: 90,
        user_email: "",
        variant_id: 999,
        status: "cancelled",
        updated_at: new Date().toISOString(),
        renews_at: null,
        ends_at: "2026-12-01T00:00:00Z",
        urls: {
          customer_portal:
            "https://store.lemonsqueezy.com/billing?signature=fresh",
          update_payment_method:
            "https://store.lemonsqueezy.com/payment?signature=fresh",
        },
      },
    },
  },
});
beforeEach(() => {
  vi.stubEnv("LEMONSQUEEZY_API_KEY", "qa-api-secret");
  const policy = structuredClone(productFixture);
  policy.billing.plans.find(p => p.id === "plus")!.lemonVariantId = "999";
  vi.spyOn(config, "getPublishedProductConfig").mockResolvedValue({
    ...policy,
    revision: 1,
    publishedAt: new Date(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function owner() {
  const id = await createTestUser();
  const db = (await getDb())!;
  const subId = String(Math.floor(Math.random() * 1e12));
  await db.insert(subscriptions).values({
    userId: id,
    lsSubscriptionId: subId,
    lsCustomerId: "90",
    plan: "plus",
    status: "active",
  });
  return { id, subId };
}
it("retrieves fresh links only for the authenticated account's bound subscription and refreshes local state", async () => {
  const a = await owner();
  const payload = snapshot();
  payload.data.data.id = a.subId;
  payload.data.data.attributes.user_email = `${a.id}@example.test`;
  const get = vi.spyOn(axios, "get").mockResolvedValue(payload);
  expect(await subscriptionPortal(a.id, "manage")).toEqual({
    url: "https://store.lemonsqueezy.com/billing?signature=fresh",
  });
  expect(get).toHaveBeenCalledWith(
    `https://api.lemonsqueezy.com/v1/subscriptions/${a.subId}`,
    expect.objectContaining({ maxRedirects: 0, timeout: 10000 })
  );
  expect((await getSubscription(a.id))?.status).toBe("cancelled");
  expect(await subscriptionPortal(a.id, "payment")).toEqual({
    url: "https://store.lemonsqueezy.com/payment?signature=fresh",
  });
});
it("does not invent an entitlement or call the provider for an account without a subscription", async () => {
  const id = await createTestUser(),
    get = vi.spyOn(axios, "get");
  expect(await readProviderSubscription(id)).toBeNull();
  expect(get).not.toHaveBeenCalled();
  expect(await getSubscription(id)).toBeNull();
});
it.each(["id", "customer"])(
  "rejects a mismatching provider %s without returning signed links or changing entitlement",
  async field => {
    const a = await owner(),
      payload = snapshot();
    payload.data.data.id = field === "id" ? "foreign" : a.subId;
    payload.data.data.attributes.user_email = `${a.id}@example.test`;
    if (field === "customer") payload.data.data.attributes.customer_id = 99999;
    vi.spyOn(axios, "get").mockResolvedValue(payload);
    await expect(subscriptionPortal(a.id, "manage")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect((await getSubscription(a.id))?.status).toBe("active");
  }
);
it("does not expose credentials, signed URLs or provider diagnostics on failure", async () => {
  const a = await owner();
  vi.spyOn(axios, "get").mockRejectedValue(
    new Error("qa-api-secret https://leaked.invalid/?signature=secret")
  );
  await expect(subscriptionPortal(a.id, "manage")).rejects.toThrow(
    "Subscription management is unavailable"
  );
  vi.stubEnv("LEMONSQUEEZY_API_KEY", "");
  await expect(subscriptionPortal(a.id, "manage")).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
});
it("rejects unsafe portal URLs", async () => {
  const a = await owner(),
    payload = snapshot();
  payload.data.data.id = a.subId;
  payload.data.data.attributes.user_email = `${a.id}@example.test`;
  payload.data.data.attributes.urls.customer_portal = "javascript:alert(1)";
  vi.spyOn(axios, "get").mockResolvedValue(payload);
  await expect(subscriptionPortal(a.id, "manage")).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
});
it("does not replace a newer subscription selected while a refresh was in flight", async () => {
  const a = await owner(),
    payload = snapshot();
  payload.data.data.id = a.subId;
  payload.data.data.attributes.user_email = `${a.id}@example.test`;
  vi.spyOn(axios, "get").mockImplementation(async () => {
    await (await getDb())!
      .update(subscriptions)
      .set({ lsSubscriptionId: a.subId + "new" })
      .where(eq(subscriptions.userId, a.id));
    return payload;
  });
  await expect(subscriptionPortal(a.id, "manage")).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  expect((await getSubscription(a.id))?.lsSubscriptionId).toBe(a.subId + "new");
  expect(
    await (await getDb())!
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.userId, a.id))
  ).toHaveLength(0);
});

it("does not give a customer portal for a payment email belonging to a different account", async () => {
  const a = await owner(),
    payload = snapshot();
  payload.data.data.id = a.subId;
  payload.data.data.attributes.user_email = "another@example.test";
  vi.spyOn(axios, "get").mockResolvedValue(payload);
  await expect(subscriptionPortal(a.id, "manage")).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  expect((await getSubscription(a.id))?.status).toBe("active");
});
