/** 推送状态按浏览器端点和账号共同检查，缺少私钥时不提供可用配置。 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { savePushSubscription } from "./push";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
});
afterEach(() => vi.unstubAllEnvs());
const caller = (userId: string) =>
  appRouter.createCaller({
    user: { id: userId },
    req: {},
    res: {},
  } as TrpcContext);
it("distinguishes this device, other devices and endpoints belonging to another account", async () => {
  const userId = await createTestUser();
  const otherId = await createTestUser();
  const ownEndpoint = `https://push.example.test/${crypto.randomUUID()}`;
  const otherEndpoint = `https://push.example.test/${crypto.randomUUID()}`;
  await savePushSubscription(userId, {
    endpoint: ownEndpoint,
    keys: { p256dh: "public", auth: "auth" },
  });
  await savePushSubscription(otherId, {
    endpoint: otherEndpoint,
    keys: { p256dh: "other", auth: "other" },
  });
  expect(
    (await caller(userId).push.status({ endpoint: ownEndpoint })).subscribed
  ).toBe(true);
  expect(
    (await caller(userId).push.status({ endpoint: null })).subscribed
  ).toBe(false);
  expect(
    (
      await caller(userId).push.status({
        endpoint: "https://push.example.test/unsubscribed",
      })
    ).subscribed
  ).toBe(false);
  expect(
    (await caller(userId).push.status({ endpoint: otherEndpoint })).subscribed
  ).toBe(false);
});
it("reports push unavailable when only a public key is configured", async () => {
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  const api = caller(await createTestUser());
  expect(await api.push.publicKey()).toEqual({ key: null });
  expect((await api.push.status({ endpoint: null })).configured).toBe(false);
});
