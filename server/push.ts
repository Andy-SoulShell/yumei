import { renderMessage } from "../shared/i18n";
import { resolveLocale } from "../shared/preferences";
import { getInterfacePreferences } from "./preferences";
import type { Notification } from "../drizzle/schema";
/** Web Push 订阅管理、通知投递及每小时主动消息调度。 */

import { eq } from "drizzle-orm";
import { pushSubscriptions } from "../drizzle/schema";
import { getDb } from "./db";
import { log } from "./_core/log";

/** 判断 VAPID 公钥与私钥是否同时配置，不验证其格式或外部网络。 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** 读取前端订阅推送所需的公开密钥，未配置时返回 null。 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** 加载推送库并应用当前运营方的 VAPID 联系信息与密钥。 */
async function getWebPush() {
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return webpush;
}

/** 创建或更新一个浏览器推送端点及其所属用户。 */
export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onDuplicateKeyUpdate({
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
}

/** 仅在端点属于当前用户时删除推送订阅。 */
export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  if (rows[0] && rows[0].userId === userId) {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.id, rows[0].id));
  }
}

/** 判断用户是否至少保存了一个推送端点。 */
export async function hasPushSubscription(userId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/** 返回至少保存一个推送端点的去重用户标识。 */
export async function listPushUserIds(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions);
  return Array.from(new Set(rows.map(r => r.userId)));
}

/**
 * 向用户全部端点投递消息，移除返回 404 或 410 的失效端点。
 *
 * @returns 成功投递的端点数量
 * @remarks 普通投递错误仅记录日志，数据库及初始化错误仍可能向外传播。
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<number> {
  if (!isPushConfigured()) return 0;
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (rows.length === 0) return 0;

  const webpush = await getWebPush();
  let delivered = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 }
      );
      delivered += 1;
    } catch (error: any) {
      const status = error?.statusCode;
      if (status === 404 || status === 410) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, row.id));
      } else {
        log.error("[push] delivery failed (non-blocking)", error);
      }
    }
  }
  return delivered;
}

// ---------------------------------------------------------------------------
// 主动消息推送调度。
// ---------------------------------------------------------------------------

let schedulerTimer: NodeJS.Timeout | null = null;

/**
 * 配置 VAPID 后启动单进程每小时调度，只在服务器本地时间 08:00 至 22:00 执行。
 *
 * @remarks 首轮在一个小时后触发；跨进程去重及用户独立时区尚未实现。
 */
export function startProactivePushScheduler(): void {
  if (!isPushConfigured() || schedulerTimer) return;

  const tick = async () => {
    try {
      const hour = new Date().getHours();
      if (hour < 8 || hour >= 22) return;

      const { checkAndCreateProactiveNotification } = await import("./db");
      const userIds = await listPushUserIds();
      for (const userId of userIds) {
        try {
          const notification =
            await checkAndCreateProactiveNotification(userId);
          if (notification) {
            await sendNotificationPush(userId, notification);
          }
        } catch (error) {
          log.error(
            "[push] proactive tick failed for user (non-blocking)",
            error
          );
        }
      }
    } catch (error) {
      log.error("[push] scheduler tick failed", error);
    }
  };

  schedulerTimer = setInterval(tick, 60 * 60 * 1000);
  schedulerTimer.unref();
  console.log("[boot] proactive push scheduler started (hourly)");
}

/** 推送离开应用前，按账号语言把结构化系统通知渲染为文本。 */
export async function sendNotificationPush(
  userId: string,
  notification: Notification
) {
  const preferences = await getInterfacePreferences(userId);
  const locale = resolveLocale(preferences.language, []);
  return sendPushToUser(userId, {
    title: renderMessage(notification.title, locale),
    body: renderMessage(notification.content, locale),
    url: "/",
  });
}
