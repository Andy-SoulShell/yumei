import {
  DEFAULT_PROACTIVE_PREFERENCES,
  productFixture,
} from "./testProductConfig";
/** 真实 MySQL 与合成 Web Push 验证主动联系规划和每设备 outbox。 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generationRequests,
  memories,
  notifications,
  proactiveContacts,
  proactiveDeliveries,
  pushSubscriptions,
  userPreferences,
} from "../drizzle/schema";
import {
  proactiveLocalClock,
  type ProactivePreferences,
} from "../shared/proactiveContact";
import { getDb } from "./database";
import { saveCompanionPreferences } from "./companionPreferences";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import { markNotificationRead } from "./repositories/notifications";
import { createTestGirlfriend, createTestUser } from "./testFixtures";
import {
  planProactiveContact,
  proactiveDeviceHash,
  runProactiveContacts,
} from "./proactive";
import * as push from "./push";
import * as memory from "./memory";

import * as productRepository from "./repositories/productConfig";
let policy = structuredClone(productFixture);
const webpush = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: webpush.send },
}));
beforeEach(() => {
  policy = structuredClone(productFixture);
  vi.spyOn(productRepository, "getPublishedProductConfig").mockImplementation(
    async () => ({
      ...structuredClone(policy),
      revision: 1,
      publishedAt: new Date(),
    })
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private");
  webpush.send.mockReset().mockResolvedValue({});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function fixture(
  options: Partial<ProactivePreferences> & {
    withEvent?: boolean;
    dayOffset?: number;
    devices?: number;
  } = {}
) {
  const userId = `outbox-${crypto.randomUUID()}`;
  const girlfriend = await createTestGirlfriend({
    userId,
    name: "私密角色",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "test",
    referenceImageUrl: "https://example.test/ref",
  });
  const {
    withEvent = true,
    dayOffset = 1,
    devices = 1,
    ...overrides
  } = options;
  const preferences = {
    ...DEFAULT_PROACTIVE_PREFERENCES,
    proactiveEnabled: true,
    quietStart: 0,
    quietEnd: 0,
    ...overrides,
  };
  const saved = await saveCompanionPreferences(userId, 0, preferences);
  const conversation = await createConversation({
    userId,
    girlfriendId: girlfriend.id,
  });
  const db = (await getDb())!;
  await db
    .insert(userPreferences)
    .values({ userId, language: "en", theme: "tokyo-sunset" });
  let eventId: number | undefined;
  if (withEvent) {
    const day = proactiveLocalClock(new Date(), preferences.timeZone)!.day;
    const eventDay = new Date(
      Date.parse(`${day}T12:00:00Z`) + dayOffset * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    const content = `我将在${eventDay}参加私密面试。`;
    const source = await createMessage({
      conversationId: conversation.id,
      role: "user",
      content,
      generationStatus: "succeeded",
      createdAt: new Date(Date.now() - 7 * 3_600_000),
    });
    await memory.storeExtractedMemories(userId, girlfriend.id, [
      { category: "event", content, sourceMessageId: source.id, importance: 7 },
    ]);
    eventId = (await memory.listMemories(userId, girlfriend.id))[0]?.id;
  }
  for (let index = 0; index < devices; index++)
    await push.savePushSubscription(userId, {
      endpoint: `https://push.example.test/${userId}/${index}`,
      keys: { p256dh: `public-${index}`, auth: `auth-${index}` },
    });
  return {
    userId,
    girlfriend,
    conversation,
    db,
    preferences,
    saved,
    eventId,
    contact: async () =>
      (
        await db
          .select()
          .from(proactiveContacts)
          .where(eq(proactiveContacts.userId, userId))
      )[0],
    subscriptions: async () =>
      db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId)),
  };
}

describe("consented proactive planning", () => {
  it("honors the global flag for both planning and already queued delivery", async () => {
    const a = await fixture();
    await planProactiveContact(a.userId);
    policy.proactive.enabled = false;
    const b = await fixture();
    expect(await planProactiveContact(b.userId)).toBeNull();
    await runProactiveContacts([a.userId]);
    expect((await a.contact()).status).toBe("cancelled");
    expect(webpush.send).not.toHaveBeenCalled();
  });

  it("resets ignore backoff when the latest contact is read even if older contacts remain unread", async () => {
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const a = await fixture({ proactiveMode: "daily", withEvent: false });
    await runProactiveContacts([a.userId]);
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    await runProactiveContacts([a.userId]);
    const contacts = await a.db
      .select()
      .from(proactiveContacts)
      .where(eq(proactiveContacts.userId, a.userId));
    expect(contacts).toHaveLength(2);
    const latest = contacts.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    )[0];
    await markNotificationRead(latest.notificationId, a.userId);
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    expect(await planProactiveContact(a.userId)).not.toBeNull();
  });

  it("defaults off and plans atomically without requiring VAPID", async () => {
    const a = await fixture({ proactiveEnabled: false });
    expect(await planProactiveContact(a.userId)).toBeNull();
    const b = await fixture();
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const checks = await Promise.all(
      Array.from({ length: 8 }, () => planProactiveContact(b.userId))
    );
    expect(checks.filter(Boolean)).toHaveLength(1);
    await runProactiveContacts([b.userId]);
    expect((await b.contact()).status).toBe("sent");
    expect(
      await b.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, b.userId))
    ).toHaveLength(1);
    expect(webpush.send).not.toHaveBeenCalled();
  });

  it.each([
    [-1, "event_followup", "notifications:eventFollowUp"],
    [0, "event_today", "notifications:eventToday"],
    [1, "event_upcoming", "notifications:eventUpcoming"],
  ])(
    "anchors a day-offset %s contact without guessing the event result",
    async (dayOffset, reason, key) => {
      const a = await fixture({ dayOffset: Number(dayOffset) });
      const notification = await planProactiveContact(a.userId);
      expect(notification?.content.key).toBe(key);
      expect((await a.contact()).reason).toBe(reason);
    }
  );

  it("requires reliable events unless the user explicitly selects daily contact", async () => {
    const a = await fixture({ withEvent: false });
    expect(await planProactiveContact(a.userId)).toBeNull();
    const b = await fixture({ withEvent: false, proactiveMode: "daily" });
    expect((await planProactiveContact(b.userId))?.content.key).toBe(
      "notifications:dailyCompanion"
    );
  });

  it("uses unread backoff and keeps the six-hour floor after a time-zone change deletes old previews", async () => {
    const a = await fixture({ proactiveMode: "daily", withEvent: false });
    await runProactiveContacts([a.userId]);
    const first = await a.contact();
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    expect(await planProactiveContact(a.userId)).toBeNull();
    await markNotificationRead(first.notificationId, a.userId);
    expect(await planProactiveContact(a.userId)).not.toBeNull();
    const b = await fixture({ proactiveMode: "daily", withEvent: false });
    await runProactiveContacts([b.userId]);
    vi.setSystemTime(new Date("2026-10-21T13:00:00Z"));
    await saveCompanionPreferences(b.userId, b.saved.revision, {
      ...b.preferences,
      timeZone: "Pacific/Kiritimati",
    });
    expect(await planProactiveContact(b.userId)).toBeNull();
  });

  it("respects local DND and the DST jump rather than the server clock", async () => {
    vi.setSystemTime(new Date("2026-03-08T06:30:00Z"));
    const a = await fixture({
      timeZone: "America/New_York",
      quietStart: 22 * 60,
      quietEnd: 8 * 60,
    });
    expect(await planProactiveContact(a.userId)).toBeNull();
    const b = await fixture({ timeZone: "America/New_York" });
    const notification = await planProactiveContact(b.userId);
    expect((await b.contact()).localDay).toBe("2026-03-08");
    vi.setSystemTime(new Date("2026-03-08T07:30:00Z"));
    await runProactiveContacts([b.userId]);
    expect((await b.contact()).status).toBe("sent");
    expect(notification).not.toBeNull();
  });
});

describe("durable device delivery", () => {
  it("bounds an external attempt below the lease and retries with the stable contact identity", async () => {
    const a = await fixture();
    policy.proactive.pushTimeoutMs = 100;
    webpush.send.mockImplementationOnce(() => new Promise(() => {}));
    const started = performance.now();
    await runProactiveContacts([a.userId]);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect((await a.contact()).status).toBe("pending");
    expect(webpush.send.mock.calls[0][2].timeout).toBe(100);
    const firstTag = JSON.parse(webpush.send.mock.calls[0][1]).tag;
    vi.setSystemTime(new Date(Date.now() + 31_000));
    await runProactiveContacts([a.userId]);
    expect((await a.contact()).status).toBe("sent");
    expect(JSON.parse(webpush.send.mock.calls[1][1]).tag).toBe(firstTag);
  });

  it.each(["global_flag", "preference", "dnd", "expiry"])(
    "revalidates %s after asynchronous transport preparation and before any device attempt",
    async change => {
      const a = await fixture({ quietStart: 12 * 60 + 30, quietEnd: 13 * 60 });
      await planProactiveContact(a.userId);
      const sender = await push.createPushSender();
      let enter!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => {
        enter = resolve;
      });
      const wait = new Promise<void>(resolve => {
        release = resolve;
      });
      vi.spyOn(push, "createPushSender").mockImplementationOnce(async () => {
        enter();
        await wait;
        return sender;
      });
      const running = runProactiveContacts([a.userId]);
      await started;
      if (change === "global_flag") policy.proactive.enabled = false;
      if (change === "preference")
        await saveCompanionPreferences(a.userId, a.saved.revision, {
          ...a.preferences,
          proactiveEnabled: false,
        });
      if (change === "dnd") vi.setSystemTime(new Date("2026-10-20T12:40:00Z"));
      if (change === "expiry")
        vi.setSystemTime(new Date("2026-10-20T14:01:00Z"));
      release();
      await running;
      expect(webpush.send).not.toHaveBeenCalled();
      if (change === "expiry" || change === "dnd") {
        await runProactiveContacts([a.userId]);
      }
      expect((await a.contact()).status).toBe(
        change === "dnd" ? "pending" : "cancelled"
      );
    }
  );

  it("treats a station read as delivered, retains it and still enforces a fourteen-day cadence", async () => {
    const a = await fixture({
      proactiveMode: "daily",
      withEvent: false,
      frequencyDays: 14,
    });
    const notification = await planProactiveContact(a.userId);
    await markNotificationRead(notification!.id, a.userId);
    await runProactiveContacts([a.userId]);
    expect((await a.contact()).status).toBe("sent");
    expect(webpush.send).not.toHaveBeenCalled();
    expect(
      await a.db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notification!.id))
    ).toHaveLength(1);
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    expect(await planProactiveContact(a.userId)).toBeNull();
  });

  it.each([
    ["2026-10-20T21:59:00Z", 22 * 60, 8 * 60, "2026-10-20T22:00:00.000Z"],
    ["2026-10-20T23:59:00Z", 0, 0, "2026-10-21T00:00:00.000Z"],
  ])(
    "clamps offline push expiry and TTL to DND or day end: %s",
    async (now, quietStart, quietEnd, expected) => {
      vi.setSystemTime(new Date(String(now)));
      const a = await fixture({
        quietStart: Number(quietStart),
        quietEnd: Number(quietEnd),
      });
      await runProactiveContacts([a.userId]);
      expect(JSON.parse(webpush.send.mock.calls[0][1]).expiresAt).toBe(
        expected
      );
      expect(webpush.send.mock.calls[0][2].TTL).toBe(60);
    }
  );

  it("claims one task across competing workers and hides private content by default", async () => {
    const a = await fixture();
    const notification = await planProactiveContact(a.userId);
    await Promise.all([
      runProactiveContacts([a.userId]),
      runProactiveContacts([a.userId]),
    ]);
    expect(webpush.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(webpush.send.mock.calls[0][1]);
    expect(payload).toMatchObject({
      title: "YUMEI",
      tag: `proactive:${notification!.contactId}`,
      notificationId: notification!.id,
      url: `/chats?notification=${notification!.id}`,
    });
    expect(payload.body).not.toMatch(/私密|面试|2026/);
    expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const receipts = await a.db
      .select()
      .from(proactiveDeliveries)
      .where(eq(proactiveDeliveries.userId, a.userId));
    expect(receipts).toMatchObject([{ status: "sent", attempts: 1 }]);
    expect((await a.contact()).status).toBe("sent");
    await runProactiveContacts([a.userId]);
    expect(webpush.send).toHaveBeenCalledTimes(1);
  });

  it("shows detailed text only after the explicit preview preference", async () => {
    const a = await fixture({ hidePrivatePreview: false });
    await runProactiveContacts([a.userId]);
    const payload = JSON.parse(webpush.send.mock.calls[0][1]);
    expect(payload.title).toContain("私密角色");
    expect(payload.body).toContain("私密面试");
  });

  it.each([
    "disable",
    "event_changed",
    "forget",
    "new_interaction",
    "active_chat",
  ])("cancels before external delivery when %s", async reason => {
    const a = await fixture();
    const notification = await planProactiveContact(a.userId);
    if (reason === "disable")
      await saveCompanionPreferences(a.userId, a.saved.revision, {
        ...a.preferences,
        proactiveEnabled: false,
      });
    if (reason === "event_changed")
      await a.db
        .update(memories)
        .set({ contentVersion: 2, eventStatus: "cancelled" })
        .where(eq(memories.id, a.eventId!));
    if (reason === "forget") await memory.deleteMemory(a.userId, a.eventId!);
    if (reason === "new_interaction")
      await createMessage({
        conversationId: a.conversation.id,
        role: "user",
        content: "我刚回来了",
        generationStatus: "succeeded",
      });
    if (reason === "active_chat")
      await a.db.insert(generationRequests).values({
        id: crypto.randomUUID(),
        userId: a.userId,
        conversationId: a.conversation.id,
        kind: "chat",
        expiresAt: new Date(Date.now() + 60_000),
      });
    await runProactiveContacts([a.userId]);
    expect(webpush.send).not.toHaveBeenCalled();
    expect((await a.contact()).status).toBe("cancelled");
    expect(
      await a.db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notification!.id))
    ).toEqual([]);
  });

  it("retries only the failed device and keeps successful receipts unchanged", async () => {
    const a = await fixture({ devices: 2 });
    const devices = await a.subscriptions();
    let fail = true;
    webpush.send.mockImplementation(
      async (subscription: { endpoint: string }) => {
        if (subscription.endpoint === devices[1].endpoint && fail)
          throw Object.assign(new Error("synthetic"), { statusCode: 503 });
      }
    );
    await runProactiveContacts([a.userId]);
    expect((await a.contact()).status).toBe("pending");
    fail = false;
    vi.setSystemTime(new Date(Date.now() + 31_000));
    await runProactiveContacts([a.userId]);
    expect(
      webpush.send.mock.calls.filter(
        call => call[0].endpoint === devices[0].endpoint
      )
    ).toHaveLength(1);
    expect(
      webpush.send.mock.calls.filter(
        call => call[0].endpoint === devices[1].endpoint
      )
    ).toHaveLength(2);
    expect((await a.contact()).status).toBe("sent");
  });

  it.each(["transferred", "rotated"])(
    "rechecks the complete device fingerprint before sending a %s endpoint",
    async change => {
      const a = await fixture();
      await planProactiveContact(a.userId);
      const [device] = await a.subscriptions();
      const sender = await push.createPushSender();
      let enter!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => {
        enter = resolve;
      });
      const wait = new Promise<void>(resolve => {
        release = resolve;
      });
      vi.spyOn(push, "createPushSender").mockImplementationOnce(async () => {
        enter();
        await wait;
        return sender;
      });
      const running = runProactiveContacts([a.userId]);
      await started;
      const owner =
        change === "transferred" ? await createTestUser() : a.userId;
      await push.savePushSubscription(owner, {
        endpoint: device.endpoint,
        keys: { p256dh: "new-public", auth: "new-auth" },
      });
      release();
      await running;
      expect(webpush.send).not.toHaveBeenCalled();
      const [updated] = await a.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.id, device.id));
      expect(updated.userId).toBe(owner);
      if (change === "rotated") {
        vi.setSystemTime(new Date(Date.now() + 31_000));
        await runProactiveContacts([a.userId]);
        expect(webpush.send).toHaveBeenCalledTimes(1);
        expect(webpush.send.mock.calls[0][0].keys.auth).toBe("new-auth");
        const [receipt] = await a.db
          .select()
          .from(proactiveDeliveries)
          .where(eq(proactiveDeliveries.userId, a.userId));
        expect(receipt.deviceHash).toBe(proactiveDeviceHash(updated));
      }
    }
  );

  it("does not acknowledge a stale lease and recovers it with the same stable tag", async () => {
    const a = await fixture();
    webpush.send.mockImplementationOnce(async () => {
      const contact = await a.contact();
      await a.db
        .update(proactiveContacts)
        .set({ leaseToken: crypto.randomUUID() })
        .where(eq(proactiveContacts.id, contact.id));
    });
    await runProactiveContacts([a.userId]);
    const contact = await a.contact();
    expect(
      (
        await a.db
          .select()
          .from(proactiveDeliveries)
          .where(eq(proactiveDeliveries.contactId, contact.id))
      )[0].status
    ).toBe("pending");
    await a.db
      .update(proactiveContacts)
      .set({
        leaseUntil: new Date(Date.now() - 1),
        nextRunAt: new Date(Date.now() - 1),
      })
      .where(eq(proactiveContacts.id, contact.id));
    await runProactiveContacts([a.userId]);
    expect((await a.contact()).status).toBe("sent");
    expect(webpush.send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(webpush.send.mock.calls[0][1]).tag).toBe(
      JSON.parse(webpush.send.mock.calls[1][1]).tag
    );
  });

  it("defers across a short DND window, but never dispatches an expired contact", async () => {
    const a = await fixture({ quietStart: 12 * 60 + 30, quietEnd: 13 * 60 });
    await planProactiveContact(a.userId);
    vi.setSystemTime(new Date("2026-10-20T12:40:00Z"));
    await runProactiveContacts([a.userId]);
    expect((await a.contact()).status).toBe("pending");
    expect(webpush.send).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-10-20T13:00:00Z"));
    await runProactiveContacts([a.userId]);
    expect((await a.contact()).status).toBe("sent");
    const b = await fixture();
    await planProactiveContact(b.userId);
    webpush.send.mockClear();
    vi.setSystemTime(new Date(Date.now() + 2 * 3_600_000 + 1));
    await runProactiveContacts([b.userId]);
    expect((await b.contact()).status).toBe("cancelled");
    expect(webpush.send).not.toHaveBeenCalled();
  });

  it("removes expired endpoints only when the same user and complete credentials still match", async () => {
    const a = await fixture();
    const [device] = await a.subscriptions();
    const newOwner = await createTestUser();
    webpush.send.mockImplementationOnce(async () => {
      await push.savePushSubscription(newOwner, {
        endpoint: device.endpoint,
        keys: { p256dh: "new-public", auth: "new-auth" },
      });
      throw Object.assign(new Error("expired"), { statusCode: 410 });
    });
    await runProactiveContacts([a.userId]);
    expect(await push.hasPushSubscription(newOwner, device.endpoint)).toBe(
      true
    );
    const b = await fixture();
    webpush.send.mockRejectedValueOnce(
      Object.assign(new Error("expired"), { statusCode: 404 })
    );
    await runProactiveContacts([b.userId]);
    expect(await b.subscriptions()).toEqual([]);
  });
});
