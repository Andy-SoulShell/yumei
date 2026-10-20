/** companions 领域的数据访问与事务边界。 */
import { TRPCError } from "@trpc/server";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import {
  conversations,
  conversationSummaries,
  girlfriendMoods,
  girlfriends,
  mediaDeletions,
  memories,
  memoryEmbeddings,
  aiTaskRuns,
  memoryExtractionJobs,
  memorySuppressions,
  messages,
  notifications,
  selfies,
  type Girlfriend,
  type InsertGirlfriend,
} from "../../drizzle/schema";
import { BusinessRuleError } from "../_core/businessError";
import { resolveCompanionBehavior } from "../../shared/companionBehavior";
import { getDb, withUserTransaction, type DbTransaction } from "../database";
import { publishMedia } from "../managedMedia";
import { awardIntimacy } from "../relationship";

/** 在用户锁内检查未删除角色数量，null 表示不限制。 */
async function checkCompanionLimit(
  tx: DbTransaction,
  userId: string,
  maximum: number | null
) {
  if (maximum === null) return;
  const [row] = await tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(girlfriends)
    .where(and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt)));
  if (Number(row.count) >= maximum)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "UPGRADE_REQUIRED",
      cause: new BusinessRuleError({ reason: "UPGRADE_REQUIRED" }),
    });
}

/** 在现有用户事务内插入并读取角色。 */
async function insertGirlfriend(
  tx: DbTransaction,
  data: InsertGirlfriend
): Promise<Girlfriend> {
  await publishMedia(tx, data.userId, [data.referenceImageKey, data.avatarKey]);
  if (data.isActive ?? true)
    await tx
      .update(girlfriends)
      .set({ isActive: false })
      .where(eq(girlfriends.userId, data.userId));
  const [result] = await tx
    .insert(girlfriends)
    .values({ ...data, behavior: resolveCompanionBehavior(data.behavior) });
  const [created] = await tx
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, Number(result.insertId)));
  return created;
}

// 陪伴角色。

/** 锁定用户后原子校验数量、切换激活状态并创建角色。 */
export async function createGirlfriend(
  data: InsertGirlfriend,
  maximum: number | null = null
): Promise<Girlfriend> {
  return withUserTransaction(data.userId, async tx => {
    await checkCompanionLimit(tx, data.userId, maximum);
    return insertGirlfriend(tx, data);
  });
}

/** 读取用户未删除的角色；传入角色编号时按编号读取，否则查找激活角色。 */
export async function getActiveGirlfriend(
  userId: string,
  girlfriendId?: number
): Promise<Girlfriend | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.userId, userId),
        girlfriendId === undefined
          ? eq(girlfriends.isActive, true)
          : eq(girlfriends.id, girlfriendId),
        isNull(girlfriends.deletedAt)
      )
    )
    .limit(1);

  return result[0];
}

/** 按创建时间倒序列出用户未删除的角色。 */
export async function getUserGirlfriends(
  userId: string
): Promise<Girlfriend[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(girlfriends)
    .where(and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt)))
    .orderBy(desc(girlfriends.createdAt));
}

/**
 * 按用户归属更新角色，切换激活状态时先停用同用户的其他角色。
 *
 * @remarks 在用户事务锁内先验证目标，失败及并发切换不会破坏激活状态。
 */
