import { awardIntimacy } from "./relationship";
import { BusinessRuleError } from "./_core/businessError";
import { PROACTIVE_MESSAGES, proactiveTitle } from "../shared/notifications";
import type { LocalizedMessage } from "../shared/i18n";
/** 业务数据访问与状态写入。需要用户归属的底层方法由路由层先行校验。 */

import { TRPCError } from "@trpc/server";
import {
  eq,
  desc,
  and,
  like,
  sql,
  isNull,
  isNotNull,
  lte,
  inArray,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createUtcMysqlPool } from "./_core/mysql";
import {
  users,
  girlfriends,
  conversations,
  messages,
  selfies,
  apiConfigs,
  girlfriendMoods,
  notifications,
  memories,
  mediaDeletions,
  type Girlfriend,
  type InsertGirlfriend,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Selfie,
  type InsertSelfie,
  type ApiConfig,
  type InsertApiConfig,
  type GirlfriendMood,
  type InsertGirlfriendMood,
  type Notification,
  type InsertNotification,
} from "../drizzle/schema";

/** 按 UTC 连接池类型创建业务数据库，保留正确的 Promise Pool 类型。 */
function createDatabase(uri: string) {
  return drizzle(createUtcMysqlPool(uri));
}

let _db: ReturnType<typeof createDatabase> | null = null;

/**
 * 按需创建并缓存 MySQL 连接实例，未设置连接时返回 null。
 *
 * @remarks 创建实例不等于连接已通过健康检查，连通性由启动探针验证。
 */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = createDatabase(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** 事务内的数据访问接口，用于将相关写入组成同一提交。 */
export type DbTransaction = Parameters<
  Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]
>[0];

/** 判断驱动或 Drizzle 包装后的错误是否为可重试的事务死锁或锁等待超时。 */
function retryableTransaction(error: unknown): boolean {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const item = current as { code?: string; cause?: unknown };
    if (
      item.code === "ER_LOCK_DEADLOCK" ||
      item.code === "ER_LOCK_WAIT_TIMEOUT"
    )
      return true;
    current = item.cause;
  }
  return false;
}

/**
 * 锁定用户后执行 READ COMMITTED 事务，锁冲突最多重试三次。
 *
 * @remarks 回调仅包含可回滚 SQL 或幂等副作用；默认资料工厂会缓存一次结果。
 */
export async function withUserTransaction<T>(
  userId: string,
  action: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(
        async tx => {
          const [user] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .for("update");
          if (!user)
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "User no longer exists",
            });
          return action(tx);
        },
        { isolationLevel: "read committed" }
      );
    } catch (error) {
      if (attempt >= 3 || !retryableTransaction(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}

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
  if (data.isActive ?? true)
    await tx
      .update(girlfriends)
      .set({ isActive: false })
      .where(eq(girlfriends.userId, data.userId));
  const [result] = await tx.insert(girlfriends).values(data);
  const [created] = await tx
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, Number(result.insertId)));
  return created;
}

// 用户资料。

// Better-Auth 管理注册与登录，应用角色由数据库维护。

/** 按认证系统的用户标识读取应用用户资料，未找到时返回 undefined。 */
export async function getUserById(id: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** 保存用户的出生日期；调用方负责校验日期和成年条件。 */
export async function setUserBirthDate(
  userId: string,
  birthDate: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ birthDate }).where(eq(users.id, userId));
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
    await tx.update(girlfriends).set(data).where(eq(girlfriends.id, id));
    const profileFields = [
      "name",
      "personality",
      "appearance",
      "interests",
      "customPrompt",
      "avatarKey",
    ] as const;
    if (
      profileFields.some(
        key => data[key] !== undefined && data[key] !== target[key]
      )
    )
      await awardIntimacy(tx, id, userId, 5, "edit_profile");
  });
}

// 会话与消息。

/**
 * 在事务中锁定所属角色，复用最近会话或创建首个会话。
 *
 * @returns 角色存在且属于用户时返回会话，否则返回 undefined
 */
export async function resumeConversation(
  userId: string,
  girlfriendId: number
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    const [girlfriend] = await tx
      .select()
      .from(girlfriends)
      .where(
        and(
          eq(girlfriends.id, girlfriendId),
          eq(girlfriends.userId, userId),
          isNull(girlfriends.deletedAt)
        )
      )
      .limit(1)
      .for("update");
    if (!girlfriend) return undefined;
    const [latest] = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          eq(conversations.girlfriendId, girlfriendId)
        )
      )
      .orderBy(desc(conversations.updatedAt), desc(conversations.id))
      .limit(1);
    if (latest) return latest;
    const [result] = await tx
      .insert(conversations)
      .values({ userId, girlfriendId, title: `与 ${girlfriend.name} 的对话` });
    const [created] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, Number(result.insertId)))
      .limit(1);
    return created;
  });
}

