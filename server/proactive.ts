/** 显式同意的主动联系规划、站内记录与按设备确认的持久投递。 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  companionPreferences,
  conversations,
  generationRequests,
  girlfriends,
  memories,
  messages,
  notifications,
  proactiveContacts,
  proactiveDeliveries,
  pushSubscriptions,
  type Notification,
  type PushSubscription,
} from "../drizzle/schema";
import {
  DEFAULT_PROACTIVE_PREFERENCES,
  calendarDayDistance,
  proactiveContactWindow,
  proactiveLocalClock,
  proactivePreferencesSchema,
  proactiveDeliveryExpiresAt,
  type ProactivePreferences,
} from "../shared/proactiveContact";
import { renderMessage, type LocalizedMessage } from "../shared/i18n";
import { resolveLocale } from "../shared/preferences";
import { getDb, withUserTransaction, type DbTransaction } from "./database";
import { memoryFeatureEnabled, runtimeInteger } from "./aiTaskRuntime";
import { createPushSender, isPushConfigured } from "./push";
import { getInterfacePreferences } from "./preferences";
import { log } from "./_core/log";

type Contact = typeof proactiveContacts.$inferSelect;
type Preferences = typeof companionPreferences.$inferSelect;
const LEASE_MS = 30_000;
const CONTACT_LIFETIME = 2 * 3_600_000;
const proactiveFeatureEnabled = () =>
  process.env.COMPANION_PROACTIVE_ENABLED !== "0";

/** 不在任务中复制端点及推送凭据；设备轮换后旧确认不适用。 */
export function proactiveDeviceHash(
  device: Pick<PushSubscription, "endpoint" | "p256dh" | "auth">
) {
  return createHash("sha256")
    .update(JSON.stringify([device.endpoint, device.p256dh, device.auth]))
    .digest("hex");
}

async function readPreferences(
  tx: DbTransaction,
  userId: string
): Promise<Preferences> {
  const [row] = await tx
    .select()
    .from(companionPreferences)
    .where(eq(companionPreferences.userId, userId));
  return row ?? { userId, ...DEFAULT_PROACTIVE_PREFERENCES, revision: 0 };
}
async function contactWindow(
  tx: DbTransaction,
  userId: string,
  preferences: ProactivePreferences,
  now: Date,
  excludeContactId?: string
) {
  const prior = await tx
    .select({ contact: proactiveContacts, isRead: notifications.isRead })
    .from(proactiveContacts)
    .innerJoin(
      notifications,
      and(
        eq(notifications.id, proactiveContacts.notificationId),
        eq(notifications.userId, userId),
        eq(notifications.contactId, proactiveContacts.id)
      )
    )
    .where(
      and(
        eq(proactiveContacts.userId, userId),
        inArray(proactiveContacts.status, ["pending", "delivering", "sent"]),
        excludeContactId
          ? sql`${proactiveContacts.id} <> ${excludeContactId}`
          : undefined
      )
    )
    .orderBy(desc(proactiveContacts.createdAt));
  const effective = prior.filter(
    item =>
      item.contact.status === "sent" ||
      item.contact.expiresAt.getTime() > now.getTime()
  );
  const history = await tx
    .select()
    .from(proactiveContacts)
    .where(
      and(
        eq(proactiveContacts.userId, userId),
        inArray(proactiveContacts.status, ["pending", "delivering", "sent"]),
        excludeContactId
          ? sql`${proactiveContacts.id} <> ${excludeContactId}`
          : undefined
      )
    )
    .orderBy(desc(proactiveContacts.createdAt));
  const lastContact = history.find(
    contact =>
      contact.status === "sent" ||
      effective.some(item => item.contact.id === contact.id)
  );
  const [latestMessage] = await tx
    .select({ time: sql<Date | string | null>`MAX(${messages.createdAt})` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.userId, userId),
        eq(messages.role, "user"),
        eq(messages.generationStatus, "succeeded")
      )
    );
  const roles = await tx
    .select({ last: girlfriends.lastInteractionAt })
    .from(girlfriends)
    .where(and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt)));
  const times = roles.flatMap(role => (role.last ? [role.last.getTime()] : []));
  if (latestMessage?.time)
    times.push(
      new Date(
        latestMessage.time instanceof Date
          ? latestMessage.time.getTime()
          : latestMessage.time
      ).getTime()
    );
  const [active] = await tx
    .select({ id: generationRequests.id })
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.userId, userId),
        eq(generationRequests.kind, "chat"),
        eq(generationRequests.status, "pending"),
        sql`${generationRequests.expiresAt} > ${now}`
      )
    )
    .limit(1);
  let consecutiveUnread = 0;
  for (const item of effective) {
    if (item.isRead) break;
    consecutiveUnread++;
  }
  const parsedPreferences = proactivePreferencesSchema
    .strip()
    .safeParse(preferences);
  return proactiveContactWindow({
    preferences: parsedPreferences.success
      ? parsedPreferences.data
      : DEFAULT_PROACTIVE_PREFERENCES,
    now,
    lastContactAt: lastContact?.createdAt,
    unreadContacts: consecutiveUnread,
    lastInteractionAt: times.length ? new Date(Math.max(...times)) : null,
    hasActiveChat: !!active,
  });
}

