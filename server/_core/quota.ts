/** 单进程请求频率和冷却窗口，以及数据库中的每日、每月额度计量。 */

import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { usageMeters } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  RATE_LIMITS_PER_MINUTE,
  type RateLimitedAction,
} from "../../shared/quotas";

// ---------------------------------------------------------------------------
// 进程内滑动窗口，每分钟限流。
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

// 定期清理过期窗口，避免长期运行时无限积累。
let lastSweep = Date.now();
/** 按需淘汰已经离开滑动窗口的请求记录，避免内存持续增长。 */
function sweepIfNeeded(now: number) {
  if (now - lastSweep < 5 * WINDOW_MS) return;
  lastSweep = now;
  requestLog.forEach((timestamps, key) => {
    const fresh = timestamps.filter((t: number) => now - t < WINDOW_MS);
    if (fresh.length === 0) requestLog.delete(key);
    else requestLog.set(key, fresh);
  });
}

/**
 * 检查并记录用户的一次请求，超过每分钟上限时抛出 TOO_MANY_REQUESTS。
 *
 * @remarks 窗口保存在当前进程内，重启及多实例不会共享状态。
 */
export function checkRateLimit(
  userId: string,
  action: RateLimitedAction
): void {
  const limit = RATE_LIMITS_PER_MINUTE[action];
  const now = Date.now();
  sweepIfNeeded(now);

  const key = `${userId}:${action}`;
  const timestamps = (requestLog.get(key) ?? []).filter(
    t => now - t < WINDOW_MS
  );

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

/** 清空请求窗口与行为冷却记录，仅用于测试隔离。 */
export function resetRateLimits(): void {
  requestLog.clear();
  cooldowns.clear();
}

// ---------------------------------------------------------------------------
// Action cooldowns (in-memory; used by intimacy anti-farming)
// ---------------------------------------------------------------------------

const cooldowns = new Map<string, number>();

/**
 * 判断用户的指定行为是否仍在冷却期内。
 *
 * @param minutes - 冷却时间，单位为分钟
 */
export function isOnCooldown(
  userId: string,
  action: string,
  minutes: number
): boolean {
  const last = cooldowns.get(`${userId}:${action}`);
  return last !== undefined && Date.now() - last < minutes * 60_000;
}

/** 记录用户行为的当前时间，供后续冷却判断使用。 */
export function markCooldown(userId: string, action: string): void {
  cooldowns.set(`${userId}:${action}`, Date.now());
}

// ---------------------------------------------------------------------------
// Daily meters (persistent)
// ---------------------------------------------------------------------------

/** 返回当前 UTC 自然日，格式为 YYYY-MM-DD。 */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 返回当前 UTC 自然月，格式为 YYYY-MM。 */
export function monthUTC(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 计算距下一个 UTC 零点的剩余秒数，向上取整。 */
function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}

/** 一次额度消费尝试的结果；count 是允许消费或回退后的观测计数。 */
export type MeterResult = {
  allowed: boolean;
  /** 本次允许消费或回退之后的观测用量。 */
  count: number;
  /** 该周期允许的最大消费数量。 */
  limit: number;
};

/**
 * 先递增周期用量，再读取计数；超限时减回本次增量。
 *
 * @param amount - 本次拟消费的数量，默认一次
 * @remarks 递增、读取和回退是独立 SQL，尚不能保证并发场景下的判定一致性；无数据库时按测试回退策略放行。
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

/** 按当前 UTC 日期尝试消费额度，超限通过 allowed 返回。 */
export async function tryConsumeDailyMeter(
  userId: string,
  meter: string,
  limit: number,
  amount = 1
): Promise<MeterResult> {
  return tryConsumePeriodMeter(userId, meter, limit, todayUTC(), amount);
}

/** 按当前 UTC 月份尝试消费额度，超限通过 allowed 返回。 */
export async function tryConsumeMonthlyMeter(
  userId: string,
  meter: string,
  limit: number,
  amount = 1
): Promise<MeterResult> {
  return tryConsumePeriodMeter(userId, meter, limit, monthUTC(), amount);
}

/** 消费每日额度，超限时抛出 TOO_MANY_REQUESTS 并附上重置时间提示。 */
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

/** 消费每月额度，超限时抛出 TOO_MANY_REQUESTS 并附上升级提示。 */
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

/** 读取当前 UTC 日期的指定用量，不存在或未配置数据库时返回零。 */
export async function getDailyMeter(
  userId: string,
  meter: string
): Promise<number> {
  return getPeriodMeter(userId, meter, todayUTC());
}

/** 读取当前 UTC 月份的指定用量，不存在或未配置数据库时返回零。 */
export async function getMonthlyMeter(
  userId: string,
  meter: string
): Promise<number> {
  return getPeriodMeter(userId, meter, monthUTC());
}

/** 按用户、周期及计量名称读取单条用量记录。 */
async function getPeriodMeter(
  userId: string,
  meter: string,
  period: string
): Promise<number> {
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
