/** 数据库共享的滑动请求窗口，以及每日、每月额度计量。 */

import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { usageMeters, rateWindows } from "../../drizzle/schema";
import { getDb, type DbTransaction } from "../db";
import {
  RATE_LIMITS_PER_MINUTE,
  type RateLimitedAction,
} from "../../shared/quotas";

/** 以数据库行锁保护滑动窗口，多进程和重启共享同一请求频率。 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitedAction
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const limit = RATE_LIMITS_PER_MINUTE[action],
    now = Date.now();
  await db.transaction(async tx => {
    await tx
      .insert(rateWindows)
      .values({ userId, action, requests: [] })
      .onDuplicateKeyUpdate({ set: { userId } });
    const where = sql`${rateWindows.userId} = ${userId} AND ${rateWindows.action} = ${action}`;
    const [row] = await tx
      .select()
      .from(rateWindows)
      .where(where)
      .for("update");
    const requests = row.requests.filter(time => now - time < 60_000);
    if (requests.length >= limit)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Please wait ${Math.ceil((requests[0] + 60_000 - now) / 1000)}s and try again.`,
      });
    requests.push(now);
    await tx
      .update(rateWindows)
      .set({ requests, updatedAt: new Date() })
      .where(where);
  });
}

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
 * 在事务中锁定用户周期计量，原子判断是否还有足够额度。
 *
 * @param amount - 本次消费的正整数数量，默认一次
 * @remarks 拒绝的请求不会改变计数；未配置数据库时拒绝执行，避免绕过额度。
 */
export async function tryConsumePeriodMeter(
  userId: string,
  meter: string,
  limit: number,
  period: string,
  amount = 1
): Promise<MeterResult> {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 0
  ) {
    throw new Error(
      "Quota amount and limit must be nonnegative integers, with positive amount"
    );
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(tx =>
    tryConsumeMeterInTransaction(tx, userId, meter, limit, period, amount)
  );
}

/** 在调用方的现有事务内判定并消费额度，便于与业务写入一起回滚。 */
export async function tryConsumeMeterInTransaction(
  tx: DbTransaction,
  userId: string,
  meter: string,
  limit: number,
  period: string,
  amount = 1
): Promise<MeterResult> {
  // 唯一键冲突更新在事务结束前持有行锁，串行化同一周期的判定。
  await tx
    .insert(usageMeters)
    .values({ userId, period, meter, count: 0 })
    .onDuplicateKeyUpdate({ set: { count: sql`${usageMeters.count}` } });
  const where = sql`${usageMeters.userId} = ${userId} AND ${usageMeters.period} = ${period} AND ${usageMeters.meter} = ${meter}`;
  const [row] = await tx
    .select({ count: usageMeters.count })
    .from(usageMeters)
    .where(where)
    .for("update");
  const count = row.count;
  if (count > limit - amount) return { allowed: false, count, limit };
  await tx
    .update(usageMeters)
    .set({ count: count + amount })
    .where(where);
  return { allowed: true, count: count + amount, limit };
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
