/** 覆盖聊天触发自拍的意图、上下文与失败反馈。 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { appRouter } from "./routers";
import * as db from "./db";
import * as storage from "./storage";
import * as providers from "./_core/imageProvider";
import * as chat from "./_core/chatProvider";
import * as memory from "./memory";
import * as billing from "./billing";
import * as quota from "./_core/quota";

let serial = 0;
const caller = () =>
  appRouter.createCaller({
    user: { id: `selfie-chat-${serial++}`, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as any);

beforeEach(() => {
  vi.stubEnv("BILLING_PROVIDER", "none");
  quota.resetRateLimits();
  vi.spyOn(db, "getConversation").mockResolvedValue({
    id: 42,
    girlfriendId: 12,
  } as any);
  vi.spyOn(db, "getActiveGirlfriend").mockResolvedValue({
    id: 12,
    name: "美咲",
    intimacyLevel: 10,
    appearance: "成年动漫女性，职业衬衫",
    referenceImageKey: "misaki.jpg",
    referenceImageUrl: "http://app/files/misaki.jpg",
  } as any);
  vi.spyOn(db, "getRecentMessages").mockResolvedValue([
    { role: "assistant", content: "我在咖啡馆，穿着蓝色衬衫。" },
  ] as any);
  let id = 1;
  vi.spyOn(db, "createMessage").mockImplementation(
    async data => ({ id: id++, ...data }) as any
  );
  vi.spyOn(db, "createSelfie").mockImplementation(
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
    expect(db.getActiveGirlfriend).toHaveBeenCalledWith(expect.any(String), 12);
    expect(result.userMessage.content).toBe("发张自拍");
    expect(result.assistantMessage.imageUrl).toBe(
      "http://app/files/selfie.png"
    );
    expect(db.createMessage).toHaveBeenNthCalledWith(1, {
      conversationId: 42,
      role: "user",
      content: "发张自拍",
    });
    expect(db.createMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversationId: 42,
        role: "assistant",
        imageUrl: "http://app/files/selfie.png",
      })
    );
    expect(db.createSelfie).toHaveBeenCalledWith(
      expect.objectContaining({ girlfriendId: 12 })
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
    vi.mocked(db.getConversation).mockResolvedValueOnce(undefined);
    await expect(
      caller().chat.sendMessage({ conversationId: 42, content: "发张自拍" })
    ).rejects.toThrow("not owned");
    vi.mocked(db.getActiveGirlfriend).mockResolvedValueOnce({
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
    expect(db.createMessage).not.toHaveBeenCalled();
    expect(providers.generateProviderImage).not.toHaveBeenCalled();
  });
  it("enforces selfie quotas even though the request arrived through chat", async () => {
    vi.stubEnv("BILLING_PROVIDER", "free");
    vi.spyOn(billing, "getTierLimits").mockResolvedValue({
      tier: "free",
      limits: { dailySelfies: 5 },
    } as any);
    vi.spyOn(quota, "consumeDailyMeter").mockRejectedValue(
      new Error("Selfie quota exceeded")
    );
    await expect(
      caller().chat.sendMessage({ conversationId: 42, content: "发张自拍" })
    ).rejects.toThrow("Selfie quota exceeded");
    expect(db.createMessage).not.toHaveBeenCalled();
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
    expect(db.createSelfie).not.toHaveBeenCalled();
    expect(db.createMessage).toHaveBeenCalledTimes(2);
  });
  it("reports a storage failure without creating a fake image message", async () => {
    vi.mocked(storage.storagePut).mockRejectedValue(new Error("disk full"));
    const result = await caller().chat.sendMessage({
      conversationId: 42,
      content: "发张自拍",
    });
    expect(result.imageGeneration).toBe("failed");
    expect(result.assistantMessage.imageUrl).toBeUndefined();
    expect(db.createSelfie).not.toHaveBeenCalled();
    expect(db.createMessage).toHaveBeenCalledTimes(2);
  });
  it("leaves ordinary chat on the normal LLM path", async () => {
    vi.spyOn(chat, "resolveChatProvider").mockResolvedValue({
      name: "deepseek",
      model: "deepseek-flash",
      apiKey: "fake",
      baseUrl: "https://api.deepseek.com",
    });
    vi.spyOn(db, "getUserApiConfig").mockResolvedValue(undefined);
    vi.spyOn(memory, "buildMemoryPromptBlock").mockResolvedValue("");
    vi.spyOn(memory, "maybeExtractMemories").mockImplementation(() => {});
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { choices: [{ message: { content: "今天很开心" } }] },
    });
    const result = await caller().chat.sendMessage({
      conversationId: 42,
      content: "你现在穿什么",
    });
    expect(result.assistantMessage.content).toBe("今天很开心");
    expect(result.imageGeneration).toBeNull();
    expect(providers.generateProviderImage).not.toHaveBeenCalled();
  });
});
