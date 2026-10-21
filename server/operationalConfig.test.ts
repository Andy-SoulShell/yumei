import axios from "axios";
import { keyProvider } from "./_core/keyProvider";
import {
  generateProviderImage,
  resolveImageProvider,
} from "./_core/imageProvider";
import { users } from "../drizzle/schema";
import { createConversation } from "./repositories/conversations";
import {
  submitChatTurn,
  runChatTurns,
  getChatTurnSnapshot,
} from "./chatStreaming";
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
import { readOfficialImage } from "./characterPresets";
const push = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: push.send },
}));
beforeAll(initializeProductConfig);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("keeps existing official images usable after publishing stricter upload limits while rejecting new uploads", () =>
  configured(async ({ admin, publish }) => {
    const discovery = await admin.discovery.get();
    const preset = discovery.characters.find(
      item => item.id === discovery.home.defaultPresetId
    )!;
    const original = await readOfficialImage(preset.imageUrl);
    expect(original.data.length).toBeGreaterThan(1024);
    expect(original.mimeType).toBe("image/jpeg");
    const config = structuredClone(productFixture);
    config.billing.mode = "none";
    config.uploads.official = { maxBytes: 1024, mimeTypes: ["image/png"] };
    await publish(config);
    expect((await admin.productConfig.get()).uploads.official).toEqual(
      config.uploads.official
    );
    expect(await readOfficialImage(preset.imageUrl)).toEqual(original);
    const defaultRole = await admin.girlfriend.ensureDefault();
    expect(defaultRole.officialPresetId).toBe(preset.id);
    const listed = discovery.characters.find(item => item.listed)!;
    const role = await admin.girlfriend.createFromPreset({
      presetId: listed.id,
    });
    expect(role.officialPresetId).toBe(listed.id);
    await expect(
      admin.discovery.admin.uploadImage({
        imageBase64: original.data.toString("base64"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }));
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

it("publishes provider, model, input and generation parameters into the actual chat request", () =>
  configured(async ({ userId, admin, publish }) => {
    const config = structuredClone(productFixture);
    config.billing.mode = "none";
    config.memory.enabled = false;
    config.models.chat = {
      provider: "deepseek",
      operatorBaseUrl: "https://gateway.example.test/v1",
      deepseekModel: "api-managed-model",
    };
    Object.assign(config.runtime.chat, {
      maxInputChars: 5,
      maxOutputChars: 20,
      maxTokens: 123,
      segmentChars: 5,
      temperature: 0.4,
      topP: 0.8,
    });
    await publish(config);
    vi.stubEnv("OPERATOR_DEEPSEEK_KEY", "server-secret");
    vi.stubEnv("LLM_PROVIDER", "openrouter");
    vi.stubEnv("DEEPSEEK_MODEL", "ignored-environment-model");
    vi.spyOn(keyProvider, "resolve").mockResolvedValue({
      source: "none",
      value: null,
    });
    const role = await createGirlfriend({
      userId,
      name: "聊天验证",
      personality: "自然",
      appearance: "自然",
      referenceImageKey: "ref",
      referenceImageUrl: "https://example.test/ref",
    });
    const conversation = await createConversation({
      userId,
      girlfriendId: role.id,
    });
    const [user] = await (await getDb())!
      .select()
      .from(users)
      .where(eq(users.id, userId));
    await expect(
      submitChatTurn(user, {
        clientRequestId: crypto.randomUUID(),
        conversationId: conversation.id,
        content: "超过五字的消息",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          'data: {"choices":[{"delta":{"content":"已切换"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { "Content-Type": "text/event-stream" } }
        )
      );
    vi.stubGlobal("fetch", request);
    const accepted = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "你好",
    });
    await runChatTurns([userId]);
    expect((await getChatTurnSnapshot(userId, accepted.id)).status).toBe(
      "succeeded"
    );
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://gateway.example.test/v1/chat/completions");
    expect(JSON.parse(options.body)).toMatchObject({
      model: "api-managed-model",
      max_tokens: 123,
      temperature: 0.4,
      top_p: 0.8,
    });
    expect((await admin.apiConfig.get()).chatProvider.model).toBe(
      "api-managed-model"
    );
  }));

it("publishes image models, network limits and editable ComfyUI nodes into actual provider calls", () =>
  configured(async ({ userId, admin, publish }) => {
    const config = structuredClone(productFixture);
    config.models.image.falSelfie = "test/published-selfie";
    Object.assign(config.runtime.image, {
      falTimeoutMs: 4321,
      downloadTimeoutMs: 8765,
      maxImageBytes: 1024,
    });
    await publish(config);
    vi.spyOn(keyProvider, "resolve").mockResolvedValue({
      source: "operator",
      value: "image-secret",
    });
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { images: [{ url: "https://image.example.test/result" }] },
    });
    const get = vi.spyOn(axios, "get").mockResolvedValue({ data: png });
    await generateProviderImage(await resolveImageProvider(userId), {
      mode: "reference",
      prompt: "场景",
      references: [{ key: "ref", url: "https://example.test/ref" }],
    });
    expect(post).toHaveBeenCalledWith(
      "https://fal.run/test/published-selfie",
      expect.any(Object),
      expect.objectContaining({ timeout: 4321 })
    );
    expect(get).toHaveBeenCalledWith(
      "https://image.example.test/result",
      expect.objectContaining({ timeout: 8765, maxContentLength: 1024 })
    );
    expect((await admin.apiConfig.get()).imageProvider.selfieModel).toBe(
      "test/published-selfie"
    );
    config.models.image.provider = "comfyui";
    config.models.image.comfyuiBaseUrl = "http://comfy.example.test:8188";
    const spec = config.models.image.workflows.text;
    spec.nodes[spec.seedNode].inputs.steps = 13;
    spec.nodes["459:451"].inputs.unet_name = "published.safetensors";
    spec.nodes["459:456"].inputs.width = 768;
    spec.id = "workflow:published";
    await publish(config);
    post.mockClear().mockResolvedValue({ data: { prompt_id: "job" } });
    get
      .mockReset()
      .mockResolvedValueOnce({
        data: {
          job: {
            status: { completed: true },
            outputs: {
              [spec.outputNode]: {
                images: [{ filename: "result.png", type: "output" }],
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({ data: png });
    await generateProviderImage(await resolveImageProvider(userId), {
      mode: "text",
      prompt: "新场景",
      references: [],
    });
    const submitted = (post.mock.calls[0][1] as { prompt: typeof spec.nodes })
      .prompt;
    expect(submitted[spec.seedNode].inputs.steps).toBe(13);
    expect(submitted["459:451"].inputs.unet_name).toBe("published.safetensors");
    expect(submitted["459:456"].inputs.width).toBe(768);
    expect(submitted[spec.promptNode].inputs.prompt).toBe("新场景");
  }));

it("rejects inconsistent operational configuration before replacing a draft", () =>
  configured(async ({ admin }) => {
    const draft = await admin.productConfig.admin.getDraft();
    for (const change of [
      (c: typeof productFixture) => {
        c.themes.items.push(structuredClone(c.themes.items[0]));
      },
      (c: typeof productFixture) => {
        c.proactive.defaults.proactiveEnabled = true;
      },
      (c: typeof productFixture) => {
        c.proactive.templates["notifications:privatePreview"] = {
          "zh-CN": "{{memory}}",
        };
      },
      (c: typeof productFixture) => {
        c.uploads.requestMaxBytes = 1024 * 1024;
      },
      (c: typeof productFixture) => {
        c.models.chat.operatorBaseUrl =
          "https://user:password@gateway.example.test";
      },
      (c: typeof productFixture) => {
        c.models.image.workflows.text.seedNode = "missing";
      },
      (c: typeof productFixture) => {
        c.runtime.chat.leaseMs = c.runtime.chat.heartbeatMs;
      },
    ]) {
      const config = structuredClone(productFixture);
      change(config);
      await expect(
        admin.productConfig.admin.save({
          expectedRevision: draft.revision,
          config,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(await admin.productConfig.admin.getDraft()).toEqual(draft);
  }));
