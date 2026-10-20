/** conversations 领域的数据访问与事务边界。 */
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  conversations,
  girlfriends,
  messages,
  type Conversation,
  type InsertConversation,
  type InsertMessage,
  type Message,
} from "../../drizzle/schema";
import { getDb } from "../database";

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

// 包含末条消息的会话列表。

/** 会话摘要使用一条有索引的查询读取，游标按活动时间和编号稳定排序。 */
export type ConversationCursor = { updatedAt: Date; id: number };

export type ConversationPreview = Conversation & {
  lastMessage?: string;
  lastMessageAt?: Date;
  girlfriendName?: string;
  girlfriendImage?: string;
  matchedMessage?: string;
  matchedMessageId?: number;
};

export async function getConversationsWithLastMessage(
  userId: string,
  options: {
    cursor?: ConversationCursor | null;
    limit?: number;
    search?: string;
    ids?: number[];
  } = {}
): Promise<ConversationPreview[]> {
  const db = await getDb();
  if (!db) return [];
  if (options.ids?.length === 0) return [];
  const cursor = options.cursor;
  const pattern = "%" + (options.search || "").replace(/[!%_]/g, "!$&") + "%";
  const rows = await db
    .select({
      ...getTableColumns(conversations),
      lastMessage: messages.content,
      lastMessageAt: messages.createdAt,
      girlfriendName: girlfriends.name,
      girlfriendImage: girlfriends.referenceImageUrl,
    })
    .from(conversations)
    .innerJoin(
      girlfriends,
      and(
        eq(girlfriends.id, conversations.girlfriendId),
        eq(girlfriends.userId, userId)
      )
    )
    .leftJoin(
      messages,
      eq(
        messages.id,
        sql<number>`(SELECT MAX(recent.id) FROM messages recent WHERE recent.conversationId = ${conversations.id})`
      )
    )
    .where(
      and(
        eq(conversations.userId, userId),
        options.search
          ? or(
              sql`${girlfriends.name} LIKE ${pattern} ESCAPE '!'`,
              sql`${conversations.title} LIKE ${pattern} ESCAPE '!'`,
              sql`${messages.content} LIKE ${pattern} ESCAPE '!'`
            )
          : undefined,
        options.ids ? inArray(conversations.id, options.ids) : undefined,
        cursor
          ? or(
              lt(conversations.updatedAt, cursor.updatedAt),
              and(
                eq(conversations.updatedAt, cursor.updatedAt),
                lt(conversations.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .limit(options.limit ?? 50);
  return rows.map(row => ({
    ...row,
    lastMessage: row.lastMessage ?? undefined,
    lastMessageAt: row.lastMessageAt ?? undefined,
  }));
}

/** 在当前用户范围内按字面量搜索，每个会话仅保留最新命中，并按命中游标分页。 */
export async function searchConversations(
  userId: string,
  keyword: string,
  cursor?: number | null,
  limit = 50
): Promise<ConversationPreview[]> {
  const db = await getDb();
  if (!db) return [];
  const pattern = "%" + keyword.replace(/[!%_]/g, "!$&") + "%";
  const latest = sql<number>`MAX(${messages.id})`;
  const hits = await db
    .select({ conversationId: messages.conversationId, id: latest })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.userId, userId),
        sql`${messages.content} LIKE ${pattern} ESCAPE '!'`
      )
    )
    .groupBy(messages.conversationId)
    .having(cursor ? lt(latest, cursor) : undefined)
    .orderBy(desc(latest))
    .limit(limit);
  if (!hits.length) return [];
  const summaries = await getConversationsWithLastMessage(userId, {
    ids: hits.map(hit => hit.conversationId),
    limit,
  });
  const matched = await db
    .select()
    .from(messages)
    .where(
      inArray(
        messages.id,
        hits.map(hit => hit.id)
      )
    );
  const byId = new Map(summaries.map(row => [row.id, row]));
  const byMessage = new Map(matched.map(row => [row.id, row]));
  return hits.flatMap(hit => {
    const summary = byId.get(hit.conversationId),
      message = byMessage.get(hit.id);
    return summary && message
      ? [
          {
            ...summary,
            matchedMessage:
              message.content.length > 60
                ? message.content.slice(0, 60) + "..."
                : message.content,
            matchedMessageId: hit.id,
          },
        ]
      : [];
  });
}

/** 从最新消息向前分页，单页内保持正序；归属由调用方验证。 */
export async function getMessagePage(
  conversationId: number,
  cursor?: number | null,
  limit = 50
): Promise<Message[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        cursor ? lt(messages.id, cursor) : undefined
      )
    )
    .orderBy(desc(messages.id))
    .limit(limit);
  return rows.reverse();
}