async function validEventSource(
  tx: DbTransaction,
  userId: string,
  girlfriendId: number,
  memory: typeof memories.$inferSelect
) {
  if (memory.sourceType === "user_edit")
    return memory.sourceMessageId === null && !!memory.sourceCreatedAt;
  if (!memory.sourceMessageId) return false;
  const [source] = await tx
    .select({ content: messages.content })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.id, memory.sourceMessageId),
        eq(messages.role, "user"),
        eq(messages.generationStatus, "succeeded"),
        eq(conversations.userId, userId),
        eq(conversations.girlfriendId, girlfriendId),
        isNull(messages.imageUrl)
      )
    );
  return !!source?.content.includes(memory.content);
}

/** 只建立一个本地自然日联系；无推送配置也能规划站内记录。 */
export async function planProactiveContact(
  userId: string
): Promise<Notification | null> {
  if (!proactiveFeatureEnabled()) return null;
  return withUserTransaction(userId, async tx => {
    const now = new Date();
    const prefs = await readPreferences(tx, userId);
    const window = await contactWindow(tx, userId, prefs, now);
    if (!proactiveFeatureEnabled() || !window.allowed || !window.day)
      return null;
    const [already] = await tx
      .select({ id: proactiveContacts.id })
      .from(proactiveContacts)
      .where(
        and(
          eq(proactiveContacts.userId, userId),
          eq(proactiveContacts.localDay, window.day)
        )
      );
    if (already) return null;
    const roles = await tx
      .select()
      .from(girlfriends)
      .where(and(eq(girlfriends.userId, userId), isNull(girlfriends.deletedAt)))
      .orderBy(desc(girlfriends.isActive), girlfriends.id)
      .for("update");
    if (!roles.length) return null;
    let candidate: {
      role: (typeof roles)[number];
      memory: typeof memories.$inferSelect | null;
      reason: Contact["reason"];
    } | null = null;
    if (memoryFeatureEnabled()) {
      const events = await tx
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.userId, userId),
            eq(memories.category, "event"),
            eq(memories.eventStatus, "planned")
          )
        )
        .orderBy(desc(memories.weight), desc(memories.id));
      const relevant = events
        .map(memory => ({
          memory,
          distance: memory.eventDay
            ? calendarDayDistance(window.day!, memory.eventDay)
            : NaN,
        }))
        .filter(
          item => Number.isFinite(item.distance) && Math.abs(item.distance) <= 1
        )
        .sort(
          (left, right) => Math.abs(left.distance) - Math.abs(right.distance)
        );
      for (const item of relevant) {
        const role = roles.find(
          role => role.id === item.memory.girlfriendId && role.memoryEnabled
        );
        if (
          !role ||
          !(await validEventSource(tx, userId, role.id, item.memory))
        )
          continue;
        candidate = {
          role,
          memory: item.memory,
          reason:
            item.distance === 1
              ? "event_upcoming"
              : item.distance === 0
                ? "event_today"
                : "event_followup",
        };
        break;
      }
    }
    if (!candidate && prefs.proactiveMode === "daily")
      candidate = { role: roles[0], memory: null, reason: "daily" };
    if (!candidate) return null;
    const id = crypto.randomUUID();
    const keys = {
      event_upcoming: "notifications:eventUpcoming",
      event_today: "notifications:eventToday",
      event_followup: "notifications:eventFollowUp",
      daily: "notifications:dailyCompanion",
    } as const;
    const content = {
      key: keys[candidate.reason],
      values: {
        name: candidate.role.name,
        memory: candidate.memory?.content ?? "",
        eventDay: candidate.memory?.eventDay ?? window.day,
      },
    } as LocalizedMessage;
    const [inserted] = await tx.insert(notifications).values({
      userId,
      girlfriendId: candidate.role.id,
      contactId: id,
      title: {
        key: "notifications:title.thinkingOfYou",
        values: { name: candidate.role.name },
      },
      content,
      type: "random",
      isRead: false,
      createdAt: now,
    });
    const notificationId = Number(inserted.insertId);
    await tx.insert(proactiveContacts).values({
      id,
      userId,
      girlfriendId: candidate.role.id,
      localDay: window.day,
      reason: candidate.reason,
      memoryId: candidate.memory?.id,
      memoryVersion: candidate.memory?.contentVersion,
      memorySourceMessageId: candidate.memory?.sourceMessageId,
      eventDay: candidate.memory?.eventDay,
      memoryEpoch: candidate.role.memoryEpoch,
      preferencesRevision: prefs.revision,
      notificationId,
      createdAt: now,
      nextRunAt: now,
      expiresAt: new Date(now.getTime() + CONTACT_LIFETIME),
    });
    const [notification] = await tx
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));
    return notification;
  });
}

