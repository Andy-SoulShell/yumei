/** 覆盖请求频率、行为冷却与数据库每日计量。 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  resetRateLimits,
  isOnCooldown,
  markCooldown,
  tryConsumeDailyMeter,
  getDailyMeter,
  todayUTC,
} from "./quota";
import { RATE_LIMITS_PER_MINUTE } from "../../shared/quotas";
import { getDb } from "../db";
import { nanoid } from "nanoid";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests under the per-minute cap", () => {
    for (let i = 0; i < RATE_LIMITS_PER_MINUTE.selfie; i++) {
      expect(() => checkRateLimit("rl-user-1", "selfie")).not.toThrow();
    }
  });

  it("throws TOO_MANY_REQUESTS once the cap is hit", () => {
    for (let i = 0; i < RATE_LIMITS_PER_MINUTE.selfie; i++) {
      checkRateLimit("rl-user-2", "selfie");
    }
    expect(() => checkRateLimit("rl-user-2", "selfie")).toThrowError(
      /Too many requests/
    );
  });

  it("tracks users independently", () => {
    for (let i = 0; i < RATE_LIMITS_PER_MINUTE.selfie; i++) {
      checkRateLimit("rl-user-3", "selfie");
    }
    expect(() => checkRateLimit("rl-user-4", "selfie")).not.toThrow();
  });

  it("tracks actions independently", () => {
    for (let i = 0; i < RATE_LIMITS_PER_MINUTE.selfie; i++) {
      checkRateLimit("rl-user-5", "selfie");
    }
    expect(() => checkRateLimit("rl-user-5", "chat")).not.toThrow();
  });
});

describe("cooldowns (intimacy anti-farming)", () => {
  beforeEach(() => resetRateLimits());

  it("is not on cooldown before marking", () => {
    expect(isOnCooldown("cd-user-1", "text_message", 1)).toBe(false);
  });

  it("is on cooldown right after marking", () => {
    markCooldown("cd-user-2", "text_message");
    expect(isOnCooldown("cd-user-2", "text_message", 1)).toBe(true);
  });

  it("scopes cooldowns per action", () => {
    markCooldown("cd-user-3", "text_message");
    expect(isOnCooldown("cd-user-3", "voice_message", 1)).toBe(false);
  });
});

describe("daily meters (free-tier caps, )", () => {
  it("returns a YYYY-MM-DD period key", () => {
    expect(todayUTC()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("counts up to the limit and then denies (DB-backed)", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL required");

    const userId = `meter-user-${nanoid(8)}`;
    const first = await tryConsumeDailyMeter(userId, "chat", 2);
    const second = await tryConsumeDailyMeter(userId, "chat", 2);
    const third = await tryConsumeDailyMeter(userId, "chat", 2);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.count).toBe(2);
    expect(third.allowed).toBe(false);
    // Denied attempts must not inflate the persisted spend.
    expect(await getDailyMeter(userId, "chat")).toBe(2);
  });

  it("supports weighted consumption (intimacy points)", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL required");

    const userId = `meter-user-${nanoid(8)}`;
    const big = await tryConsumeDailyMeter(userId, "intimacy:points", 200, 150);
    expect(big.allowed).toBe(true);
    const over = await tryConsumeDailyMeter(
      userId,
      "intimacy:points",
      200,
      100
    );
    expect(over.allowed).toBe(false);
    const fit = await tryConsumeDailyMeter(userId, "intimacy:points", 200, 50);
    expect(fit.allowed).toBe(true);
    expect(await getDailyMeter(userId, "intimacy:points")).toBe(200);
  });

  it("scopes meters per user and per meter name", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL required");

    const a = `meter-user-${nanoid(8)}`;
    const b = `meter-user-${nanoid(8)}`;
    await tryConsumeDailyMeter(a, "selfie", 1);
    const otherUser = await tryConsumeDailyMeter(b, "selfie", 1);
    const otherMeter = await tryConsumeDailyMeter(a, "chat", 30);
    expect(otherUser.allowed).toBe(true);
    expect(otherMeter.allowed).toBe(true);
  });
});

describe("quota concurrency", () => {
  it("admits exactly one request for the final slot", async () => {
    const user = `quota-last-${nanoid(8)}`;
    await tryConsumeDailyMeter(user, "chat", 30, 29);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => tryConsumeDailyMeter(user, "chat", 30))
    );
    expect(results.filter(r => r.allowed)).toHaveLength(1);
    expect(await getDailyMeter(user, "chat")).toBe(30);
  });
  it("admits exactly the available slots from an empty meter", async () => {
    const user = `quota-empty-${nanoid(8)}`;
    const results = await Promise.all(
      Array.from({ length: 12 }, () => tryConsumeDailyMeter(user, "chat", 4))
    );
    expect(results.filter(r => r.allowed)).toHaveLength(4);
    expect(await getDailyMeter(user, "chat")).toBe(4);
  });
});
