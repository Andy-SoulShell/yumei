/** 覆盖DeepSeek 聊天、记忆及用户 BYOK 优先关系。 */

import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveChatProvider } from "./_core/chatProvider";
import { keyProvider } from "./_core/keyProvider";
import * as generations from "./generations";
import * as cleanup from "./mediaCleanup";
import * as memory from "./memory";
import * as apiConfigDb from "./repositories/apiConfig";
import * as companionsDb from "./repositories/companions";
import * as conversationsDb from "./repositories/conversations";
import { appRouter } from "./routers";

const userId = "deepseek-test-user";
const caller = appRouter.createCaller({
  user: { id: userId, birthDate: new Date("1990-01-01") },
  req: {},
  res: {},
} as any);

beforeEach(() => {
  vi.spyOn(generations, "reserveGeneration").mockResolvedValue("mock-request");
  vi.spyOn(generations, "failGeneration").mockResolvedValue(undefined);
  vi.spyOn(cleanup, "flushMediaDeletions").mockResolvedValue(undefined);
  vi.spyOn(cleanup, "queueMediaDeletion").mockResolvedValue(undefined);
  vi.spyOn(generations, "completeTextGeneration").mockImplementation(
    async (_id, _userId, content, reply) =>
      ({
        userMessage: { id: 1, role: "user", content },
        assistantMessage: { id: 2, role: "assistant", content: reply },
      }) as any
  );
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

  vi.stubEnv("LLM_PROVIDER", "deepseek");
  vi.stubEnv("DEEPSEEK_MODEL", "deepseek-flash");
  vi.stubEnv("OPERATOR_DEEPSEEK_KEY", "deepseek-test-secret");
  vi.stubEnv("OPERATOR_OPENROUTER_KEY", "openrouter-test-secret");
  vi.stubEnv("BILLING_PROVIDER", "none");
  vi.spyOn(keyProvider, "resolve").mockResolvedValue({
    value: "openrouter-test-secret",
    source: "operator",
  });
  vi.spyOn(keyProvider, "describeUserKeys").mockResolvedValue({
    openrouter: { isSet: false, lastFour: null, setAt: null },
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("DeepSeek official API deployment", () => {
  it("sends chat to DeepSeek Flash and wakes persisted memory work for the same user", async () => {
    vi.spyOn(conversationsDb, "getConversation").mockResolvedValue({
      id: 1,
      userId,
    } as any);
    vi.spyOn(companionsDb, "getActiveGirlfriend").mockResolvedValue({
      id: 1,
      name: "测试",
      personality: "温柔",
      appearance: "自然",
      intimacyLevel: 1,
    } as any);
    vi.spyOn(conversationsDb, "createMessage").mockImplementation(
      async input => input as any
    );
    vi.spyOn(conversationsDb, "getRecentMessages").mockResolvedValue([
      { role: "user", content: "你好" },
    ] as any);
    // A previous OpenRouter preference must not be sent to the DeepSeek endpoint.
    vi.spyOn(apiConfigDb, "getUserApiConfig").mockResolvedValue({
      llmModel: "openai/gpt-4o-mini",
    } as any);
    vi.spyOn(memory, "buildMemoryPromptBlock").mockResolvedValue("");
    const extraction = vi
      .spyOn(memory, "maybeExtractMemories")
      .mockImplementation(() => {});
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { choices: [{ message: { content: "你好呀" } }] },
    });

    const result = await caller.chat.sendMessage({
      conversationId: 1,
      content: "你好",
    });

    expect(result.assistantMessage.content).toBe("你好呀");
    expect(post).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        model: "deepseek-flash",
        thinking: { type: "disabled" },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer deepseek-test-secret",
        }),
      })
    );
    expect(extraction).toHaveBeenCalledWith({ userId });
  });

  it("rejects missing DeepSeek keys before writes, even when an OpenRouter key exists", async () => {
    vi.stubEnv("OPERATOR_DEEPSEEK_KEY", "");
    const write = vi.spyOn(conversationsDb, "createMessage");
    const post = vi.spyOn(axios, "post");
    await expect(
      caller.chat.sendMessage({ conversationId: 1, content: "你好" })
    ).rejects.toThrow("OPERATOR_DEEPSEEK_KEY");
    expect(write).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("returns the configured model and readiness without exposing the server key", async () => {
    vi.spyOn(apiConfigDb, "getUserApiConfig").mockResolvedValue(undefined);
    const get = vi.spyOn(axios, "get");
    const config = await caller.apiConfig.get();
    const models = await caller.apiConfig.listModels();
    expect(config.chatProvider).toEqual({
      name: "deepseek",
      model: "deepseek-flash",
      configured: true,
    });
    expect(models.models.map((m: { id: string }) => m.id)).toEqual([
      "deepseek-flash",
    ]);
    expect(JSON.stringify({ config, models })).not.toContain(
      "deepseek-test-secret"
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps user OpenRouter keys on OpenRouter when the operator uses DeepSeek", async () => {
    vi.mocked(keyProvider.describeUserKeys).mockResolvedValue({
      openrouter: { isSet: true, lastFour: "1234", setAt: null },
    } as any);
    vi.mocked(keyProvider.resolve).mockResolvedValue({
      value: "user-openrouter-key",
      source: "user",
    });
    const provider = await resolveChatProvider(userId);
    expect(provider).toMatchObject({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "user-openrouter-key",
    });
    expect(provider.apiKey).not.toBe("deepseek-test-secret");
  });

  it("retains the original OpenRouter default when no provider is specified", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.spyOn(keyProvider, "get").mockResolvedValue("openrouter-test-secret");
    expect(await resolveChatProvider(userId)).toMatchObject({
      name: "openrouter",
      model: "openai/gpt-4o-mini",
      apiKey: "openrouter-test-secret",
    });
  });

  it("extracts JSON memories through DeepSeek instead of the hardcoded OpenRouter model", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { choices: [{ message: { content: '{"memories":[]}' } }] },
    });
    await memory.callExtractionModel(await resolveChatProvider(userId), [
      { id: 1, role: "user", content: "我喜欢喝茶" },
    ]);
    await vi.waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "https://api.deepseek.com/chat/completions",
        expect.objectContaining({
          model: "deepseek-flash",
          response_format: { type: "json_object" },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer deepseek-test-secret",
          }),
        })
      )
    );
  });
});