type Validation =
  | { kind: "valid"; preferences: Preferences; notification: Notification }
  | { kind: "quiet" | "invalid" | "read" };
/** 所有发送前检查都读当前行，任何偏好、来源、活动状态变化都能取消旧投递。 */
async function validateContact(
  tx: DbTransaction,
  contact: Contact
): Promise<Validation> {
  const now = new Date();
  const [notification] = await tx
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, contact.notificationId),
        eq(notifications.userId, contact.userId),
        eq(notifications.contactId, contact.id)
      )
    );
  if (notification?.isRead) return { kind: "read" };
  const prefs = await readPreferences(tx, contact.userId);
  if (!proactiveFeatureEnabled()) return { kind: "invalid" };
  if (
    !prefs.proactiveEnabled ||
    prefs.revision !== contact.preferencesRevision ||
    contact.expiresAt.getTime() <= now.getTime()
  )
    return { kind: "invalid" };
  const clock = proactiveLocalClock(now, prefs.timeZone);
  if (!clock || clock.day !== contact.localDay) return { kind: "invalid" };
  const [role] = await tx
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, contact.girlfriendId),
        eq(girlfriends.userId, contact.userId),
        isNull(girlfriends.deletedAt)
      )
    );
  if (!role || role.memoryEpoch !== contact.memoryEpoch || !notification)
    return { kind: "invalid" };
  if (contact.reason === "daily") {
    if (prefs.proactiveMode !== "daily") return { kind: "invalid" };
  } else {
    if (!role.memoryEnabled || !memoryFeatureEnabled() || !contact.memoryId)
      return { kind: "invalid" };
    const [event] = await tx
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.id, contact.memoryId),
          eq(memories.userId, contact.userId),
          eq(memories.girlfriendId, role.id)
        )
      );
    if (
      !event ||
      event.category !== "event" ||
      event.eventStatus !== "planned" ||
      !event.eventDay ||
      event.eventDay !== contact.eventDay ||
      event.contentVersion !== contact.memoryVersion ||
      event.sourceMessageId !== contact.memorySourceMessageId ||
      !(await validEventSource(tx, contact.userId, role.id, event))
    )
      return { kind: "invalid" };
  }
  const window = await contactWindow(
    tx,
    contact.userId,
    prefs,
    now,
    contact.id
  );
  if (!window.allowed)
    return { kind: window.reason === "quiet" ? "quiet" : "invalid" };
  return { kind: "valid", preferences: prefs, notification };
}
async function cancelContact(tx: DbTransaction, contact: Contact) {
  await tx
    .update(proactiveContacts)
    .set({ status: "cancelled", leaseToken: null, leaseUntil: null })
    .where(
      and(
        eq(proactiveContacts.id, contact.id),
        inArray(proactiveContacts.status, ["pending", "delivering"])
      )
    );
  await tx
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, contact.notificationId),
        eq(notifications.userId, contact.userId),
        eq(notifications.contactId, contact.id)
      )
    );
}
async function finishReadContact(tx: DbTransaction, contact: Contact) {
  await tx
    .update(proactiveContacts)
    .set({ status: "sent", leaseToken: null, leaseUntil: null })
    .where(
      and(
        eq(proactiveContacts.id, contact.id),
        inArray(proactiveContacts.status, ["pending", "delivering"])
      )
    );
}
async function deferContact(
  tx: DbTransaction,
  contact: Contact,
  quiet = false
) {
  await tx
    .update(proactiveContacts)
    .set({
      status: "pending",
      leaseToken: null,
      leaseUntil: null,
      attempts: contact.attempts + (quiet ? 0 : 1),
      nextRunAt: new Date(
        Math.min(
          contact.expiresAt.getTime(),
          Date.now() +
            (quiet
              ? 5 * 60_000
              : Math.min(
                  15 * 60_000,
                  30_000 * 2 ** Math.min(contact.attempts, 5)
                ))
        )
      ),
    })
    .where(
      and(
        eq(proactiveContacts.id, contact.id),
        inArray(proactiveContacts.status, ["pending", "delivering"])
      )
    );
}
function ownsLease(
  contact: Contact | undefined,
  token: string
): contact is Contact {
  return (
    !!contact &&
    contact.status === "delivering" &&
    contact.leaseToken === token &&
    !!contact.leaseUntil &&
    contact.leaseUntil.getTime() > Date.now() &&
    contact.expiresAt.getTime() > Date.now()
  );
}

