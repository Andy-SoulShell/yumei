import { describe, it, expect } from "vitest";
import {
  getLevelByPoints,
  getLevelInfo,
  getNextLevel,
  getPointsToNextLevel,
  getLevelProgress,
  isNightTime,
  calculateDecay,
  getLevelGradient,
  INTIMACY_LEVELS,
  POINTS_RULES,
  DAILY_POINTS_LIMIT,
  DECAY_START_DAYS,
  DECAY_POINTS_PER_DAY,
} from "../shared/intimacy";

describe("Intimacy System - Constants", () => {
  it("should have 10 levels defined", () => {
    expect(INTIMACY_LEVELS).toHaveLength(10);
  });

  it("should have levels in ascending order of required points", () => {
    for (let i = 1; i < INTIMACY_LEVELS.length; i++) {
      expect(INTIMACY_LEVELS[i].requiredPoints).toBeGreaterThan(
        INTIMACY_LEVELS[i - 1].requiredPoints
      );
    }
  });

  it("should have level 1 starting at 0 points", () => {
    expect(INTIMACY_LEVELS[0].requiredPoints).toBe(0);
    expect(INTIMACY_LEVELS[0].level).toBe(1);
  });

  it("should have level 10 as the highest", () => {
    expect(INTIMACY_LEVELS[9].level).toBe(10);
    expect(INTIMACY_LEVELS[9].requiredPoints).toBe(3500);
  });

  it("should have daily points limit of 200", () => {
    expect(DAILY_POINTS_LIMIT).toBe(200);
  });

  it("should define all expected point rules", () => {
    const expectedTypes = [
      "text_message",
      "voice_message",
      "selfie",
      "daily_first",
      "edit_profile",
      "long_conversation",
      "night_chat",
    ];
    for (const type of expectedTypes) {
      expect(POINTS_RULES[type]).toBeDefined();
      expect(POINTS_RULES[type].basePoints).toBeGreaterThan(0);
    }
  });
});

describe("Intimacy System - getLevelByPoints", () => {
  it("should return level 1 for 0 points", () => {
    const level = getLevelByPoints(0);
    expect(level.level).toBe(1);
    expect(level.name).toBe("初识");
  });

  it("should return level 2 for 50 points", () => {
    const level = getLevelByPoints(50);
    expect(level.level).toBe(2);
    expect(level.name).toBe("熟悉");
  });

  it("should return level 5 for 500 points", () => {
    const level = getLevelByPoints(500);
    expect(level.level).toBe(5);
    expect(level.name).toBe("暧昧");
  });

  it("should return level 10 for 3500+ points", () => {
    const level = getLevelByPoints(3500);
    expect(level.level).toBe(10);
    expect(level.name).toBe("灵魂伴侣");
  });

  it("should return level 10 for very high points", () => {
    const level = getLevelByPoints(99999);
    expect(level.level).toBe(10);
  });

  it("should return level 1 for points between 0 and 49", () => {
    const level = getLevelByPoints(49);
    expect(level.level).toBe(1);
  });

  it("should handle boundary values correctly", () => {
    expect(getLevelByPoints(149).level).toBe(2);
    expect(getLevelByPoints(150).level).toBe(3);
    expect(getLevelByPoints(299).level).toBe(3);
    expect(getLevelByPoints(300).level).toBe(4);
  });
});

describe("Intimacy System - getLevelInfo", () => {
  it("should return correct info for level 1", () => {
    const info = getLevelInfo(1);
    expect(info.name).toBe("初识");
    expect(info.petName).toBe("你");
  });

  it("should return correct info for level 6", () => {
    const info = getLevelInfo(6);
    expect(info.name).toBe("恋人");
    expect(info.petName).toBe("老公");
  });

  it("should clamp to level 1 for invalid low values", () => {
    const info = getLevelInfo(0);
    expect(info.level).toBe(1);
  });

  it("should clamp to level 10 for invalid high values", () => {
    const info = getLevelInfo(99);
    expect(info.level).toBe(10);
  });
});

