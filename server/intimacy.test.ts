/** 配置驱动的等级边界、变长等级表、时区窗口和动态姿势解锁。 */
import { describe, it, expect } from "vitest";
import {
  getLevelByPoints,
  getLevelInfo,
  getNextLevel,
  getPointsToNextLevel,
  getLevelProgress,
  isNightTime,
  getLevelGradient,
} from "../shared/intimacy";
import {
  localizeProductConfig,
  productConfigSchema,
} from "../shared/productConfig";
import { productFixture, productView } from "./testProductConfig";
const levels = productView.intimacy.levels;

describe("published intimacy calculations", () => {
  it.each([
    [0, 1],
    [49, 1],
    [50, 2],
    [149, 2],
    [150, 3],
    [500, 5],
    [3500, 10],
    [99999, 10],
  ])("maps %i XP to level %i", (points, level) => {
    expect(getLevelByPoints(points, levels).level).toBe(level);
  });
  it("uses supplied thresholds and level count for every derived value", () => {
    const custom = levels
      .slice(0, 3)
      .map((level, index) => ({ ...level, requiredPoints: index * 10 }));
    expect(getLevelByPoints(10, custom).level).toBe(2);
    expect(getLevelInfo(99, custom).level).toBe(3);
    expect(getLevelInfo(0, custom).level).toBe(1);
    expect(getNextLevel(3, custom)).toBeNull();
    expect(getPointsToNextLevel(15, custom)).toBe(5);
    expect(getLevelProgress(15, custom)).toBe(50);
    expect(getLevelProgress(100, custom)).toBe(100);
    expect(getLevelByPoints(NaN, custom).level).toBe(1);
  });
  it("builds colors from data rather than ungenerated Tailwind classes", () => {
    const custom = levels.map(level => ({
      ...level,
      gradientFrom: "#123456",
      gradientTo: "#abcdef",
    }));
    expect(getLevelGradient(4, custom)).toBe(
      "linear-gradient(to right, #123456, #abcdef)"
    );
  });
  it("interprets the configured time zone across midnight", () => {
    const night = { timeZone: "Asia/Shanghai", startHour: 22, endHour: 2 };
    expect(isNightTime(new Date("2026-10-21T14:00:00Z"), night)).toBe(true);
    expect(isNightTime(new Date("2026-10-21T18:00:00Z"), night)).toBe(false);
    expect(isNightTime(new Date("2026-10-21T17:59:00Z"), night)).toBe(true);
    expect(
      isNightTime(new Date("2026-10-21T12:00:00Z"), {
        ...night,
        startHour: 20,
        endHour: 21,
      })
    ).toBe(true);
  });
  it("derives advertised unlocks from enabled pose rules", () => {
    const config = structuredClone(productFixture);
    config.selfies.poses.find(pose => pose.id === "aegyo")!.minLevel = 4;
    config.selfies.poses.find(pose => pose.id === "intimate")!.enabled = false;
    const view = localizeProductConfig(config, "zh-CN");
    expect(view.intimacy.levels[1].unlocks).not.toContain("撒娇");
    expect(view.intimacy.levels[3].unlocks).toContain("撒娇");
    expect(view.intimacy.levels.flatMap(level => level.unlocks)).not.toContain(
      "亲密"
    );
  });
  it("rejects incomplete or contradictory executable rules", () => {
    const duplicate = structuredClone(productFixture);
    duplicate.intimacy.levels[1].requiredPoints = 0;
    expect(productConfigSchema.safeParse(duplicate).success).toBe(false);
    const unavailable = structuredClone(productFixture);
    unavailable.selfies.poses[0].minLevel = 100;
    expect(productConfigSchema.safeParse(unavailable).success).toBe(false);
    const threshold = structuredClone(productFixture);
    threshold.intimacy.rules.voice_message.bonusThreshold = null;
    expect(productConfigSchema.safeParse(threshold).success).toBe(false);
  });
});