/** 创建会话并返回保存结果；角色归属由调用方先行校验。 */
export async function createConversation(
  data: InsertConversation
): Promise<Conversation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(conversations).values(data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

/** 按最近更新时间倒序读取当前用户的全部会话。 */
export async function getUserConversations(
  userId: string
): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

/** 按会话编号及用户归属读取记录，未找到时返回 undefined。 */
export async function getConversation(
  id: number,
  userId: string
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);

  return result[0];
}

// 消息。

/**
 * 保存消息并更新所属会话的活动时间。
 *
 * @remarks 不在此处校验会话归属，消息写入与时间更新也不是同一事务。
 */
export async function createMessage(data: InsertMessage): Promise<Message> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(messages).values(data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(messages)
    .where(eq(messages.id, insertedId))
    .limit(1);

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, data.conversationId));

  return inserted[0]!;
}

/** 按创建时间正序读取会话全部消息；调用方必须先验证会话归属。 */
export async function getConversationMessages(
  conversationId: number
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt, messages.id);
}

/**
 * 读取会话最近若干条消息并按时间正序返回；归属由调用方校验。
 *
 * @param limit - 需要读取的最大消息条数
 */
export async function getRecentMessages(
  conversationId: number,
  limit: number
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  const allMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        sql`COALESCE(${messages.generationStatus}, 'succeeded') <> 'failed'`
      )
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);

  return allMessages.reverse(); // 返回时按时间正序
}

// 自拍。

/** 保存生成图片的相册元数据；文件写入和用户归属由调用方处理。 */
export async function createSelfie(data: InsertSelfie): Promise<Selfie> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(selfies).values(data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(selfies)
    .where(eq(selfies.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

/** 按创建时间倒序读取用户的相册记录。 */
export async function getUserSelfies(userId: string): Promise<Selfie[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(selfies)
    .where(eq(selfies.userId, userId))
    .orderBy(desc(selfies.createdAt));
}

/** 仅返回当前用户拥有且未删除的角色相册，拒绝读取其他账号的记录。 */
export async function getGirlfriendSelfies(
  girlfriendId: number,
  userId: string
): Promise<Selfie[]> {
  const db = await getDb();
  if (!db) return [];

  const role = await getActiveGirlfriend(userId, girlfriendId);
  if (!role)
    throw new TRPCError({ code: "NOT_FOUND", message: "Companion not found" });

  return db
    .select()
    .from(selfies)
    .where(
      and(eq(selfies.girlfriendId, girlfriendId), eq(selfies.userId, userId))
    )
    .orderBy(desc(selfies.createdAt));
}

/** 按用户归属删除自拍记录，并回收不再被角色、会话或相册引用的媒体。 */
export async function deleteSelfie(id: number, userId: string): Promise<void> {
  await withUserTransaction(userId, async tx => {
    const [photo] = await tx
      .select()
      .from(selfies)
      .where(and(eq(selfies.id, id), eq(selfies.userId, userId)))
      .for("update");
    if (!photo) return;
    await tx.delete(selfies).where(eq(selfies.id, id));
    await tx
      .insert(mediaDeletions)
      .values({ key: photo.imageKey, userId })
      .onDuplicateKeyUpdate({ set: { key: photo.imageKey } });
  });
  const { flushMediaDeletions } = await import("./mediaCleanup");
  await flushMediaDeletions(userId);
}

// API 偏好配置。

/**
 * 读取后创建或更新用户的模型、语音及提示词偏好。
 *
 * @remarks 不保存 API 密钥；首次并发写入仍受 userId 唯一约束限制。
 */
export async function upsertApiConfig(
  data: InsertApiConfig
): Promise<ApiConfig> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(apiConfigs)
    .where(eq(apiConfigs.userId, data.userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(apiConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(apiConfigs.userId, data.userId));

    const updated = await db
      .select()
      .from(apiConfigs)
      .where(eq(apiConfigs.userId, data.userId))
      .limit(1);

    return updated[0]!;
  } else {
    const result = await db.insert(apiConfigs).values(data);
    const insertedId = Number(result[0].insertId);

    const inserted = await db
      .select()
      .from(apiConfigs)
      .where(eq(apiConfigs.id, insertedId))
      .limit(1);

    return inserted[0]!;
  }
}

/** 读取用户偏好，尚未保存时返回 undefined。 */
export async function getUserApiConfig(
  userId: string
): Promise<ApiConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(apiConfigs)
    .where(eq(apiConfigs.userId, userId))
    .limit(1);

  return result[0];
}

// 角色软删除与回收站。

/** 按用户归属将角色移入回收站，并取消其激活状态。 */
export async function softDeleteGirlfriend(
  id: number,
  userId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(girlfriends)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)));
}