describe("Intimacy System - getNextLevel", () => {
  it("should return level 2 for current level 1", () => {
    const next = getNextLevel(1);
    expect(next).not.toBeNull();
    expect(next!.level).toBe(2);
  });

  it("should return null for max level 10", () => {
    const next = getNextLevel(10);
    expect(next).toBeNull();
  });

  it("should return level 6 for current level 5", () => {
    const next = getNextLevel(5);
    expect(next).not.toBeNull();
    expect(next!.level).toBe(6);
  });
});

describe("Intimacy System - getPointsToNextLevel", () => {
  it("should return 50 for 0 points (level 1 → 2)", () => {
    const points = getPointsToNextLevel(0);
    expect(points).toBe(50);
  });

  it("should return 25 for 25 points (level 1 → 2)", () => {
    const points = getPointsToNextLevel(25);
    expect(points).toBe(25);
  });

  it("should return null for max level", () => {
    const points = getPointsToNextLevel(3500);
    expect(points).toBeNull();
  });

  it("should calculate correctly at level boundaries", () => {
    // At 50 points (just reached level 2), next is level 3 at 150
    const points = getPointsToNextLevel(50);
    expect(points).toBe(100);
  });
});

describe("Intimacy System - getLevelProgress", () => {
  it("should return 0% at the start of level 1", () => {
    const progress = getLevelProgress(0);
    expect(progress).toBe(0);
  });

  it("should return 50% halfway through level 1", () => {
    const progress = getLevelProgress(25);
    expect(progress).toBe(50);
  });

  it("should return 100% at max level", () => {
    const progress = getLevelProgress(3500);
    expect(progress).toBe(100);
  });

  it("should return 0% at the start of a new level", () => {
    const progress = getLevelProgress(50); // Just reached level 2
    expect(progress).toBe(0);
  });
});

describe("Intimacy System - isNightTime", () => {
  it("should return true for 22:00", () => {
    const date = new Date();
    date.setHours(22, 0, 0, 0);
    expect(isNightTime(date)).toBe(true);
  });

  it("should return true for 23:30", () => {
    const date = new Date();
    date.setHours(23, 30, 0, 0);
    expect(isNightTime(date)).toBe(true);
  });

  it("should return true for 01:00", () => {
    const date = new Date();
    date.setHours(1, 0, 0, 0);
    expect(isNightTime(date)).toBe(true);
  });

  it("should return false for 12:00", () => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    expect(isNightTime(date)).toBe(false);
  });

  it("should return false for 08:00", () => {
    const date = new Date();
    date.setHours(8, 0, 0, 0);
    expect(isNightTime(date)).toBe(false);
  });
});

describe("Intimacy System - calculateDecay", () => {
  it("should not decay within 7 days", () => {
    const lastInteraction = new Date();
    lastInteraction.setDate(lastInteraction.getDate() - 5);
    const result = calculateDecay(100, lastInteraction, 3);
    expect(result.points).toBe(100);
    expect(result.decayed).toBe(0);
  });

  it("should decay after 7 days", () => {
    const lastInteraction = new Date();
    lastInteraction.setDate(lastInteraction.getDate() - 10); // 10 days ago
    const result = calculateDecay(100, lastInteraction, 1);
    // 3 decay days * 5 points = 15 decay
    expect(result.decayed).toBe(15);
    expect(result.points).toBe(85);
  });

  it("should not decay below current level minimum", () => {
    const lastInteraction = new Date();
    lastInteraction.setDate(lastInteraction.getDate() - 100); // 100 days ago
    // Level 3 starts at 150 points
    const result = calculateDecay(200, lastInteraction, 3);
    expect(result.points).toBe(150); // Clamped to level 3 minimum
    expect(result.decayed).toBe(50);
  });

  it("should handle null lastInteractionAt", () => {
    const result = calculateDecay(100, null, 1);
    expect(result.points).toBe(100);
    expect(result.decayed).toBe(0);
  });
});

describe("Intimacy System - getLevelGradient", () => {
  it("should return gradient for all levels", () => {
    for (let i = 1; i <= 10; i++) {
      const gradient = getLevelGradient(i);
      expect(gradient).toContain("from-");
      expect(gradient).toContain("to-");
    }
  });

  it("should return default gradient for invalid level", () => {
    const gradient = getLevelGradient(0);
    expect(gradient).toContain("from-");
  });
});
