/** notifications 领域的数据访问与事务边界。 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  girlfriendMoods,
  girlfriends,
  notifications,
  type InsertNotification,
  type Notification,
} from "../../drizzle/schema";
import type { LocalizedMessage } from "../../shared/i18n";
import { PROACTIVE_MESSAGES, proactiveTitle } from "../../shared/notifications";
import { getDb, withUserTransaction } from "../database";

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
    const { getFreshEventMemory } = await import("../memory");
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
