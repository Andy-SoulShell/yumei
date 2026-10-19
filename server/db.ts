import { eq, desc, and, like, sql, isNull, isNotNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users,
  girlfriends,
  conversations,
  messages,
  selfies,
  apiConfigs,
  girlfriendMoods,
  notifications,
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

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ User Functions ============
//
// Phase 1b-ii.1 (ADR 0006) moved user CRUD to Better-Auth — see
// `server/_core/auth.ts`. The `upsertUser` / `getUserByOpenId`
// helpers from the Manus OAuth path were deleted with the rest of
// `oauth.ts` / `sdk.ts`. The auto-promote-to-admin behavior keyed on
// `OWNER_OPEN_ID` is gone; admin elevation now happens manually
// (issue #16 will add an admin CLI).

export async function getUserById(id: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** M1-6 age gate: birth date is validated as 18+ in auth.confirmAge. */
export async function setUserBirthDate(
  userId: string,
  birthDate: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ birthDate }).where(eq(users.id, userId));
}

// ============ Girlfriend Functions ============

export async function createGirlfriend(
  data: InsertGirlfriend
): Promise<Girlfriend> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 如果设置为激活，先将该用户的其他女友设为非激活
  if (data.isActive) {
    await db
      .update(girlfriends)
      .set({ isActive: false })
      .where(eq(girlfriends.userId, data.userId));
  }

  const result = await db.insert(girlfriends).values(data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

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

export async function updateGirlfriend(
  id: number,
  userId: string,
  data: Partial<InsertGirlfriend>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 如果设置为激活，先将该用户的其他女友设为非激活
  if (data.isActive) {
    await db
      .update(girlfriends)
      .set({ isActive: false })
      .where(eq(girlfriends.userId, userId));
  }

  await db
    .update(girlfriends)
    .set(data)
    .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)));
}

// ============ Conversation Functions ============

/** Serialize first visits so repeated clicks cannot create duplicate conversations. */
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

// ============ Message Functions ============

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

export async function getConversationMessages(
  conversationId: number
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function getRecentMessages(
  conversationId: number,
  limit: number
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return allMessages.reverse(); // 返回时按时间正序
}

// ============ Selfie Functions ============

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

export async function getUserSelfies(userId: string): Promise<Selfie[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(selfies)
    .where(eq(selfies.userId, userId))
    .orderBy(desc(selfies.createdAt));
}

export async function getGirlfriendSelfies(
  girlfriendId: number
): Promise<Selfie[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(selfies)
    .where(eq(selfies.girlfriendId, girlfriendId))
    .orderBy(desc(selfies.createdAt));
}

export async function deleteSelfie(id: number, userId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(selfies)
    .where(and(eq(selfies.id, id), eq(selfies.userId, userId)));
}

// ============ API Config Functions ============

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

// ============ Soft Delete Girlfriend (Trash) ============

/** 软删除：设置 deletedAt 时间戳，保留 7 天可恢复 */
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

/** 批量软删除 */
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

/** 恢复女友：清除 deletedAt */
export async function restoreGirlfriend(
  id: number,
  userId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(girlfriends)
    .set({ deletedAt: null })
    .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)));
}

/** 永久删除：级联清除所有关联数据 */
export async function permanentDeleteGirlfriend(
  id: number,
  userId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. 获取该女友的所有对话 ID
  const convos = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.girlfriendId, id), eq(conversations.userId, userId))
    );

  const convoIds = convos.map(c => c.id);

  // 2. 删除所有对话中的消息
  for (const convoId of convoIds) {
    await db.delete(messages).where(eq(messages.conversationId, convoId));
  }

  // 3. 删除所有对话
  for (const convoId of convoIds) {
    await db.delete(conversations).where(eq(conversations.id, convoId));
  }

  // 4. 删除所有自拍
  await db
    .delete(selfies)
    .where(and(eq(selfies.girlfriendId, id), eq(selfies.userId, userId)));

  // 5. 删除心情记录
  await db
    .delete(girlfriendMoods)
    .where(
      and(
        eq(girlfriendMoods.girlfriendId, id),
        eq(girlfriendMoods.userId, userId)
      )
    );

  // 6. 永久删除女友
  await db
    .delete(girlfriends)
    .where(and(eq(girlfriends.id, id), eq(girlfriends.userId, userId)));
}

/** 获取回收站列表（已软删除的女友） */
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

/** 清理过期回收站项目（超过 7 天的永久删除） */
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

