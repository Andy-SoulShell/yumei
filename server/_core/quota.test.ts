/** 覆盖请求频率、行为冷却与数据库每日计量。 */

import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";
import { RATE_LIMITS_PER_MINUTE } from "../../shared/quotas";
import { getDb } from "../database";
import {
  checkRateLimit,
  getDailyMeter,
  todayUTC,
  tryConsumeDailyMeter,
} from "./quota";

describe("shared sliding request windows", () => {
  it("admits exactly the cap under concurrent requests", async () => {
    const userId = `rate-${crypto.randomUUID()}`;
    const results = await Promise.allSettled(
      Array.from({ length: RATE_LIMITS_PER_MINUTE.selfie + 4 }, () =>
        checkRateLimit(userId, "selfie")
      )
    );
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(
      RATE_LIMITS_PER_MINUTE.selfie
    );
    expect(results.filter(row => row.status === "rejected")).toHaveLength(4);
    await expect(checkRateLimit(userId, "chat")).resolves.toBeUndefined();
    await expect(
      checkRateLimit(`other-${crypto.randomUUID()}`, "selfie")
    ).resolves.toBeUndefined();
  });
  it("shares windows across independently loaded server modules and expires old timestamps", async () => {
    const userId = `rate-restart-${crypto.randomUUID()}`;
    await checkRateLimit(userId, "selfie");
    const db = (await getDb())!;
    const { rateWindows } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(rateWindows)
      .set({ requests: Array(RATE_LIMITS_PER_MINUTE.selfie).fill(Date.now()) })
      .where(eq(rateWindows.userId, userId));
    vi.resetModules();
    const independent = await import("./quota");
    await expect(
      independent.checkRateLimit(userId, "selfie")
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await db
      .update(rateWindows)
      .set({ requests: [Date.now() - 61_000] })
      .where(eq(rateWindows.userId, userId));
    await expect(checkRateLimit(userId, "selfie")).resolves.toBeUndefined();
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
