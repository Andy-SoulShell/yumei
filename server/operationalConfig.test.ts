import express from "express";
import * as storage from "./storage";
import { uploadBodyParser } from "./_core/uploads";
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

it("uses published upload byte and MIME restrictions in actual avatar and HTTP parser paths", () =>
  configured(async ({ userId, admin, publish }) => {
    const config = structuredClone(productFixture);
    for (const name of [
      "avatar",
      "reference",
      "couple",
      "official",
      "audio",
    ] as const)
      config.uploads[name].maxBytes = 3;
    config.uploads.avatar.mimeTypes = ["image/png"];
    config.uploads.requestMaxBytes = 1024 * 1024;
    await publish(config);
    const role = await createGirlfriend({
      userId,
      name: "上传验证",
      personality: "自然",
      appearance: "自然",
      referenceImageKey: "ref",
      referenceImageUrl: "https://example.test/ref",
    });
    const upload = (bytes: number, mimeType: "image/png" | "image/jpeg") =>
      admin.girlfriend.uploadAvatar({
        girlfriendId: role.id,
        imageBase64: Buffer.alloc(bytes).toString("base64"),
        mimeType,
      });
    const stored = vi
      .spyOn(storage, "storagePut")
      .mockImplementation(async key => ({
        key,
        url: "https://example.test/" + key,
      }));
    await expect(upload(4, "image/png")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(upload(3, "image/jpeg")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(stored).not.toHaveBeenCalled();
    await upload(3, "image/png");
    expect(stored).toHaveBeenCalledOnce();
    const app = express();
    app.use(uploadBodyParser());
    app.post("/upload", (_req, res) => {
      res.json({ success: true });
    });
    app.use(
      (
        error: { status?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(error.status ?? 500).end();
      }
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const address = server.address() as { port: number };
      const request = () =>
        fetch(`http://127.0.0.1:${address.port}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: "x".repeat(1024 * 1024) }),
        });
      expect((await request()).status).toBe(413);
      config.uploads.requestMaxBytes = 2 * 1024 * 1024;
      await publish(config);
      expect((await request()).status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  }));
