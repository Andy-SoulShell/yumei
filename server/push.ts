/**
 * Web Push delivery (M4-4).
 *
 * Requires VAPID keys — generate once with `npx web-push generate-vapid-keys`
 * and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ optional VAPID_SUBJECT,
 * a mailto: or https: contact). Without them the feature is dormant: the
 * client hides the enable button and the scheduler stays off.
 */

import { eq } from "drizzle-orm";
import { pushSubscriptions } from "../drizzle/schema";
import { getDb } from "./db";
import { log } from "./_core/log";

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function getWebPush() {
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return webpush;
}

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

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  if (rows[0] && rows[0].userId === userId) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, rows[0].id));
  }
}

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

/** Users with at least one push endpoint (scheduler targets). */
export async function listPushUserIds(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions);
  return Array.from(new Set(rows.map(r => r.userId)));
}

/**
 * Deliver a payload to every endpoint of a user. Dead endpoints
 * (404/410) are pruned. Failures never throw — push is best-effort.
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
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
      } else {
        log.error("[push] delivery failed (non-blocking)", error);
      }
    }
  }
  return delivered;
}

// ---------------------------------------------------------------------------
// Proactive-message scheduler (M4-4, completes M2-4)
// ---------------------------------------------------------------------------

let schedulerTimer: NodeJS.Timeout | null = null;

/**
 * Hourly pass: for every user with a push endpoint, let the proactive
 * generator decide whether to say something (it enforces the 1/day cap
 * and picks memory-aware content), then push it. Sends are restricted
 * to 08:00–22:00 server time — without per-user timezones this is the
 * conservative window.
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
          const notification = await checkAndCreateProactiveNotification(userId);
          if (notification) {
            await sendPushToUser(userId, {
              title: notification.title,
              body: notification.content,
              url: "/",
            });
          }
        } catch (error) {
          log.error("[push] proactive tick failed for user (non-blocking)", error);
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
