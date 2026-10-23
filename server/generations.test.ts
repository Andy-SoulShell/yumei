import { stubProductConfig } from "./testProductConfig";
/** 通过真实路由、MySQL 和磁盘验证生成成功结算及失败补偿。 */
import axios from "axios";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  conversations,
  generationRequests,
  selfies,
  usageMeters,
  users,
} from "../drizzle/schema";
import { TIER_LIMITS, productFixture } from "./testProductConfig";
import * as chat from "./_core/chatProvider";
import type { TrpcContext } from "./_core/context";
import * as images from "./_core/imageProvider";
import {
  getDailyMeter,
  getMonthlyMeter,
  tryConsumeDailyMeter,
} from "./_core/quota";
import * as billing from "./billing";
import { getDb } from "./database";
import {
  completeImageGeneration,
  expireGenerations,
  failGeneration,
  failImageGeneration,
  reserveGeneration,
} from "./generations";
import {
  getChatTurnSnapshot,
  runChatTurns,
  submitChatTurn,
} from "./chatStreaming";
import * as memory from "./memory";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import {
  createConversation,
  getConversationMessages,
  getRecentMessages,
} from "./repositories/conversations";
import { appRouter } from "./routers";
import * as storage from "./storage";
import { createTestGirlfriend } from "./testFixtures";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const reply = (text = "你好呀") =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    { headers: { "Content-Type": "text/event-stream" } }
  );