async function prepareDevice(
  contact: Contact,
  token: string,
  device: PushSubscription
) {
  return withUserTransaction(contact.userId, async tx => {
    const [current] = await tx
      .select()
      .from(proactiveContacts)
      .where(eq(proactiveContacts.id, contact.id))
      .for("update");
    if (!ownsLease(current, token)) return { kind: "stopped" as const };
    const validation = await validateContact(tx, current);
    if (validation.kind !== "valid") {
      if (validation.kind === "read") await finishReadContact(tx, current);
      else if (validation.kind === "quiet")
        await deferContact(tx, current, true);
      else await cancelContact(tx, current);
      return { kind: "stopped" as const };
    }
    const [subscription] = await tx
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.id, device.id),
          eq(pushSubscriptions.userId, contact.userId)
        )
      )
      .for("update");
    const fingerprint = proactiveDeviceHash(device);
    if (!subscription || proactiveDeviceHash(subscription) !== fingerprint)
      return { kind: "skip" as const };
    const [receipt] = await tx
      .select()
      .from(proactiveDeliveries)
      .where(
        and(
          eq(proactiveDeliveries.contactId, contact.id),
          eq(proactiveDeliveries.subscriptionId, device.id),
          eq(proactiveDeliveries.deviceHash, fingerprint)
        )
      )
      .for("update");
    if (receipt?.status === "sent") return { kind: "skip" as const };
    const deliveryId = receipt?.id ?? crypto.randomUUID();
    if (receipt)
      await tx
        .update(proactiveDeliveries)
        .set({ status: "pending", attempts: receipt.attempts + 1 })
        .where(eq(proactiveDeliveries.id, receipt.id));
    else
      await tx.insert(proactiveDeliveries).values({
        id: deliveryId,
        contactId: contact.id,
        userId: contact.userId,
        subscriptionId: device.id,
        deviceHash: fingerprint,
        attempts: 1,
      });
    await tx
      .update(proactiveContacts)
      .set({ leaseUntil: new Date(Date.now() + LEASE_MS) })
      .where(
        and(
          eq(proactiveContacts.id, contact.id),
          eq(proactiveContacts.leaseToken, token),
          eq(proactiveContacts.status, "delivering")
        )
      );
    return { ...validation, kind: "send" as const, deliveryId, subscription };
  });
}