export async function updateGirlfriend(
  id: number,
  userId: string,
  data: Partial<InsertGirlfriend>
): Promise<void> {
  await withUserTransaction(userId, async tx => {
    const [target] = await tx
      .select()
      .from(girlfriends)
      .where(
        and(
          eq(girlfriends.id, id),
          eq(girlfriends.userId, userId),
          isNull(girlfriends.deletedAt)
        )
      )
      .for("update");
    if (!target)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Companion not found",
      });
    if (data.isActive) {
      await tx
        .update(girlfriends)
        .set({ isActive: false })
        .where(eq(girlfriends.userId, userId));
    }
    await publishMedia(tx, userId, [data.avatarKey]);
    await tx.update(girlfriends).set(data).where(eq(girlfriends.id, id));
    if (
      target.avatarKey &&
      data.avatarKey !== undefined &&
      target.avatarKey !== data.avatarKey
    )
      await tx
        .insert(mediaDeletions)
        .values({ key: target.avatarKey, userId })
        .onDuplicateKeyUpdate({ set: { availableAt: new Date() } });
    const profileFields = [
      "name",
      "personality",
      "appearance",
      "interests",
      "customPrompt",
      "behavior",
      "avatarKey",
    ] as const;
    if (
      profileFields.some(
        key =>
          data[key] !== undefined &&
          JSON.stringify(data[key]) !== JSON.stringify(target[key])
      )
    )
      await awardIntimacy(tx, id, userId, 5, "edit_profile");
  });
}

// 角色软删除与回收站。

/** 按用户归属将角色移入回收站，并取消其激活状态。 */
export async function softDeleteGirlfriend(
  id: number,
  userId: string
): Promise<void> {
  await withUserTransaction(userId, async tx => {
    await tx
      .update(girlfriends)
      .set({
        deletedAt: new Date(),
        isActive: false,
        memoryEpoch: sql`${girlfriends.memoryEpoch} + 1`,
      })
      .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)));
    await tx
      .delete(memoryExtractionJobs)
      .where(
        and(
          eq(memoryExtractionJobs.girlfriendId, id),
          eq(memoryExtractionJobs.userId, userId)
        )
      );
    await tx
      .delete(memoryEmbeddings)
      .where(
        and(
          eq(memoryEmbeddings.girlfriendId, id),
          eq(memoryEmbeddings.userId, userId)
        )
      );
    await tx
      .delete(conversationSummaries)
      .where(
        and(
          eq(conversationSummaries.girlfriendId, id),
          eq(conversationSummaries.userId, userId)
        )
      );
  });
}

/** 依次将指定角色移入当前用户的回收站；多条记录分别写入。 */
export async function softDeleteGirlfriends(
  ids: number[],
  userId: string
): Promise<void> {
  for (const id of ids) await softDeleteGirlfriend(id, userId);
}

/** 恢复回收站角色时在用户事务内校验套餐数量；重复恢复不额外占用名额。 */
export async function restoreGirlfriend(
  id: number,
  userId: string,
  maximum: number | null = null
): Promise<void> {
  await withUserTransaction(userId, async tx => {
    const [target] = await tx
      .select()
      .from(girlfriends)
      .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)));
    if (!target || !target.deletedAt) return;
    await checkCompanionLimit(tx, userId, maximum);
    await tx
      .update(girlfriends)
      .set({ deletedAt: null })
      .where(eq(girlfriends.id, id));
  });
}

