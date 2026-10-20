/** 使用真实计量记录验证离线经验保留、夜间奖励和并发每日上限。 */
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usageMeters } from "../drizzle/schema";
import { getLevelByPoints } from "../shared/intimacy";
import { METERS } from "../shared/quotas";
import { getDailyMeter, todayUTC } from "./_core/quota";
import { getDb, withUserTransaction } from "./database";
import { awardIntimacy } from "./relationship";
import { createGirlfriend } from "./repositories/companions";
import { getIntimacyInfo } from "./repositories/intimacy";
import { createTestUser } from "./testFixtures";

const profile = {
  name: "YUMEI",
  personality: "自然",
  appearance: "自然",
  referenceImageKey: "test-ref",
  referenceImageUrl: "https://example.test/ref",
};
afterEach(() => vi.useRealTimers());

describe("intimacy persistence", () => {
  it("keeps the daily cap and non-text cooldown independent across roles", async () => {
    const userId = await createTestUser();
    const a = await createGirlfriend({ ...profile, userId });
    const b = await createGirlfriend({ ...profile, userId });
    const c = await createGirlfriend({ ...profile, userId });
    const db = (await getDb())!;
    await db.insert(usageMeters).values({
      userId,
      period: todayUTC(),
      meter: METERS.intimacyPoints(a.id),
      count: 200,
    });
    const award = (id: number) =>
      withUserTransaction(userId, tx =>
        awardIntimacy(tx, id, userId, 10, "selfie")
      );
    expect((await award(a.id)).pointsAdded).toBe(0);
    expect((await award(b.id)).pointsAdded).toBeGreaterThan(0);
    expect((await award(b.id)).pointsAdded).toBe(0);
    expect((await award(c.id)).pointsAdded).toBeGreaterThan(0);
    expect(await getDailyMeter(userId, METERS.intimacyPoints(a.id))).toBe(200);
  });
  it("preserves earned experience across concurrent reads and longer absence", async () => {
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
    expect(first.intimacyPoints).toBe(1234);
    const reads = await Promise.all(
      Array.from({ length: 6 }, () => getIntimacyInfo(gf.id, userId))
    );
    expect(reads.every(r => r.intimacyPoints === 1234 && r.decayed === 0)).toBe(
      true
    );
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    expect((await getIntimacyInfo(gf.id, userId)).intimacyPoints).toBe(1234);
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
      eq(usageMeters.meter, METERS.intimacyPoints(gf.id))
    );
    await db.insert(usageMeters).values({
      userId,
      period: todayUTC(),
      meter: METERS.intimacyPoints(gf.id),
      count: 195,
    });
    const award = () =>
      withUserTransaction(userId, tx =>
        awardIntimacy(tx, gf.id, userId, 5, "edit_profile")
      );
    expect((await award()).pointsAdded).toBe(0);
    expect(await getDailyMeter(userId, METERS.intimacyPoints(gf.id))).toBe(195);
    expect(
      await getDailyMeter(userId, METERS.intimacyReason(gf.id, "edit_profile"))
    ).toBe(0);
    await db.update(usageMeters).set({ count: 192 }).where(where);
    const results = await Promise.all(Array.from({ length: 3 }, () => award()));
    expect(results.map(r => r.pointsAdded).sort()).toEqual([0, 0, 8]);
    expect(await getDailyMeter(userId, METERS.intimacyPoints(gf.id))).toBe(200);
    expect((await getIntimacyInfo(gf.id, userId)).intimacyPoints).toBe(8);
  });
});