async function acknowledgeDevice(
  contact: Contact,
  token: string,
  device: PushSubscription,
  deliveryId: string,
  error: unknown
) {
  await withUserTransaction(contact.userId, async tx => {
    const [current] = await tx
      .select()
      .from(proactiveContacts)
      .where(eq(proactiveContacts.id, contact.id))
      .for("update");
    if (!ownsLease(current, token)) return;
    await tx
      .update(proactiveDeliveries)
      .set({
        status: error ? "failed" : "sent",
        deliveredAt: error ? null : new Date(),
      })
      .where(
        and(
          eq(proactiveDeliveries.id, deliveryId),
          eq(proactiveDeliveries.contactId, contact.id),
          eq(proactiveDeliveries.userId, contact.userId),
          eq(proactiveDeliveries.status, "pending")
        )
      );
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? error.statusCode
        : null;
    if (status === 404 || status === 410)
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.id, device.id),
            eq(pushSubscriptions.userId, contact.userId),
            eq(pushSubscriptions.endpoint, device.endpoint),
            eq(pushSubscriptions.p256dh, device.p256dh),
            eq(pushSubscriptions.auth, device.auth)
          )
        );
    await tx
      .update(proactiveContacts)
      .set({ leaseUntil: new Date(Date.now() + LEASE_MS) })
      .where(
        and(
          eq(proactiveContacts.id, contact.id),
          eq(proactiveContacts.leaseToken, token),
          eq(proactiveContacts.status, "delivering")
        )
      );
  });
}

async function deliverContact(contact: Contact, token: string) {
  const db = (await getDb())!;
  const preferences = await getInterfacePreferences(contact.userId);
  const locale = resolveLocale(preferences.language, []);
  const devices = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, contact.userId));
  if (isPushConfigured() && devices.length) {
    const send = await createPushSender();
    for (const device of devices) {
      const prepared = await prepareDevice(contact, token, device);
      if (prepared.kind === "stopped") return;
      if (prepared.kind !== "send") continue;
      const deliveryExpiry = proactiveDeliveryExpiresAt(
        new Date(),
        prepared.preferences,
        contact.expiresAt
      );
      if (deliveryExpiry.getTime() <= Date.now()) {
        await withUserTransaction(contact.userId, async tx => {
          const [current] = await tx
            .select()
            .from(proactiveContacts)
            .where(eq(proactiveContacts.id, contact.id))
            .for("update");
          if (
            !current ||
            current.status !== "delivering" ||
            current.leaseToken !== token
          )
            return;
          const validation = await validateContact(tx, current);
          if (validation.kind === "read") await finishReadContact(tx, current);
          else if (validation.kind === "invalid")
            await cancelContact(tx, current);
          else await deferContact(tx, current, true);
        });
        return;
      }
      const privatePreview = prepared.preferences.hidePrivatePreview;
      const payload = {
        title: privatePreview
          ? "YUMEI"
          : renderMessage(prepared.notification.title, locale),
        body: privatePreview
          ? renderMessage({ key: "notifications:privatePreview" }, locale)
          : renderMessage(prepared.notification.content, locale),
        url: `/chats?notification=${contact.notificationId}`,
        tag: `proactive:${contact.id}`,
        notificationId: contact.notificationId,
        expiresAt: deliveryExpiry.toISOString(),
      };
      let failure: unknown;
      try {
        await send(prepared.subscription, payload, deliveryExpiry);
      } catch (error) {
        failure = error;
        log.warn("[proactive] device delivery will retry", {
          contactId: contact.id,
        });
      }
      await acknowledgeDevice(
        contact,
        token,
        prepared.subscription,
        prepared.deliveryId,
        failure
      );
    }
  }
  await withUserTransaction(contact.userId, async tx => {
    const [current] = await tx
      .select()
      .from(proactiveContacts)
      .where(eq(proactiveContacts.id, contact.id))
      .for("update");
    if (!ownsLease(current, token)) return;
    const validation = await validateContact(tx, current);
    if (validation.kind === "read") {
      await finishReadContact(tx, current);
      return;
    }
    if (validation.kind === "invalid") {
      await cancelContact(tx, current);
      return;
    }
    const subscriptions = await tx
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, contact.userId));
    const receipts = await tx
      .select()
      .from(proactiveDeliveries)
      .where(eq(proactiveDeliveries.contactId, contact.id));
    const complete =
      !isPushConfigured() ||
      subscriptions.every(device =>
        receipts.some(
          receipt =>
            receipt.subscriptionId === device.id &&
            receipt.deviceHash === proactiveDeviceHash(device) &&
            receipt.status === "sent"
        )
      );
    if (complete)
      await tx
        .update(proactiveContacts)
        .set({ status: "sent", leaseToken: null, leaseUntil: null })
        .where(
          and(
            eq(proactiveContacts.id, contact.id),
            eq(proactiveContacts.leaseToken, token),
            eq(proactiveContacts.status, "delivering")
          )
        );
    else await deferContact(tx, current, validation.kind === "quiet");
  });
}

