/** 覆盖聊天触发自拍的意图、上下文与失败反馈。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as chat from "./_core/chatProvider";
import * as providers from "./_core/imageProvider";
import * as billing from "./billing";
import * as generations from "./generations";
import * as cleanup from "./mediaCleanup";
import * as companionsDb from "./repositories/companions";
import * as conversationsDb from "./repositories/conversations";
import * as photosDb from "./repositories/photos";
import { appRouter } from "./routers";
import * as storage from "./storage";

let serial = 0;
const caller = () =>
  appRouter.createCaller({
    user: { id: `selfie-chat-${serial++}`, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as any);

beforeEach(() => {
  vi.spyOn(generations, "reserveGeneration").mockResolvedValue("mock-request");
  vi.spyOn(generations, "failGeneration").mockResolvedValue(undefined);
  vi.spyOn(cleanup, "flushMediaDeletions").mockResolvedValue(undefined);
  vi.spyOn(cleanup, "queueMediaDeletion").mockResolvedValue(undefined);
  vi.spyOn(generations, "completeImageGeneration").mockImplementation(
    async (_id, _userId, image, content) =>
      ({
        selfie: { ...image, girlfriendId: 12 },
        message: { ...image, content: "[自拍照片]" },
        userMessage: content === undefined ? undefined : { content },
        imageGeneration: "completed",
      }) as any
  );
  vi.spyOn(generations, "failImageGeneration").mockImplementation(
    async (_id, _userId, content) =>
      ({
        selfie: null,
        message: {
          content: "这次自拍没有生成成功，本次未扣额度",
          generationStatus: "failed",
        },
        userMessage: { content },
        imageGeneration: "failed",
      }) as any
  );

  vi.stubEnv("BILLING_PROVIDER", "none");
  vi.spyOn(conversationsDb, "getConversation").mockResolvedValue({
    id: 42,
    girlfriendId: 12,
  } as any);
  vi.spyOn(companionsDb, "getActiveGirlfriend").mockResolvedValue({
    id: 12,
    name: "美咲",
    intimacyLevel: 10,
    appearance: "成年动漫女性，职业衬衫",
    referenceImageKey: "misaki.jpg",
    referenceImageUrl: "http://app/files/misaki.jpg",
  } as any);
  vi.spyOn(conversationsDb, "getRecentMessages").mockResolvedValue([
    { role: "assistant", content: "我在咖啡馆，穿着蓝色衬衫。" },
  ] as any);
  let id = 1;
  vi.spyOn(conversationsDb, "createMessage").mockImplementation(
    async data => ({ id: id++, ...data }) as any
  );
  vi.spyOn(photosDb, "createSelfie").mockImplementation(
    async data => ({ id: 1, ...data }) as any
  );
  vi.spyOn(storage, "storagePut").mockResolvedValue({
    key: "selfie.png",
    url: "http://app/files/selfie.png",
  });
  vi.spyOn(providers, "resolveImageProvider").mockResolvedValue({
    name: "comfyui",
    apiKey: null,
    configured: true,
    isByok: false,
  });
  vi.spyOn(providers, "generateProviderImage").mockResolvedValue(
    Buffer.from([137, 80, 78, 71])
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("chat-triggered selfies", () => {
  it("generates in the current conversation without needing or calling an LLM", async () => {
    const llm = vi.spyOn(chat, "resolveChatProvider");
    const result = await caller().chat.sendMessage({
      conversationId: 42,
      content: "发张自拍",
    });
    expect(llm).not.toHaveBeenCalled();
    expect(result.imageGeneration).toBe("completed");
    expect(companionsDb.getActiveGirlfriend).toHaveBeenCalledWith(
      expect.any(String),
      12
    );
    expect(result.userMessage.content).toBe("发张自拍");
    expect(result.assistantMessage.imageUrl).toBe(
      "http://app/files/selfie.png"
    );
    expect(generations.completeImageGeneration).toHaveBeenCalledWith(
      "mock-request",
      expect.any(String),
      expect.objectContaining({ imageUrl: "http://app/files/selfie.png" }),
      "发张自拍"
    );
    expect(providers.generateProviderImage).toHaveBeenCalledWith(
      expect.objectContaining({ name: "comfyui" }),
      expect.objectContaining({
        mode: "reference",
        prompt: expect.stringContaining("蓝色衬衫"),
        references: [{ key: "misaki.jpg", url: "http://app/files/misaki.jpg" }],
      })
    );
  });
  it("does not write or generate for another user's conversation, locked poses or unconfigured service", async () => {
    vi.mocked(conversationsDb.getConversation).mockResolvedValueOnce(undefined);
    await expect(
      caller().chat.sendMessage({ conversationId: 42, content: "发张自拍" })
    ).rejects.toThrow("not owned");
    vi.mocked(companionsDb.getActiveGirlfriend).mockResolvedValueOnce({
      id: 12,
      intimacyLevel: 1,
    } as any);
    await expect(
      caller().chat.sendMessage({
        conversationId: 42,
        content: "发张自拍，要约会夜的风格",
      })
    ).rejects.toThrow("LEVEL_LOCKED");
    vi.mocked(providers.resolveImageProvider).mockResolvedValueOnce({
      name: "comfyui",
      configured: false,
      apiKey: null,
      isByok: false,
    });
    await expect(
      caller().chat.sendMessage({ conversationId: 42, content: "发张自拍" })
    ).rejects.toThrow("COMFYUI_BASE_URL");
    expect(conversationsDb.createMessage).not.toHaveBeenCalled();
    expect(providers.generateProviderImage).not.toHaveBeenCalled();
  });
  it("enforces selfie quotas even though the request arrived through chat", async () => {
    vi.stubEnv("BILLING_PROVIDER", "free");
    vi.spyOn(billing, "getTierLimits").mockResolvedValue({
      tier: "free",
      limits: { dailySelfies: 5 },
    } as any);
    vi.mocked(generations.reserveGeneration).mockRejectedValue(
      new Error("Selfie quota exceeded")
    );
    await expect(
      caller().chat.sendMessage({ conversationId: 42, content: "发张自拍" })
    ).rejects.toThrow("Selfie quota exceeded");
    expect(conversationsDb.createMessage).not.toHaveBeenCalled();
    expect(providers.generateProviderImage).not.toHaveBeenCalled();
  });
  it("persists a failure reply without claiming to have sent an image", async () => {
    vi.mocked(providers.generateProviderImage).mockRejectedValue(
      new Error("timeout; secret-token-not-for-user")
    );
    const result = await caller().chat.sendMessage({
      conversationId: 42,
      content: "发张自拍",
    });
    expect(result.imageGeneration).toBe("failed");
    expect(result.assistantMessage.content).toContain("没有生成成功");
    expect(result.assistantMessage.imageUrl).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(photosDb.createSelfie).not.toHaveBeenCalled();
    expect(generations.failImageGeneration).toHaveBeenCalledTimes(1);
  });
  it("reports a storage failure without creating a fake image message", async () => {
    vi.mocked(storage.storagePut).mockRejectedValue(new Error("disk full"));
    const result = await caller().chat.sendMessage({
      conversationId: 42,
      content: "发张自拍",
    });
    expect(result.imageGeneration).toBe("failed");
    expect(result.assistantMessage.imageUrl).toBeUndefined();
    expect(photosDb.createSelfie).not.toHaveBeenCalled();
    expect(generations.failImageGeneration).toHaveBeenCalledTimes(1);
  });
  it.each(["你现在穿什么", "我想自杀，发张自拍"])(
    "rejects text before any provider or reservation: %s",
    async content => {
      const llm = vi.spyOn(chat, "resolveChatProvider");
      await expect(
        caller().chat.sendMessage({ conversationId: 42, content })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(llm).not.toHaveBeenCalled();
      expect(generations.reserveGeneration).not.toHaveBeenCalled();
      expect(providers.generateProviderImage).not.toHaveBeenCalled();
    }
  );
});
