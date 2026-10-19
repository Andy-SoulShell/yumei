/**
 * Server-side rate limiting and daily usage meters (M1-3 / issue #5).
 *
 * Two layers:
 *   1. `checkRateLimit` — in-memory, per-user, per-minute sliding window.
 *      Protects the server and upstream providers from bursts. Process-
 *      local by design; a multi-instance deployment moves this to Redis
 *      (tracked for Phase 5).
 *   2. `consumeDailyMeter` / `tryConsumeDailyMeter` — persistent daily
 *      counters in the `usageMeters` table. These are the free-tier caps
 *      from ADR 0005 and survive restarts. Increments are atomic upserts,
 *      so caps hold under concurrent requests.
 *
 * Test mode without a DB skips meters (same carve-out as db.ts).
 */

import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { usageMeters } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  RATE_LIMITS_PER_MINUTE,
  type RateLimitedAction,
} from "../../shared/quotas";

// ---------------------------------------------------------------------------
// Per-minute rate limits (in-memory sliding window)
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

// Bounded cleanup so the map doesn't grow forever on long uptimes.
let lastSweep = Date.now();
function sweepIfNeeded(now: number) {
  if (now - lastSweep < 5 * WINDOW_MS) return;
  lastSweep = now;
  requestLog.forEach((timestamps, key) => {
    const fresh = timestamps.filter((t: number) => now - t < WINDOW_MS);
    if (fresh.length === 0) requestLog.delete(key);
    else requestLog.set(key, fresh);
  });
}

/** Throws TOO_MANY_REQUESTS when the per-minute cap for this action is hit. */
export function checkRateLimit(userId: string, action: RateLimitedAction): void {
  const limit = RATE_LIMITS_PER_MINUTE[action];
  const now = Date.now();
  sweepIfNeeded(now);

  const key = `${userId}:${action}`;
  const timestamps = (requestLog.get(key) ?? []).filter(t => now - t < WINDOW_MS);

  if (timestamps.length >= limit) {
    const retryAfterSec = Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests. Please wait ${retryAfterSec}s and try again.`,
    });
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
}

/** Test helper — resets the in-memory window between test cases. */
export function resetRateLimits(): void {
  requestLog.clear();
  cooldowns.clear();
}

// ---------------------------------------------------------------------------
// Action cooldowns (in-memory; used by intimacy anti-farming)
// ---------------------------------------------------------------------------

const cooldowns = new Map<string, number>();

/** True when `action` was marked within the last `minutes` for this user. */
export function isOnCooldown(userId: string, action: string, minutes: number): boolean {
  const last = cooldowns.get(`${userId}:${action}`);
  return last !== undefined && Date.now() - last < minutes * 60_000;
}

export function markCooldown(userId: string, action: string): void {
  cooldowns.set(`${userId}:${action}`, Date.now());
}

// ---------------------------------------------------------------------------
// Daily meters (persistent)
// ---------------------------------------------------------------------------

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Calendar-month period key (M3 paid-tier meters), e.g. "2026-08". */
export function monthUTC(): string {
  return new Date().toISOString().slice(0, 7);
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}

export type MeterResult = {
  allowed: boolean;
  /** Count AFTER this consumption attempt (allowed or not). */
  count: number;
  limit: number;
};

/**
 * Atomically add `amount` to a period meter. If the result would exceed
 * `limit`, the increment is rolled back and `allowed: false` is returned.
 * Without a DB (test mode) everything is allowed.
 */
export async function tryConsumePeriodMeter(
  userId: string,
  meter: string,
  limit: number,
  period: string,
  amount = 1
): Promise<MeterResult> {
  const db = await getDb();
  if (!db) return { allowed: true, count: 0, limit };

  await db
    .insert(usageMeters)
    .values({ userId, period, meter, count: amount })
    .onDuplicateKeyUpdate({
      set: { count: sql`${usageMeters.count} + ${amount}` },
    });

  const rows = await db
    .select({ count: usageMeters.count })
    .from(usageMeters)
    .where(
      sql`${usageMeters.userId} = ${userId} AND ${usageMeters.period} = ${period} AND ${usageMeters.meter} = ${meter}`
    )
    .limit(1);

  const count = rows[0]?.count ?? amount;

  if (count > limit) {
    // Roll back so retries after midnight (or limit raises in M3) see an
    // accurate spend figure rather than denial-inflated counts.
    await db
      .update(usageMeters)
      .set({ count: sql`${usageMeters.count} - ${amount}` })
      .where(
        sql`${usageMeters.userId} = ${userId} AND ${usageMeters.period} = ${period} AND ${usageMeters.meter} = ${meter}`
      );
    return { allowed: false, count: count - amount, limit };
  }

  return { allowed: true, count, limit };
}

/** Daily wrapper around tryConsumePeriodMeter. */
export async function tryConsumeDailyMeter(
  userId: string,
  meter: string,
  limit: number,
  amount = 1
): Promise<MeterResult> {
  return tryConsumePeriodMeter(userId, meter, limit, todayUTC(), amount);
}

/** Monthly wrapper (M3 paid-tier meters). */
export async function tryConsumeMonthlyMeter(
  userId: string,
  meter: string,
  limit: number,
  amount = 1
): Promise<MeterResult> {
  return tryConsumePeriodMeter(userId, meter, limit, monthUTC(), amount);
}

/**
 * Like `tryConsumeDailyMeter` but throws a user-facing TOO_MANY_REQUESTS
 * with a reset hint. Use on hard daily caps.
 */
export async function consumeDailyMeter(
  userId: string,
  meter: string,
  limit: number,
  what: string,
  upsellHint = ""
): Promise<MeterResult> {
  const result = await tryConsumeDailyMeter(userId, meter, limit);
  if (!result.allowed) {
    const hours = Math.ceil(secondsUntilUtcMidnight() / 3600);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Daily limit reached (${limit} ${what}/day). Resets in about ${hours}h.${upsellHint}`,
    });
  }
  return result;
}

/** Monthly variant of consumeDailyMeter (M3 paid selfie quotas). */
export async function consumeMonthlyMeter(
  userId: string,
  meter: string,
  limit: number,
  what: string,
  upsellHint = ""
): Promise<MeterResult> {
  const result = await tryConsumeMonthlyMeter(userId, meter, limit);
  if (!result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Monthly limit reached (${limit} ${what}/month). Resets on the 1st.${upsellHint}`,
    });
  }
  return result;
}

/** Current spend on today's meter (0 when unset or no DB). */
export async function getDailyMeter(userId: string, meter: string): Promise<number> {
  return getPeriodMeter(userId, meter, todayUTC());
}

/** Current spend on this month's meter (0 when unset or no DB). */
export async function getMonthlyMeter(userId: string, meter: string): Promise<number> {
  return getPeriodMeter(userId, meter, monthUTC());
}

async function getPeriodMeter(userId: string, meter: string, period: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: usageMeters.count })
    .from(usageMeters)
    .where(
      sql`${usageMeters.userId} = ${userId} AND ${usageMeters.period} = ${period} AND ${usageMeters.meter} = ${meter}`
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}
