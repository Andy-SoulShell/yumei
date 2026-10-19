/** 使用真实计量记录验证衰减幂等、夜间奖励和并发每日上限。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { usageMeters } from "../drizzle/schema";
import { getLevelByPoints } from "../shared/intimacy";
import { createGirlfriend, getDb, getIntimacyInfo } from "./db";
import { createTestUser } from "./testFixtures";
import { appRouter } from "./routers";
import { getDailyMeter, todayUTC } from "./_core/quota";
import type { TrpcContext } from "./_core/context";

const profile = {
  name: "YUMEI",
  personality: "自然",
  appearance: "自然",
  referenceImageKey: "test-ref",
  referenceImageUrl: "https://example.test/ref",
};
afterEach(() => vi.useRealTimers());

describe("intimacy persistence", () => {
  it("decays each inactive day once, including concurrent reads and the following day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const userId = await createTestUser();
    const gf = await createGirlfriend({
      ...profile,
      userId,
      intimacyPoints: 1234,
      intimacyLevel: getLevelByPoints(1234).level,
      lastInteractionAt: new Date("2026-10-09T12:00:00Z"),
    });
    const first = await getIntimacyInfo(gf.id, userId);
    expect(first.intimacyPoints).toBe(1219);
    const reads = await Promise.all(
      Array.from({ length: 6 }, () => getIntimacyInfo(gf.id, userId))
    );
    expect(reads.every(r => r.intimacyPoints === 1219 && r.decayed === 0)).toBe(
      true
    );
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    expect((await getIntimacyInfo(gf.id, userId)).intimacyPoints).toBe(1214);
  });

  it("includes the night bonus in admission and rolls back the reason meter on refusal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T23:00:00Z"));
    const userId = await createTestUser();
    const gf = await createGirlfriend({ ...profile, userId });
    const db = (await getDb())!;
    const where = and(
      eq(usageMeters.userId, userId),
      eq(usageMeters.period, todayUTC()),
      eq(usageMeters.meter, "intimacy:points")
    );
    await db.insert(usageMeters).values({
      userId,
      period: todayUTC(),
      meter: "intimacy:points",
      count: 195,
    });
    const caller = appRouter.createCaller({
      user: { id: userId },
      req: {},
      res: {},
    } as TrpcContext);
    const input = { girlfriendId: gf.id, reason: "edit_profile" as const };
    expect((await caller.girlfriend.addPoints(input)).pointsAdded).toBe(0);
    expect(await getDailyMeter(userId, "intimacy:points")).toBe(195);
    expect(await getDailyMeter(userId, "intimacy:edit_profile")).toBe(0);
    await db.update(usageMeters).set({ count: 192 }).where(where);
    const results = await Promise.all(
      Array.from({ length: 3 }, () => caller.girlfriend.addPoints(input))
    );
    expect(results.map(r => r.pointsAdded).sort()).toEqual([0, 0, 8]);
    expect(await getDailyMeter(userId, "intimacy:points")).toBe(200);
    expect((await getIntimacyInfo(gf.id, userId)).intimacyPoints).toBe(8);
  });
});