async function seed() {
  const userId = `generation-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "YUMEI",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const [user] = await (await getDb())!
    .select()
    .from(users)
    .where(eq(users.id, userId));
  const caller = appRouter.createCaller({
    user: { id: userId, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as TrpcContext);
  return { userId, user, gf, conversation, caller };
}

beforeEach(() => {
  stubProductConfig("billing.mode", "free");
  vi.spyOn(chat, "resolveChatProvider").mockResolvedValue({
    name: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    apiKey: "fake-provider-secret",
    isByok: false,
  });
  vi.spyOn(images, "resolveImageProvider").mockResolvedValue({
    name: "fal",
    configured: true,
    apiKey: "fake-image-secret",
    isByok: false,
  });
  vi.spyOn(memory, "maybeExtractMemories").mockImplementation(async () => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("generation settlement", () => {
  it("updates conversation activity atomically for text, images and persisted failure messages", async () => {
    const { userId, user, conversation } = await seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply("reply"))
    );
    const db = (await getDb())!;
    for (const kind of ["chat", "selfie", "failed"] as const) {
      await db
        .update(conversations)
        .set({ updatedAt: new Date("2020-01-01T00:00:00Z") })
        .where(eq(conversations.id, conversation.id));
      if (kind === "chat") {
        await submitChatTurn(user, {
          clientRequestId: crypto.randomUUID(),
          conversationId: conversation.id,
          content: "hello",
        });
        await runChatTurns([userId]);
      } else {
        const id = await reserveGeneration({
          userId,
          conversationId: conversation.id,
          kind: "selfie",
        });
        if (kind === "failed") await failImageGeneration(id, userId, "自拍");
        else
          await completeImageGeneration(id, userId, {
            imageKey: "test-activity",
            imageUrl: "https://example.test/photo",
            prompt: "test",
            userContext: "test",
            mode: "direct",
          });
      }
      const [saved] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversation.id));
      expect(saved.updatedAt.getTime()).toBeGreaterThan(
        new Date("2020-01-01").getTime()
      );
    }
  });
  it("refunds failed LLM calls without writing fallback messages or leaking credentials, then charges only the successful retry", async () => {
    const { userId, user, conversation } = await seed();
    const error = new axios.AxiosError(
      "fake-provider-secret private-content",
      "ERR_BAD_RESPONSE",
      {
        headers: new axios.AxiosHeaders({
          Authorization: "Bearer fake-provider-secret",
        }),
        data: "private-content",
      }
    );
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const post = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockImplementation(async () => reply());
    vi.stubGlobal("fetch", post);
    const failed = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "private-content",
    });
    await runChatTurns([userId]);
    expect((await getChatTurnSnapshot(userId, failed.id)).status).toBe(
      "failed"
    );
    expect(await getDailyMeter(userId, "chat")).toBe(0);
    expect(await getConversationMessages(conversation.id)).toMatchObject([
      {
        role: "user",
        content: "private-content",
        generationStatus: "succeeded",
      },
      { role: "assistant", content: "", generationStatus: "failed" },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /fake-provider-secret|private-content/
    );
    const accepted = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "你好",
    });
    await runChatTurns([userId]);
    const result = await getChatTurnSnapshot(userId, accepted.id);
    expect(result.assistantMessage.generationStatus).toBe("succeeded");
    expect(await getDailyMeter(userId, "chat")).toBe(1);
    expect(await getConversationMessages(conversation.id)).toHaveLength(4);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("retains the accepted user message and refunds when oversized assistant output cannot be saved", async () => {
    const { userId, user, conversation } = await seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply("x".repeat(70_000)))
    );
    const accepted = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "你好",
    });
    await runChatTurns([userId]);
    expect((await getChatTurnSnapshot(userId, accepted.id)).status).toBe(
      "failed"
    );
    expect(await getConversationMessages(conversation.id)).toMatchObject([
      { role: "user", content: "你好", generationStatus: "succeeded" },
      { role: "assistant", content: "", generationStatus: "failed" },
    ]);
    expect(await getDailyMeter(userId, "chat")).toBe(0);
  });

  it("treats empty model replies as failures", async () => {
    const { userId, user, conversation } = await seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(""))
    );
    const accepted = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "你好",
    });
    await runChatTurns([userId]);
    expect((await getChatTurnSnapshot(userId, accepted.id)).status).toBe(
      "failed"
    );
    expect(await getDailyMeter(userId, "chat")).toBe(0);
  });

  it("refunds camera and chat selfies, marks failure messages, and excludes them from later model context", async () => {
    const { userId, conversation, caller } = await seed();
    const generate = vi
      .spyOn(images, "generateProviderImage")
      .mockRejectedValue(new Error("fake-image-secret"));
    await expect(
      caller.selfie.generate({
        conversationId: conversation.id,
        userContext: "自拍",
      })
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    const failed = await caller.chat.sendMessage({
      conversationId: conversation.id,
      content: "发张自拍",
    });
    expect(failed.imageGeneration).toBe("failed");
    expect(failed.assistantMessage.generationStatus).toBe("failed");
    expect(JSON.stringify(failed)).not.toContain("fake-image-secret");
    expect(await getDailyMeter(userId, "selfie")).toBe(0);
    expect(await getRecentMessages(conversation.id, 10)).toEqual([]);
    generate.mockResolvedValue(png);
    const success = await caller.selfie.generate({
      conversationId: conversation.id,
      userContext: "自拍",
    });
    expect(success.selfie?.messageId).toBe(success.message.id);
    expect(await getDailyMeter(userId, "selfie")).toBe(1);
    expect(await storage.storageRead(success.selfie!.imageKey)).toEqual(png);
  });

  it("refunds storage failures before any gallery or image message is committed", async () => {
    const { userId, conversation, caller } = await seed();
    vi.spyOn(images, "generateProviderImage").mockResolvedValue(png);
    vi.spyOn(storage, "storagePut").mockRejectedValue(new Error("disk full"));
    await expect(
      caller.selfie.generate({
        conversationId: conversation.id,
        userContext: "自拍",
      })
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    expect(await getDailyMeter(userId, "selfie")).toBe(0);
    expect(
      await (await getDb())!
        .select()
        .from(selfies)
        .where(eq(selfies.userId, userId))
    ).toEqual([]);
    expect(await getConversationMessages(conversation.id)).toEqual([]);
  });

  it("validates couple input before reserving and refunds monthly quota plus removes temporary photos on generation failure", async () => {
    const { userId, conversation, caller } = await seed();
    vi.spyOn(billing, "getTierLimits").mockResolvedValue({
      tier: "pro",
      limits: TIER_LIMITS.pro,
      plan: productFixture.billing.plans.find(plan => plan.id === "pro")!,
      configuration: productFixture,
    });
    vi.spyOn(images, "generateProviderImage").mockRejectedValue(
      new Error("upstream down")
    );
    const input = {
      conversationId: conversation.id,
      userPhotoBase64: png.toString("base64"),
      userPhotoMimeType: "text/plain",
    };
    await expect(caller.selfie.generateCouple(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(
      await (await getDb())!
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.userId, userId))
    ).toEqual([]);
    await expect(
      caller.selfie.generateCouple({ ...input, userPhotoMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    expect(await getMonthlyMeter(userId, "selfie")).toBe(0);
    const [request] = await (await getDb())!
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.userId, userId));
    expect(request.status).toBe("failed");
    await expect(storage.storageRead(request.temporaryKey!)).rejects.toThrow();
  });

  it("refunds the original UTC period exactly once across concurrent compensation and midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T23:59:50Z"));
    const { userId, user, conversation } = await seed();
    const { id } = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "跨日请求",
    });
    vi.setSystemTime(new Date("2026-10-20T00:00:10Z"));
    await tryConsumeDailyMeter(userId, "chat", 30, 2);
    await Promise.all(
      Array.from({ length: 6 }, () => failGeneration(id, userId))
    );
    const [original] = await (await getDb())!
      .select()
      .from(usageMeters)
      .where(
        and(
          eq(usageMeters.userId, userId),
          eq(usageMeters.period, "2026-10-19"),
          eq(usageMeters.meter, "chat")
        )
      );
    expect(original.count).toBe(0);
    expect(await getDailyMeter(userId, "chat")).toBe(2);
  });

  it("recovers expired reservations and prevents late success after recovery", async () => {
    const { userId, user, conversation } = await seed();
    const { id } = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "你好",
    });
    const db = (await getDb())!;
    await db
      .update(generationRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(generationRequests.id, id));
    await expireGenerations(userId);
    await expireGenerations(userId);
    expect(await getDailyMeter(userId, "chat")).toBe(0);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await runChatTurns([userId]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getChatTurnSnapshot(userId, id)).status).toBe("failed");
    expect(await getConversationMessages(conversation.id)).toMatchObject([
      { role: "user", content: "你好", generationStatus: "succeeded" },
      { role: "assistant", content: "", generationStatus: "failed" },
    ]);
  });

  it("cancels pending reservations with role deletion and cleans a late image output", async () => {
    const { userId, gf, conversation, caller } = await seed();
    let finish!: (value: Buffer) => void;
    vi.spyOn(images, "generateProviderImage").mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const result = caller.selfie
      .generate({ conversationId: conversation.id, userContext: "自拍" })
      .catch(error => error);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const [request] = await (await getDb())!
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.userId, userId));
    await permanentDeleteGirlfriend(gf.id, userId);
    finish(png);
    expect(await result).toMatchObject({ code: "BAD_GATEWAY" });
    expect(await getDailyMeter(userId, "selfie")).toBe(0);
    expect(await getConversationMessages(conversation.id)).toEqual([]);
    await expect(storage.storageRead(request.outputKey!)).rejects.toThrow();
  });
});

it("rejects a depleted reservation with its exact quota reason without charging again", async () => {
  const { userId, conversation } = await seed();
  await tryConsumeDailyMeter(userId, "chat", 1);
  await expect(
    reserveGeneration({
      userId,
      conversationId: conversation.id,
      kind: "chat",
      meter: { name: "chat", period: "day", limit: 1, what: "messages" },
    })
  ).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
    cause: {
      details: {
        reason: "QUOTA_EXCEEDED",
        meter: "chat",
        period: "day",
        limit: 1,
        resetAt: expect.stringMatching(/T00:00:00\.000Z$/),
      },
    },
  });
  expect(await getDailyMeter(userId, "chat")).toBe(1);
});