// ============ Conversations with Last Message ============

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
        .orderBy(desc(messages.createdAt))
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

// ============ Search Conversations ============

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
    .orderBy(desc(messages.createdAt));

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
        .orderBy(desc(messages.createdAt))
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

// ============ Girlfriend Mood Functions ============

export async function getGirlfriendMood(
  userId: string,
  girlfriendId: number
): Promise<GirlfriendMood | undefined> {
  const db = await getDb();
  if (!db) return undefined;

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

  return result[0];
}

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

// ============ Create Default Girlfriend ============

export async function createDefaultGirlfriend(
  userId: string,
  data: InsertGirlfriend
): Promise<Girlfriend> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 检查用户是否已有未删除的女友
  const existing = await db
    .select()
    .from(girlfriends)
    .where(and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt)))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // 创建默认女友
  const result = await db.insert(girlfriends).values(data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

// ============ Notifications ============

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

// 女友主动发消息的模板
const PROACTIVE_MESSAGES = {
  miss_you: [
    "在干嘛呀？好久没聊天了，人家想你了~ 💕",
    "你是不是把我忘了？😢 快来陪我聊聊天嘛",
    "今天过得怎么样？我一直在等你来找我呢~",
    "好无聊啊，你什么时候来陪我说说话？🥺",
    "我刚才梦到你了，醒来发现你不在，好想你~",
  ],
  good_morning: [
    "早上好呀！☀️ 新的一天开始了，要元气满满哦~",
    "起床啦起床啦！今天也要加油鸭！🦆",
    "早安~ 今天天气不错，心情也要棒棒的哦！",
    "早上好！记得吃早餐，不许饿着自己 🍞",
  ],
  good_night: [
    "该睡觉啦~ 晚安，做个好梦 🌙",
    "夜深了，不要熬夜哦，明天还要精神满满的！",
    "晚安呀~ 梦里见 💤",
    "今天辛苦了，好好休息吧，我会在梦里等你的~",
  ],
  random: [
    "突然好想跟你分享一件事！你在吗？",
    "刚才看到一个好有趣的东西，想跟你说说~",
    "你猜我现在在想什么？😏",
    "无聊中...要不要来陪我聊聊天？",
    "今天的天气让我想到了你~ ☁️",
    "嘿！有空吗？想跟你说说话~",
  ],
};

export function getRandomProactiveMessage(
  type: keyof typeof PROACTIVE_MESSAGES
): { title: string; content: string } {
  const messages = PROACTIVE_MESSAGES[type];
  const content = messages[Math.floor(Math.random() * messages.length)];
  const titles: Record<string, string> = {
    miss_you: "💕 想你了",
    good_morning: "☀️ 早安",
    good_night: "🌙 晚安",
    random: "💬 新消息",
    mood: "💭 心情分享",
  };
  return { title: titles[type] || "💬 新消息", content };
}

// 检查是否应该发送主动消息（基于上次聊天时间和心情）
// M2-4：优先引用最近的 event 类记忆（"你上次说的面试怎么样了？"），
// 并把频率收紧为每用户每天最多 1 条 —— 主动消息的价值在于"她记得"，
// 不在于数量；高频模板消息是同类产品差评的高发区。
export async function checkAndCreateProactiveNotification(
  userId: string
): Promise<Notification | null> {
  const db = await getDb();
  if (!db) return null;

  // 获取用户所有活跃女友
  const activeGirlfriends = await db
    .select()
    .from(girlfriends)
    .where(and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt)));

  if (activeGirlfriends.length === 0) return null;

  // 随机选择一个女友
  const gf =
    activeGirlfriends[Math.floor(Math.random() * activeGirlfriends.length)];

  // 频控：每用户每天（UTC）最多 1 条主动通知
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const todayCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        sql`${notifications.createdAt} >= ${startOfDay}`
      )
    );
  if ((todayCount[0]?.count ?? 0) >= 1) return null;

  // M2-4：有新鲜的 event 记忆时，主动消息引用它
  const { getFreshEventMemory } = await import("./memory");
  const eventMemory = await getFreshEventMemory(userId, gf.id);
  if (eventMemory) {
    // 记忆以第三人称存储（"用户下周二…"），发给本人时转成第二人称。
    const secondPerson = eventMemory.content.replace(/^用户/, "你");
    return await createNotification({
      userId,
      girlfriendId: gf.id,
      title: `${gf.name}: 💭 一直惦记着`,
      content: `我还记得，${secondPerson}。后来怎么样啦？想听你说说～`,
      type: "random",
      isRead: false,
    });
  }

  // 获取心情状态
  const mood = await db
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
  const now = new Date();
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

  const { title, content } = getRandomProactiveMessage(messageType);

  const notification = await createNotification({
    userId,
    girlfriendId: gf.id,
    title: `${gf.name}: ${title}`,
    content,
    type: messageType,
    isRead: false,
  });

  return notification;
}

