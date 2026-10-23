/** 基于事务清理任务回收媒体，保留仍被其他记录引用的共享文件。 */
import { cleanupManagementAuthentication } from "./managementAuth";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  girlfriends,
  communityCharacters,
  generationRequests,
  mediaDeletions,
  messages,
  rateWindows,
  selfies,
  voiceTranscriptions,
  users,
  verifications,
} from "../drizzle/schema";
import { log, providerErrorSummary } from "./_core/log";
import { getDb, type DbTransaction } from "./database";
import { storageDelete } from "./storage";

/** 检查用户头像、角色、相册和聊天消息是否仍引用媒体键。 */
async function hasReferences(
  db: DbTransaction | NonNullable<Awaited<ReturnType<typeof getDb>>>,
  key: string
) {
  const [publication] = await db
    .select({ id: communityCharacters.id })
    .from(communityCharacters)
    .where(
      or(
        sql`JSON_UNQUOTE(JSON_EXTRACT(${communityCharacters.snapshot}, '$.imageKey'))=${key}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${communityCharacters.pendingSnapshot}, '$.imageKey'))=${key}`
      )
    )
    .limit(1);
  if (publication) return true;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.image, `/files/${key}`))
    .limit(1);
  if (user) return true;
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
  const [imageInput] = await db
    .select({ id: generationRequests.id })
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.status, "pending"),
        or(
          eq(generationRequests.temporaryKey, key),
          sql`JSON_CONTAINS(JSON_EXTRACT(${generationRequests.imageTask}, '$.references[*].key'), JSON_QUOTE(${key}))`
        )
      )
    )
    .limit(1);
  if (imageInput) return true;
  const [video] = await db
    .select({ id: generationRequests.id })
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.kind, "video"),
        eq(generationRequests.status, "pending"),
        sql`JSON_UNQUOTE(JSON_EXTRACT(${generationRequests.videoTask}, '$.referenceKey')) = ${key}`
      )
    )
    .limit(1);
  if (video) return true;
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
  const [pending] = await db
    .select()
    .from(mediaDeletions)
    .where(eq(mediaDeletions.key, key));
  if (!pending) return false;
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, pending.userId))
    .limit(1);
  return (
    ((!owner && !key.startsWith("official-")) ||
      pending.deleting ||
      pending.availableAt.getTime() <= Date.now()) &&
    !(await hasReferences(db, key))
  );
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
      .values({ userId, key, availableAt: new Date() })
      .onDuplicateKeyUpdate({ set: { key, availableAt: new Date() } });
  }
  await flushMediaDeletions(userId);
}

/** 幂等处理最多二十项任务；对象删除失败时保留任务与重试次数。 */
export async function flushMediaDeletions(userId?: string): Promise<void> {
  const rules = (await getPublishedProductConfig()).runtime.maintenance;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const tasks = await db
    .select()
    .from(mediaDeletions)
    .where(
      and(
        userId ? eq(mediaDeletions.userId, userId) : undefined,
        lte(mediaDeletions.availableAt, new Date()),
        or(
          isNull(mediaDeletions.leaseUntil),
          lte(mediaDeletions.leaseUntil, new Date())
        )
      )
    )
    .orderBy(mediaDeletions.updatedAt)
    .limit(rules.mediaBatchSize);
  for (const task of tasks) {
    try {
      const claim = async (tx: DbTransaction) => {
        const [pending] = await tx
          .select()
          .from(mediaDeletions)
          .where(eq(mediaDeletions.key, task.key))
          .for("update");
        if (
          !pending ||
          (pending.leaseUntil && pending.leaseUntil.getTime() > Date.now())
        )
          return false;
        if (await hasReferences(tx, task.key)) {
          await tx
            .delete(mediaDeletions)
            .where(eq(mediaDeletions.key, task.key));
          return false;
        }
        await tx
          .update(mediaDeletions)
          .set({
            deleting: true,
            leaseUntil: new Date(Date.now() + rules.mediaLeaseMs),
          })
          .where(eq(mediaDeletions.key, task.key));
        return true;
      };
      // 官方上传来自独立管理会话，不存在对应的用户行；清理仍通过任务行锁互斥。
      const claimed = await db.transaction(
        async tx => {
          // 注销账号已无用户行，仍需回收遗留对象；存在的账号继续使用同一用户锁。
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, task.userId))
            .for("update");
          return claim(tx);
        },
        { isolationLevel: "read committed" }
      );
      if (!claimed) continue;
      await storageDelete(task.key);
      await db.delete(mediaDeletions).where(eq(mediaDeletions.key, task.key));
    } catch (error) {
      await db
        .update(mediaDeletions)
        .set({
          attempts: sql`${mediaDeletions.attempts} + 1`,
          updatedAt: new Date(),
          leaseUntil: null,
          availableAt: new Date(
            Date.now() +
              Math.min(
                rules.mediaRetryMaxMs,
                rules.mediaRetryBaseMs *
                  2 ** Math.min(task.attempts, rules.mediaRetryMaxExponent)
              )
          ),
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
  const running = new Set<string>();
  const tasks: [string, () => Promise<void>][] = [
    ["media", () => flushMediaDeletions()],
    [
      "generations",
      async () => {
        const module = await import("./generations");
        await module.expireGenerations();
      },
    ],
    [
      "memories",
      async () => {
        const module = await import("./memoryJobs");
        await module.runMemoryExtractionJobs();
      },
    ],
    ["management", cleanupManagementAuthentication],
    [
      "expiry",
      async () => {
        const db = await getDb();
        if (!db) return;
        await db
          .delete(voiceTranscriptions)
          .where(lte(voiceTranscriptions.expiresAt, new Date()));
        await db
          .delete(verifications)
          .where(
            and(
              lte(verifications.expiresAt, new Date()),
              or(
                sql`${verifications.identifier} LIKE 'account-deletion:%'`,
                sql`${verifications.identifier} LIKE 'deletion-receipt:%'`
              )
            )
          );
        await db
          .delete(rateWindows)
          .where(
            and(
              sql`${rateWindows.action} <> 'management'`,
              lte(
                rateWindows.updatedAt,
                new Date(
                  Date.now() -
                    (await getPublishedProductConfig()).runtime.maintenance
                      .rateWindowRetentionMs
                )
              )
            )
          );
      },
    ],
  ];
  const run = () => {
    for (const [name, action] of tasks) {
      if (running.has(name)) continue;
      running.add(name);
      void action()
        .catch(error =>
          log.error("[background] task unavailable", {
            task: name,
            ...providerErrorSummary(error),
          })
        )
        .finally(() => running.delete(name));
    }
  };
  run();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = async () => {
    let interval = 1000;
    try {
      interval = (await getPublishedProductConfig()).runtime.maintenance.tickMs;
    } catch (error) {
      log.error(
        "[background] configuration unavailable",
        providerErrorSummary(error)
      );
    }
    if (!stopped) {
      timer = setTimeout(() => {
        run();
        void schedule();
      }, interval);
      timer.unref();
    }
  };
  void schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