/** 在用户事务内删除角色全部关联记录，并写入可重试的媒体清理任务。 */
export async function permanentDeleteGirlfriend(
  id: number,
  userId: string
): Promise<void> {
  await withUserTransaction(userId, async tx => {
    const [gf] = await tx
      .select()
      .from(girlfriends)
      .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)))
      .for("update");
    if (!gf) return;
    const convos = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.girlfriendId, id),
          eq(conversations.userId, userId)
        )
      );
    const ids = convos.map(c => c.id);
    const { cancelConversationGenerations } = await import("../generations");
    await cancelConversationGenerations(tx, ids);
    const photos = await tx
      .select({ key: selfies.imageKey })
      .from(selfies)
      .where(and(eq(selfies.girlfriendId, id), eq(selfies.userId, userId)));
    const imageMessages = ids.length
      ? await tx
          .select({ key: messages.imageKey })
          .from(messages)
          .where(inArray(messages.conversationId, ids))
      : [];
    const keys = new Set(
      [
        gf.referenceImageKey,
        gf.avatarKey,
        ...photos.map(p => p.key),
        ...imageMessages.map(m => m.key),
      ].filter((key): key is string => !!key)
    );
    if (ids.length)
      await tx.delete(messages).where(inArray(messages.conversationId, ids));
    await tx
      .delete(conversations)
      .where(
        and(
          eq(conversations.girlfriendId, id),
          eq(conversations.userId, userId)
        )
      );
    await tx
      .delete(selfies)
      .where(and(eq(selfies.girlfriendId, id), eq(selfies.userId, userId)));
    await tx
      .delete(memories)
      .where(and(eq(memories.girlfriendId, id), eq(memories.userId, userId)));
    await tx
      .delete(memoryEmbeddings)
      .where(
        and(
          eq(memoryEmbeddings.girlfriendId, id),
          eq(memoryEmbeddings.userId, userId)
        )
      );
    await tx
      .delete(conversationSummaries)
      .where(
        and(
          eq(conversationSummaries.girlfriendId, id),
          eq(conversationSummaries.userId, userId)
        )
      );
    // 预算凭证不含正文，删除角色不能重置当天已发生的外部调用次数。
    await tx
      .update(aiTaskRuns)
      .set({ girlfriendId: null })
      .where(
        and(eq(aiTaskRuns.girlfriendId, id), eq(aiTaskRuns.userId, userId))
      );
    await tx
      .delete(memorySuppressions)
      .where(
        and(
          eq(memorySuppressions.girlfriendId, id),
          eq(memorySuppressions.userId, userId)
        )
      );
    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.girlfriendId, id),
          eq(notifications.userId, userId)
        )
      );
    await tx
      .delete(girlfriendMoods)
      .where(
        and(
          eq(girlfriendMoods.girlfriendId, id),
          eq(girlfriendMoods.userId, userId)
        )
      );
    await tx
      .delete(memoryExtractionJobs)
      .where(
        and(
          eq(memoryExtractionJobs.userId, userId),
          eq(memoryExtractionJobs.girlfriendId, id)
        )
      );
    await tx.delete(girlfriends).where(eq(girlfriends.id, id));
    for (const key of Array.from(keys))
      await tx
        .insert(mediaDeletions)
        .values({ key, userId })
        .onDuplicateKeyUpdate({ set: { key } });
  });
  const { flushMediaDeletions } = await import("../mediaCleanup");
  await flushMediaDeletions(userId);
}

/** 按删除时间倒序读取当前用户的回收站角色。 */
export async function getTrashGirlfriends(
  userId: string
): Promise<Girlfriend[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(girlfriends)
    .where(
      and(eq(girlfriends.userId, userId), isNotNull(girlfriends.deletedAt))
    )
    .orderBy(desc(girlfriends.deletedAt));
}

/**
 * 永久删除当前用户回收站中已满七天的角色。
 *
 * @returns 本次找到并完成处理的过期角色数量
 */
export async function cleanupExpiredTrash(userId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const expired = await db
    .select({ id: girlfriends.id })
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.userId, userId),
        isNotNull(girlfriends.deletedAt),
        lte(girlfriends.deletedAt, sevenDaysAgo)
      )
    );

  for (const gf of expired) {
    await permanentDeleteGirlfriend(gf.id, userId);
  }

  return expired.length;
}

// 默认角色初始化。

/**
 * 在用户事务锁内复用已有角色，否则惰性创建默认角色。
 *
 * @param createData - 仅胜出请求执行，用于准备参考图等默认资料
 */
export async function createDefaultGirlfriend(
  userId: string,
  createData: () => Promise<InsertGirlfriend>
): Promise<Girlfriend> {
  let prepared: Promise<InsertGirlfriend> | undefined;
  return withUserTransaction(userId, async tx => {
    const [existing] = await tx
      .select()
      .from(girlfriends)
      .where(and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt)))
      .limit(1);
    if (existing) return existing;
    const data = await (prepared ??= createData());
    return insertGirlfriend(tx, { ...data, userId });
  });
}
