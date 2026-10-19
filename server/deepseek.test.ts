import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import * as db from "./db";
import * as memory from "./memory";
import { keyProvider } from "./_core/keyProvider";
import { resolveChatProvider } from "./_core/chatProvider";
import { appRouter } from "./routers";

const userId = "deepseek-test-user";
const caller = appRouter.createCaller({
  user: { id: userId, birthDate: new Date("1990-01-01") },
  req: {},
  res: {},
} as any);

beforeEach(() => {
  vi.stubEnv("LLM_PROVIDER", "deepseek");
  vi.stubEnv("DEEPSEEK_MODEL", "deepseek-flash");
  vi.stubEnv("OPERATOR_DEEPSEEK_KEY", "deepseek-test-secret");
  vi.stubEnv("OPERATOR_OPENROUTER_KEY", "openrouter-test-secret");
  vi.stubEnv("BILLING_PROVIDER", "none");
  vi.spyOn(keyProvider, "describeUserKeys").mockResolvedValue({
    openrouter: { isSet: false, lastFour: null, setAt: null },
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("DeepSeek official API deployment", () => {
  it("sends chat to DeepSeek Flash and passes the same provider to memory extraction", async () => {
    vi.spyOn(db, "getConversation").mockResolvedValue({ id: 1, userId } as any);
    vi.spyOn(db, "getActiveGirlfriend").mockResolvedValue({
      id: 1,
      name: "测试",
      personality: "温柔",
      appearance: "自然",
      intimacyLevel: 1,
    } as any);
    vi.spyOn(db, "createMessage").mockImplementation(
      async input => input as any
    );
    vi.spyOn(db, "getRecentMessages").mockResolvedValue([
      { role: "user", content: "你好" },
    ] as any);
    // A previous OpenRouter preference must not be sent to the DeepSeek endpoint.
    vi.spyOn(db, "getUserApiConfig").mockResolvedValue({
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
    expect(extraction).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          name: "deepseek",
          model: "deepseek-flash",
        }),
      })
    );
  });

  it("rejects missing DeepSeek keys before writes, even when an OpenRouter key exists", async () => {
    vi.stubEnv("OPERATOR_DEEPSEEK_KEY", "");
    const write = vi.spyOn(db, "createMessage");
    const post = vi.spyOn(axios, "post");
    await expect(
      caller.chat.sendMessage({ conversationId: 1, content: "你好" })
    ).rejects.toThrow("OPERATOR_DEEPSEEK_KEY");
    expect(write).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("returns the configured model and readiness without exposing the server key", async () => {
    vi.spyOn(db, "getUserApiConfig").mockResolvedValue(undefined);
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
    vi.spyOn(keyProvider, "get").mockResolvedValue("user-openrouter-key");
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
    const limit = vi
      .fn()
      .mockResolvedValue([{ role: "user", content: "我喜欢喝茶" }]);
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({ where: async () => [{ count: 10 }] }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ orderBy: () => ({ limit }) }) }),
      });
    vi.spyOn(db, "getDb").mockResolvedValue({ select } as any);
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { choices: [{ message: { content: '{"memories":[]}' } }] },
    });
    memory.maybeExtractMemories({
      userId,
      girlfriendId: 1,
      conversationId: 1,
      intimacyLevel: 1,
      provider: await resolveChatProvider(userId),
    });
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