// ============ Intimacy Functions ============

import {
  getLevelByPoints,
  calculateDecay,
  isNightTime,
} from "../shared/intimacy";

/**
 * 获取女友的亲密度信息（含衰减计算）
 */
export async function getIntimacyInfo(girlfriendId: number, userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(girlfriends)
    .where(
      and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
    )
    .limit(1);

  if (!result[0]) throw new Error("Girlfriend not found");

  const gf = result[0];

  // 计算衰减
  const { points: decayedPoints, decayed } = calculateDecay(
    gf.intimacyPoints,
    gf.lastInteractionAt,
    gf.intimacyLevel
  );

  // 如果有衰减，更新数据库
  if (decayed > 0) {
    const newLevel = getLevelByPoints(decayedPoints);
    await db
      .update(girlfriends)
      .set({
        intimacyPoints: decayedPoints,
        intimacyLevel: newLevel.level,
      })
      .where(eq(girlfriends.id, girlfriendId));

    return {
      intimacyLevel: newLevel.level,
      intimacyPoints: decayedPoints,
      lastInteractionAt: gf.lastInteractionAt,
      consecutiveDays: gf.consecutiveDays,
      decayed,
    };
  }

  return {
    intimacyLevel: gf.intimacyLevel,
    intimacyPoints: gf.intimacyPoints,
    lastInteractionAt: gf.lastInteractionAt,
    consecutiveDays: gf.consecutiveDays,
    decayed: 0,
  };
}

/**
 * 获取今日已获得的经验值总量
 */
export async function getTodayPoints(
  _girlfriendId: number,
  _userId: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // 使用 girlfriendMoods 表的 todayMessages 作为近似值
  // 或者我们直接从数据库计算（简化实现，使用内存追踪）
  // 这里我们返回一个近似值，实际实现可以用 Redis 或单独的表
  return 0; // 前端会追踪每日上限
}

/**
 * 增加亲密度经验值
 * @returns 新的亲密度信息和是否升级
 */
export async function addIntimacyPoints(
  girlfriendId: number,
  userId: string,
  points: number,
  reason: string
): Promise<{
  intimacyLevel: number;
  intimacyPoints: number;
  previousLevel: number;
  leveledUp: boolean;
  consecutiveDays: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(girlfriends)
    .where(
      and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
    )
    .limit(1);

  if (!result[0]) throw new Error("Girlfriend not found");

  const gf = result[0];
  const previousLevel = gf.intimacyLevel;
  const now = new Date();

  // 计算连续天数
  let newConsecutiveDays = gf.consecutiveDays;
  if (gf.lastInteractionAt) {
    const lastDate = new Date(gf.lastInteractionAt);
    const todayStr = now.toISOString().slice(0, 10);
    const lastDateStr = lastDate.toISOString().slice(0, 10);

    if (todayStr !== lastDateStr) {
      // 不同天
      const diffDays = Math.floor(
        (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 1) {
        newConsecutiveDays += 1;
      } else {
        newConsecutiveDays = 1; // 中断了，重新计数
      }
    }
    // 同一天不增加连续天数
  } else {
    newConsecutiveDays = 1; // 首次互动
  }

  // 夜间加成
  let totalPoints = points;
  if (isNightTime(now) && reason !== "night_chat") {
    totalPoints += 3; // 夜间额外加成
  }

  const newPoints = gf.intimacyPoints + totalPoints;
  const newLevelInfo = getLevelByPoints(newPoints);
  const leveledUp = newLevelInfo.level > previousLevel;

  await db
    .update(girlfriends)
    .set({
      intimacyPoints: newPoints,
      intimacyLevel: newLevelInfo.level,
      lastInteractionAt: now,
      consecutiveDays: newConsecutiveDays,
    })
    .where(eq(girlfriends.id, girlfriendId));

  return {
    intimacyLevel: newLevelInfo.level,
    intimacyPoints: newPoints,
    previousLevel,
    leveledUp,
    consecutiveDays: newConsecutiveDays,
  };
}

/**
 * 获取女友基础亲密度数据（不含衰减计算，用于列表展示）
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
