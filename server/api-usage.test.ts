import { stubProductConfig } from "./testProductConfig";
/** 通过真实业务接口验证套餐用量、BYOK 状态和升级入口。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";
import { tryConsumeDailyMeter } from "./_core/quota";
import { keyProvider } from "./_core/keyProvider";
import type { TrpcContext } from "./_core/context";

async function userCaller() {
  const userId = await createTestUser();
  return {
    userId,
    caller: appRouter.createCaller({
      user: { id: userId },
      req: {},
      res: {},
    } as TrpcContext),
  };
}
afterEach(() => vi.unstubAllEnvs());

describe("usage APIs", () => {
  it("returns the real free daily counters and no paid checkout links", async () => {
    stubProductConfig("billing.mode", "free");
    const { userId, caller } = await userCaller();
    await tryConsumeDailyMeter(userId, "chat", 30, 4);
    await tryConsumeDailyMeter(userId, "selfie", 1);
    const info = await caller.billing.getInfo();
    expect(info.tier).toBe("free");
    expect(info.usage).toMatchObject({
      chatToday: 4,
      chatLimit: 30,
      selfiesUsed: 1,
      selfieLimit: 1,
      selfiePeriod: "day",
    });
    expect(info.checkoutUrls).toEqual({});
    expect(await caller.selfie.quota()).toMatchObject({
      used: 1,
      remaining: 0,
      unlimited: false,
    });
  });

  it("reports saved BYOK without exposing credentials and isolates other users", async () => {
    stubProductConfig("billing.mode", "free");
    vi.stubEnv(
      "KEY_ENCRYPTION_KEY",
      "test-api-usage-encryption-secret-at-least-32-characters"
    );
    const first = await userCaller();
    const second = await userCaller();
    await keyProvider.setUserKey(
      first.userId,
      "openrouter",
      "sk-or-v1-private-test-key"
    );
    await tryConsumeDailyMeter(first.userId, "chat", 30, 3);
    const info = await first.caller.billing.getInfo();
    expect(info.byok.chat).toBe(true);
    expect(JSON.stringify(info)).not.toContain("private-test-key");
    const other = await second.caller.billing.getInfo();
    expect(other.byok.chat).toBe(false);
    expect(other.usage.chatToday).toBe(0);
  });

  it("returns unlocked self-host limits without creating fake subscription data", async () => {
    stubProductConfig("billing.mode", "none");
    const { caller } = await userCaller();
    const info = await caller.billing.getInfo();
    expect(info).toMatchObject({
      mode: "none",
      tier: "pro",
      subscription: null,
    });
    expect(await caller.selfie.quota()).toMatchObject({ unlimited: true });
  });
});