/** 多实例调度共享任务租约和设备回执；网络成功与落库之间的崩溃由稳定tag收敛展示。 */
export async function runProactiveContacts(userIds?: readonly string[]) {
  if (userIds?.length === 0) return;
  const db = (await getDb())!;
  const users =
    userIds ??
    (
      await db
        .select({ userId: companionPreferences.userId })
        .from(companionPreferences)
        .where(eq(companionPreferences.proactiveEnabled, true))
    ).map(row => row.userId);
  for (const userId of users)
    await planProactiveContact(userId).catch(() =>
      log.warn("[proactive] planning will retry")
    );
  const due = await db
    .select()
    .from(proactiveContacts)
    .where(
      and(
        userIds ? inArray(proactiveContacts.userId, [...userIds]) : undefined,
        inArray(proactiveContacts.status, ["pending", "delivering"]),
        or(
          lte(proactiveContacts.expiresAt, new Date()),
          and(
            lte(proactiveContacts.nextRunAt, new Date()),
            or(
              isNull(proactiveContacts.leaseUntil),
              lte(proactiveContacts.leaseUntil, new Date())
            )
          )
        )
      )
    )
    .orderBy(proactiveContacts.nextRunAt)
    .limit(100);
  for (const contact of due) {
    const token = crypto.randomUUID();
    try {
      const claimed = await withUserTransaction(contact.userId, async tx => {
        const [current] = await tx
          .select()
          .from(proactiveContacts)
          .where(eq(proactiveContacts.id, contact.id))
          .for("update");
        if (
          !current ||
          current.status === "sent" ||
          current.status === "cancelled" ||
          (current.leaseUntil && current.leaseUntil.getTime() > Date.now())
        )
          return false;
        const validation = await validateContact(tx, current);
        if (validation.kind !== "valid") {
          if (validation.kind === "read") await finishReadContact(tx, current);
          else if (validation.kind === "quiet")
            await deferContact(tx, current, true);
          else await cancelContact(tx, current);
          return false;
        }
        await tx
          .update(proactiveContacts)
          .set({
            status: "delivering",
            leaseToken: token,
            leaseUntil: new Date(Date.now() + LEASE_MS),
          })
          .where(
            and(
              eq(proactiveContacts.id, current.id),
              inArray(proactiveContacts.status, ["pending", "delivering"])
            )
          );
        return true;
      });
      if (claimed) await deliverContact(contact, token);
    } catch {
      await withUserTransaction(contact.userId, async tx => {
        const [current] = await tx
          .select()
          .from(proactiveContacts)
          .where(eq(proactiveContacts.id, contact.id))
          .for("update");
        if (ownsLease(current, token)) await deferContact(tx, current);
      }).catch(() => {});
      log.warn("[proactive] worker will retry", { contactId: contact.id });
    }
  }
}

/** 规划不依赖推送配置；首次启动与每分钟均恢复持久任务。 */
export function startProactiveScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runProactiveContacts();
    } catch {
      log.warn("[proactive] scheduler will retry");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(
    () => {
      void tick();
    },
    runtimeInteger("PROACTIVE_TICK_MS", 60_000, 1_000, 3_600_000)
  );
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
