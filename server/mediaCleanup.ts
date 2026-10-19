/** 基于事务清理任务回收媒体，保留仍被其他记录引用的共享文件。 */
import { and, eq, or, sql } from "drizzle-orm";
import {
  girlfriends,
  mediaDeletions,
  messages,
  selfies,
} from "../drizzle/schema";
import { getDb, withUserTransaction, type DbTransaction } from "./db";
import { storageDelete } from "./storage";
import { log, providerErrorSummary } from "./_core/log";

/** 检查角色、相册和聊天消息是否仍引用媒体键。 */
async function hasReferences(
  db: DbTransaction | NonNullable<Awaited<ReturnType<typeof getDb>>>,
  key: string
) {
  const [role] = await db
    .select({ id: girlfriends.id })
    .from(girlfriends)
    .where(
      or(eq(girlfriends.referenceImageKey, key), eq(girlfriends.avatarKey, key))
    )
    .limit(1);
  if (role) return true;
  const [photo] = await db
    .select({ id: selfies.id })
    .from(selfies)
    .where(eq(selfies.imageKey, key))
    .limit(1);
  if (photo) return true;
  const [message] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.imageKey, key))
    .limit(1);
  return !!message;
}

/** 未清理成功且已无引用的媒体应立即停止从应用路由读取。 */
export async function isMediaPendingDeletion(key: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [task] = await db
    .select({ key: mediaDeletions.key })
    .from(mediaDeletions)
    .where(eq(mediaDeletions.key, key))
    .limit(1);
  return !!task && !(await hasReferences(db, key));
}

/** 将临时或写入失败的文件交给持久清理队列，不删除仍有业务引用的对象。 */
export async function queueMediaDeletion(
  userId: string,
  keys: string[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const key of Array.from(new Set(keys.filter(Boolean)))) {
    await db
      .insert(mediaDeletions)
      .values({ userId, key })
      .onDuplicateKeyUpdate({ set: { key } });
  }
  await flushMediaDeletions(userId);
}

/** 幂等处理最多二十项任务；对象删除失败时保留任务与重试次数。 */
export async function flushMediaDeletions(userId?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const tasks = await db
    .select()
    .from(mediaDeletions)
    .where(userId ? eq(mediaDeletions.userId, userId) : undefined)
    .orderBy(mediaDeletions.updatedAt)
    .limit(20);
  for (const task of tasks) {
    try {
      await withUserTransaction(task.userId, async tx => {
        const [pending] = await tx
          .select()
          .from(mediaDeletions)
          .where(eq(mediaDeletions.key, task.key))
          .for("update");
        if (!pending) return;
        if (!(await hasReferences(tx, task.key))) await storageDelete(task.key);
        await tx.delete(mediaDeletions).where(eq(mediaDeletions.key, task.key));
      });
    } catch (error) {
      await db
        .update(mediaDeletions)
        .set({
          attempts: sql`${mediaDeletions.attempts} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaDeletions.key, task.key),
            eq(mediaDeletions.userId, task.userId)
          )
        );
      log.error("[media] cleanup will retry", providerErrorSummary(error));
    }
  }
}

/** 启动独立于 Web Push 的每分钟清理重试，并返回退出时的停止函数。 */
export function startMediaCleanupScheduler(): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await flushMediaDeletions();
    } catch (error) {
      log.error("[media] cleanup unavailable", providerErrorSummary(error));
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