/** 依次将指定角色移入当前用户的回收站；多条记录分别写入。 */
export async function softDeleteGirlfriends(
  ids: number[],
  userId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const id of ids) {
    await db
      .update(girlfriends)
      .set({ deletedAt: new Date(), isActive: false })
      .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)));
  }
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
    const { cancelConversationGenerations } = await import("./generations");
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
    await tx.delete(girlfriends).where(eq(girlfriends.id, id));
    for (const key of Array.from(keys))
      await tx
        .insert(mediaDeletions)
        .values({ key, userId })
        .onDuplicateKeyUpdate({ set: { key } });
  });
  const { flushMediaDeletions } = await import("./mediaCleanup");
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

// 包含末条消息的会话列表。

/**
 * 读取用户会话并逐条补充最近消息与角色展示信息。
 *
 * @remarks 当前对每个会话额外查询消息和角色，尚未分页。
 */
export async function getConversationsWithLastMessage(userId: string): Promise<
  (Conversation & {
    lastMessage?: string;
    lastMessageAt?: Date;
    girlfriendName?: string;
    girlfriendImage?: string;
  })[]
> {
  const db = await getDb();
  if (!db) return [];

  // 获取用户所有对话
  const convos = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));

  // 为每个对话获取最后一条消息和女友信息
  const result = await Promise.all(
    convos.map(async convo => {
      // 获取最后一条消息
      const lastMsgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convo.id))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);

      // 获取女友信息
      const gfs = await db
        .select({
          name: girlfriends.name,
          referenceImageUrl: girlfriends.referenceImageUrl,
        })
        .from(girlfriends)
        .where(eq(girlfriends.id, convo.girlfriendId))
        .limit(1);

      const lastMsg = lastMsgs[0];
      const gf = gfs[0];

      return {
        ...convo,
        lastMessage: lastMsg?.content || undefined,
        lastMessageAt: lastMsg?.createdAt || undefined,
        girlfriendName: gf?.name || undefined,
        girlfriendImage: gf?.referenceImageUrl || undefined,
      };
    })
  );

  return result;
}

// 会话搜索。

/**
 * 按关键词匹配消息，再按用户归属筛选并补充会话信息。
 *
 * @remarks 当前先扫描全局匹配消息；LIKE 通配符未进行字面量转义，也未分页。
 */
export async function searchConversations(
  userId: string,
  keyword: string
): Promise<
  (Conversation & {
    lastMessage?: string;
    lastMessageAt?: Date;
    girlfriendName?: string;
    girlfriendImage?: string;
    matchedMessage?: string;
  })[]
> {
  const db = await getDb();
  if (!db) return [];

  // 搜索包含关键词的消息
  const matchedMsgs = await db
    .select({
      conversationId: messages.conversationId,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(like(messages.content, `%${keyword}%`))
    .orderBy(desc(messages.createdAt), desc(messages.id));

  // 获取去重的对话 ID 列表（保持匹配顺序）
  const seenConvoIds = new Set<number>();
  const matchedConvoData: { conversationId: number; matchedMessage: string }[] =
    [];
  for (const msg of matchedMsgs) {
    if (!seenConvoIds.has(msg.conversationId)) {
      seenConvoIds.add(msg.conversationId);
      matchedConvoData.push({
        conversationId: msg.conversationId,
        matchedMessage:
          msg.content.length > 60
            ? msg.content.substring(0, 60) + "..."
            : msg.content,
      });
    }
  }

  if (matchedConvoData.length === 0) return [];

  // 获取对话详情
  const result = await Promise.all(
    matchedConvoData.map(async ({ conversationId, matchedMessage }) => {
      const convoArr = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId)
          )
        )
        .limit(1);

      if (convoArr.length === 0) return null;
      const convo = convoArr[0];

      // 获取最后一条消息
      const lastMsgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convo.id))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);

      // 获取女友信息
      const gfs = await db
        .select({
          name: girlfriends.name,
          referenceImageUrl: girlfriends.referenceImageUrl,
        })
        .from(girlfriends)
        .where(eq(girlfriends.id, convo.girlfriendId))
        .limit(1);

      const lastMsg = lastMsgs[0];
      const gf = gfs[0];

      return {
        ...convo,
        lastMessage: lastMsg?.content || undefined,
        lastMessageAt: lastMsg?.createdAt || undefined,
        girlfriendName: gf?.name || undefined,
        girlfriendImage: gf?.referenceImageUrl || undefined,
        matchedMessage,
      };
    })
  );

  return result.filter((r): r is NonNullable<typeof r> => r !== null);
}

