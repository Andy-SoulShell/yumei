import { getPublishedProductConfig } from "./productConfig";
/** notifications 领域的数据访问与事务边界。 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  notifications,
  proactiveContacts,
  type InsertNotification,
  type Notification,
} from "../../drizzle/schema";
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
  limit?: number
): Promise<Notification[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(
      limit ??
        (await getPublishedProductConfig()).experience.pagination.notifications
    );
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
  await withUserTransaction(userId, async tx => {
    const [owned] = await tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .for("update");
    if (!owned) return;
    await tx
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    await tx
      .update(proactiveContacts)
      .set({ status: "sent", leaseToken: null, leaseUntil: null })
      .where(
        and(
          eq(proactiveContacts.userId, userId),
          eq(proactiveContacts.notificationId, id),
          inArray(proactiveContacts.status, ["pending", "delivering"])
        )
      );
  });
}

/** 将当前用户的全部通知标记为已读。 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  await withUserTransaction(userId, async tx => {
    const unread = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false))
      )
      .for("update");
    await tx
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false))
      );
    if (unread.length)
      await tx
        .update(proactiveContacts)
        .set({ status: "sent", leaseToken: null, leaseUntil: null })
        .where(
          and(
            eq(proactiveContacts.userId, userId),
            inArray(
              proactiveContacts.notificationId,
              unread.map(row => row.id)
            ),
            inArray(proactiveContacts.status, ["pending", "delivering"])
          )
        );
  });
}

export { planProactiveContact as checkAndCreateProactiveNotification } from "../proactive";
