/** Web Push 订阅管理和有时限的通知传输。 */

import { and, eq } from "drizzle-orm";
import { pushSubscriptions, type PushSubscription } from "../drizzle/schema";
import { log } from "./_core/log";
import { getDb } from "./database";
import { runtimeInteger } from "./aiTaskRuntime";

/** 外推仅包含已经本地化的有限内容和稳定投递身份。 */
export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  expiresAt?: string;
  notificationId?: number;
};

/** 先完成库初始化，调用方随后在发送前核对共享租约和设备凭据指纹。 */
export async function createPushSender() {
  const webpush = await getWebPush();
  const timeoutMs = runtimeInteger(
    "PROACTIVE_PUSH_TIMEOUT_MS",
    8_000,
    100,
    20_000
  );
  return async (
    subscription: Pick<PushSubscription, "endpoint" | "p256dh" | "auth">,
    payload: PushPayload,
    expiresAt: Date
  ) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          {
            timeout: timeoutMs,
            TTL: Math.max(
              0,
              Math.floor((expiresAt.getTime() - Date.now()) / 1000)
            ),
          }
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Push attempt timed out")),
            timeoutMs
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** 判断 VAPID 公钥与私钥是否同时配置，不验证其格式或外部网络。 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** 读取前端订阅所需的公开密钥，公私钥未同时配置时返回 null。 */
export function getVapidPublicKey(): string | null {
  return isPushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
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
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId)
      )
    );
}

/** 判断用户是否保存了指定推送端点；省略端点时查询该账号任意设备。 */
export async function hasPushSubscription(
  userId: string,
  endpoint?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        endpoint ? eq(pushSubscriptions.endpoint, endpoint) : undefined
      )
    )
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
          .where(
            and(
              eq(pushSubscriptions.id, row.id),
              eq(pushSubscriptions.userId, row.userId),
              eq(pushSubscriptions.p256dh, row.p256dh),
              eq(pushSubscriptions.auth, row.auth)
            )
          );
      } else {
        log.warn("[push] delivery failed", {
          statusCode: typeof status === "number" ? status : null,
        });
      }
    }
  }
  return delivered;
}