// 角色心情。

/** 按用户和角色编号读取心情记录。 */
export async function getGirlfriendMood(
  userId: string,
  girlfriendId: number
): Promise<GirlfriendMood | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getActiveGirlfriend(userId, girlfriendId)))
    throw new TRPCError({ code: "NOT_FOUND", message: "Companion not found" });

  const result = await db
    .select()
    .from(girlfriendMoods)
    .where(
      and(
        eq(girlfriendMoods.userId, userId),
        eq(girlfriendMoods.girlfriendId, girlfriendId)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/** 读取后创建或更新角色心情及对话计数；调用方负责角色归属。 */
export async function upsertGirlfriendMood(
  data: InsertGirlfriendMood
): Promise<GirlfriendMood> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(girlfriendMoods)
    .where(
      and(
        eq(girlfriendMoods.userId, data.userId),
        eq(girlfriendMoods.girlfriendId, data.girlfriendId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(girlfriendMoods)
      .set({
        mood: data.mood,
        moodScore: data.moodScore,
        lastChatAt: data.lastChatAt,
        totalMessages: data.totalMessages,
        todayMessages: data.todayMessages,
        lastMoodUpdate: new Date(),
      })
      .where(eq(girlfriendMoods.id, existing[0].id));

    const updated = await db
      .select()
      .from(girlfriendMoods)
      .where(eq(girlfriendMoods.id, existing[0].id))
      .limit(1);
    return updated[0]!;
  } else {
    const result = await db.insert(girlfriendMoods).values(data);
    const insertedId = Number(result[0].insertId);
    const inserted = await db
      .select()
      .from(girlfriendMoods)
      .where(eq(girlfriendMoods.id, insertedId))
      .limit(1);
    return inserted[0]!;
  }
}

/** 读取当前用户的全部角色心情记录。 */
export async function getAllGirlfriendMoods(
  userId: string
): Promise<GirlfriendMood[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(girlfriendMoods)
    .where(eq(girlfriendMoods.userId, userId));
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

// 站内通知。

/** 保存一条站内通知并返回数据库记录。 */
export async function createNotification(
  data: InsertNotification
): Promise<Notification> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(notifications).values(data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

/** 按创建时间倒序读取当前用户最近的站内通知。 */
export async function getUserNotifications(
  userId: string,
  limit = 20
): Promise<Notification[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** 统计当前用户尚未读过的站内通知数量。 */
export async function getUnreadNotificationCount(
  userId: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );

  return result[0]?.count ?? 0;
}

/** 按用户归属将指定通知标记为已读。 */
export async function markNotificationRead(
  id: number,
  userId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

/** 将当前用户的全部通知标记为已读。 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );
}

/** 从已注册的系统通知模板中随机选择消息标识。 */
export function getRandomProactiveMessage(
  type: keyof typeof PROACTIVE_MESSAGES,
  name: string
): { title: LocalizedMessage; content: LocalizedMessage } {
  const messages = PROACTIVE_MESSAGES[type];
  return {
    title: proactiveTitle(type, name),
    content: { key: messages[Math.floor(Math.random() * messages.length)] },
  };
}

// 检查是否应该发送主动消息（基于上次聊天时间和心情）
// 优先引用最近的 event 类记忆（"你上次说的面试怎么样了？"），
// 并把频率收紧为每用户每天最多 1 条 —— 主动消息的价值在于"她记得"，
// 不在于数量；高频模板消息是同类产品差评的高发区。
/** 在用户事务锁内按 UTC 自然日生成最多一条主动通知。 */
export async function checkAndCreateProactiveNotification(
  userId: string
): Promise<Notification | null> {
  return withUserTransaction(userId, async tx => {
    const now = new Date();
    const saveNotification = async (data: InsertNotification) => {
      const [result] = await tx
        .insert(notifications)
        .values({ ...data, createdAt: now });
      const [saved] = await tx
        .select()
        .from(notifications)
        .where(eq(notifications.id, Number(result.insertId)));
      return saved;
    };
    // 获取用户所有活跃女友
    const activeGirlfriends = await tx
      .select()
      .from(girlfriends)
      .where(
        and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt))
      );

    if (activeGirlfriends.length === 0) return null;

    // 随机选择一个女友
    const gf =
      activeGirlfriends[Math.floor(Math.random() * activeGirlfriends.length)];

    // 频控：每用户每天（UTC）最多 1 条主动通知
    const startOfDay = `${now.toISOString().slice(0, 10)} 00:00:00`;
    const endOfDay = `${new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)} 00:00:00`;
    const todayCount = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          sql`${notifications.createdAt} >= ${startOfDay} AND ${notifications.createdAt} < ${endOfDay}`
        )
      );
    if ((todayCount[0]?.count ?? 0) >= 1) return null;

    // 有新鲜的 event 记忆时，主动消息引用它
    const { getFreshEventMemory } = await import("./memory");
    const eventMemory = await getFreshEventMemory(userId, gf.id);
    if (eventMemory) {
      // 将原始记忆作为引用参数保留，句子结构由语言包决定。

      return await saveNotification({
        userId,
        girlfriendId: gf.id,
        title: {
          key: "notifications:title.thinkingOfYou",
          values: { name: gf.name },
        },
        content: {
          key: "notifications:memoryFollowUp",
          values: { memory: eventMemory.content },
        },
        type: "random",
        isRead: false,
      });
    }

    // 获取心情状态
    const mood = await tx
      .select()
      .from(girlfriendMoods)
      .where(
        and(
          eq(girlfriendMoods.userId, userId),
          eq(girlfriendMoods.girlfriendId, gf.id)
        )
      )
      .limit(1);

    // 根据心情和时间选择消息类型
    const hour = now.getHours();
    let messageType: keyof typeof PROACTIVE_MESSAGES;

    if (hour >= 6 && hour <= 8) {
      messageType = "good_morning";
    } else if (hour >= 22 || hour <= 1) {
      messageType = "good_night";
    } else if (mood.length > 0 && mood[0].moodScore < 40) {
      messageType = "miss_you";
    } else {
      messageType = Math.random() > 0.5 ? "random" : "miss_you";
    }

    const { title, content } = getRandomProactiveMessage(messageType, gf.name);

    const notification = await saveNotification({
      userId,
      girlfriendId: gf.id,
      title,
      content,
      type: messageType,
      isRead: false,
    });

    return notification;
  });
}

// 亲密度。

import { getLevelByPoints, calculateDecay } from "../shared/intimacy";

/** 读取并原子结算尚未处理的衰减天数，重复查询不会重复扣经验。 */
export async function getIntimacyInfo(girlfriendId: number, userId: string) {
  return withUserTransaction(userId, async tx => {
    const [gf] = await tx
      .select()
      .from(girlfriends)
      .where(
        and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
      )
      .for("update");
    if (!gf) throw new Error("Girlfriend not found");
    const result = calculateDecay(
      gf.intimacyPoints,
      gf.lastInteractionAt,
      gf.intimacyLevel,
      gf.lastDecayAt
    );
    const intimacyLevel = getLevelByPoints(result.points).level;
    await tx
      .update(girlfriends)
      .set({
        intimacyPoints: result.points,
        intimacyLevel,
        lastDecayAt: new Date(),
      })
      .where(eq(girlfriends.id, girlfriendId));
    return {
      intimacyLevel,
      intimacyPoints: result.points,
      lastInteractionAt: gf.lastInteractionAt,
      consecutiveDays: gf.consecutiveDays,
      decayed: result.decayed,
    };
  });
}

/**
 * 按角色编号读取基础亲密度信息，不计算衰减。
 *
 * @remarks 此方法不验证用户归属，调用方需要先行校验。
 */
export async function getGirlfriendIntimacy(girlfriendId: number): Promise<{
  intimacyLevel: number;
  intimacyPoints: number;
  consecutiveDays: number;
  lastInteractionAt: Date | null;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      intimacyLevel: girlfriends.intimacyLevel,
      intimacyPoints: girlfriends.intimacyPoints,
      consecutiveDays: girlfriends.consecutiveDays,
      lastInteractionAt: girlfriends.lastInteractionAt,
    })
    .from(girlfriends)
    .where(eq(girlfriends.id, girlfriendId))
    .limit(1);

  return result[0] || null;
}
