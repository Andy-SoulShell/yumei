/** 发布后以真实偏好、规划与推送验证运营配置，无需重新启动服务。 */
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { notifications, proactiveContacts } from "../drizzle/schema";
import { configured } from "./testConfiguredProduct";
import { productFixture } from "./testProductConfig";
import { initializeProductConfig } from "./repositories/productConfig";
import { getDb } from "./database";
import { createGirlfriend } from "./repositories/companions";
import { saveCompanionPreferences } from "./companionPreferences";
import { getCompanionPreferences } from "./aiTaskRuntime";
import { runProactiveContacts, planProactiveContact } from "./proactive";
import { savePushSubscription } from "./push";
import { renderNotification } from "../shared/notifications";
const push = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: push.send },
}));
beforeAll(initializeProductConfig);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("publishes frequency bounds, defaults, lifetime and templates used by the actual outbox and inbox", () =>
  configured(async ({ userId, publish }) => {
    const config = structuredClone(productFixture);
    Object.assign(config.proactive.frequencyDays, { min: 2, max: 40 });
    Object.assign(config.proactive.defaults, {
      frequencyDays: 2,
      quietStart: 0,
      quietEnd: 0,
    });
    config.proactive.minimumGapMs = 0;
    config.proactive.contactLifetimeMs = 300000;
    config.proactive.templates["notifications:title.thinkingOfYou"] = {
      "zh-CN": "{{name}}的新问候",
    };
    config.proactive.templates["notifications:dailyCompanion"] = {
      "zh-CN": "你好 {{name}}",
    };
    await publish(config);
    const prefs = await getCompanionPreferences(userId);
    expect(prefs).toMatchObject({ frequencyDays: 2, proactiveEnabled: false });
    const preferences = {
      ...config.proactive.defaults,
      proactiveEnabled: true,
      proactiveMode: "daily" as const,
      hidePrivatePreview: false,
    };
    await expect(
      saveCompanionPreferences(userId, 0, { ...preferences, frequencyDays: 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await saveCompanionPreferences(userId, 0, preferences);
    await createGirlfriend({
      userId,
      name: "海风",
      personality: "自然",
      appearance: "自然",
      referenceImageUrl: "https://example.test/ref",
      referenceImageKey: "ref",
    });
    vi.stubEnv("VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    await savePushSubscription(userId, {
      endpoint: "https://push.example.test/" + userId,
      keys: { auth: "auth", p256dh: "key" },
    });
    push.send.mockResolvedValue({});
    await runProactiveContacts([userId]);
    const db = (await getDb())!;
    const [contact] = await db
      .select()
      .from(proactiveContacts)
      .where(eq(proactiveContacts.userId, userId));
    expect(contact.status).toBe("sent");
    expect(contact.expiresAt.getTime() - contact.createdAt.getTime()).toBe(
      300000
    );
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, contact.notificationId));
    const payload = JSON.parse(push.send.mock.calls[0][1]);
    expect(payload.title).toBe(
      renderNotification(config.proactive, notification.title, "en")
    );
    expect(payload.body).toBe("你好 海风");
    expect(payload.title).toBe("海风的新问候");
    config.proactive.enabled = false;
    await publish(config);
    expect(await planProactiveContact(userId)).toBeNull();
  }));
