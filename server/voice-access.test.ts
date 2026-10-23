/** 站点语音、套餐和 BYOK 能力必须与实际服务端权限一致，且不暴露凭据。 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscriptions } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { keyProvider } from "./_core/keyProvider";
import { getDb } from "./database";
import * as productRepository from "./repositories/productConfig";
import { appRouter } from "./routers";
import { productFixture } from "./testProductConfig";
import { createTestUser } from "./testFixtures";

beforeEach(() => {
  vi.stubEnv("OPERATOR_ELEVENLABS_KEY", "operator-eleven-secret");
  vi.stubEnv("OPERATOR_FISH_AUDIO_KEY", "operator-fish-secret");
  vi.stubEnv(
    "KEY_ENCRYPTION_KEY",
    "voice-test-encryption-key-at-least-32-characters"
  );
  vi.spyOn(productRepository, "getPublishedProductConfig").mockResolvedValue({
    ...structuredClone(productFixture),
    billing: {
      ...structuredClone(productFixture.billing),
      mode: "lemonsqueezy",
    },
    revision: 1,
    publishedAt: new Date(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function account(plan?: string) {
  const id = await createTestUser();
  if (plan)
    await (await getDb())!.insert(subscriptions).values({
      userId: id,
      lsSubscriptionId: crypto.randomUUID(),
      plan,
      status: "active",
    });
  return {
    id,
    caller: appRouter.createCaller({
      user: { id },
      req: {},
      res: {},
    } as TrpcContext),
  };
}
it("offers operator voices to an eligible subscriber with no BYOK", async () => {
  const { caller } = await account("plus");
  const result = await caller.apiConfig.get();
  expect(result.keys.elevenlabs.isSet).toBe(false);
  expect(result.voiceProviders).toEqual({
    elevenlabs: { configured: true, allowed: true, available: true },
    fishaudio: { configured: true, allowed: false, available: false },
  });
  expect(JSON.stringify(result)).not.toContain("operator-eleven-secret");
  expect(JSON.stringify(result)).not.toContain("operator-fish-secret");
});
it("distinguishes a missing service from a plan restriction", async () => {
  vi.stubEnv("OPERATOR_FISH_AUDIO_KEY", "");
  const { caller } = await account("pro");
  expect((await caller.apiConfig.get()).voiceProviders.fishaudio).toEqual({
    configured: false,
    allowed: true,
    available: false,
  });
  const free = await account();
  expect((await free.caller.apiConfig.get()).voiceProviders.elevenlabs).toEqual(
    {
      configured: true,
      allowed: false,
      available: false,
    }
  );
});
it("allows a user's BYOK and keeps another account restricted", async () => {
  const own = await account();
  const other = await account();
  await keyProvider.setUserKey(own.id, "fish-audio", "private-user-fish-key");
  const result = await own.caller.apiConfig.get();
  expect(result.voiceProviders.fishaudio.available).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private-user-fish-key");
  expect(
    (await other.caller.apiConfig.get()).voiceProviders.fishaudio.available
  ).toBe(false);
});
