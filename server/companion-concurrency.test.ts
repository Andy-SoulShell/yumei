/** 使用真实 MySQL 验证默认初始化、创建和恢复共用用户数量锁。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestUser } from "./testFixtures";
import {
  createDefaultGirlfriend,
  createGirlfriend,
  getUserGirlfriends,
  restoreGirlfriend,
  softDeleteGirlfriend,
} from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const profile = {
  name: "YUMEI",
  personality: "自然",
  appearance: "自然",
  referenceImageKey: "test-ref",
  referenceImageUrl: "https://example.test/ref",
  isActive: true,
};
afterEach(() => vi.unstubAllEnvs());

describe("companion lifecycle concurrency", () => {
  it("runs the default factory once and returns one role to all callers", async () => {
    const userId = await createTestUser();
    const factory = vi.fn(async () => ({ ...profile, userId }));
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createDefaultGirlfriend(userId, factory))
    );
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(await getUserGirlfriends(userId)).toHaveLength(1);
  });

  it("admits only one concurrent create when the plan allows one", async () => {
    const userId = await createTestUser();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        createGirlfriend({ ...profile, userId }, 1)
      )
    );
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await getUserGirlfriends(userId)).toHaveLength(1);
  });

  it("rejects restoring past the Free limit through the real router", async () => {
    vi.stubEnv("BILLING_PROVIDER", "free");
    const userId = await createTestUser();
    const old = await createGirlfriend({ ...profile, userId }, 1);
    await softDeleteGirlfriend(old.id, userId);
    const current = await createGirlfriend({ ...profile, userId }, 1);
    const caller = appRouter.createCaller({
      user: { id: userId },
      req: {},
      res: {},
    } as TrpcContext);
    await expect(
      caller.girlfriend.restore({ id: old.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await restoreGirlfriend(current.id, userId, 1);
    expect(await getUserGirlfriends(userId)).toHaveLength(1);
  });
});
