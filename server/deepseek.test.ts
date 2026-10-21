/** 覆盖DeepSeek 聊天、记忆及用户 BYOK 优先关系。 */

import axios from "axios";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generationRequests, messages, users } from "../drizzle/schema";
import { resolveChatProvider } from "./_core/chatProvider";
import { keyProvider } from "./_core/keyProvider";
import {
  getChatTurnSnapshot,
  runChatTurns,
  submitChatTurn,
} from "./chatStreaming";
import { getDb } from "./database";
import * as memory from "./memory";
import * as apiConfigDb from "./repositories/apiConfig";
import { createConversation } from "./repositories/conversations";
import { appRouter } from "./routers";
import { createTestGirlfriend, createTestUser } from "./testFixtures";

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
  vi.spyOn(keyProvider, "resolve").mockResolvedValue({
    value: "openrouter-test-secret",
    source: "operator",
  });
  vi.spyOn(keyProvider, "describeUserKeys").mockResolvedValue({
    openrouter: { isSet: false, lastFour: null, setAt: null },
  } as any);
  vi.spyOn(memory, "maybeExtractMemories").mockImplementation(async () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seed() {
  const userId = `deepseek-stream-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "测试",
    personality: "温柔",
    appearance: "自然",
    referenceImageKey: "deepseek-ref",
    referenceImageUrl: "https://example.test/ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const db = (await getDb())!;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return { userId, user, conversation, db };
}

describe("DeepSeek official API deployment", () => {
  it("sends chat to DeepSeek Flash and wakes persisted memory work for the same user", async () => {
    const { userId, user, conversation } = await seed();
    // A previous OpenRouter preference must not be sent to the DeepSeek endpoint.
    await apiConfigDb.upsertApiConfig({
      userId,
      llmModel: "openai/gpt-4o-mini",
    });
    vi.spyOn(memory, "buildMemoryPromptBlock").mockResolvedValue("");
    const extraction = vi.mocked(memory.maybeExtractMemories);
    const fetchMock = vi.fn(
      async (_url: unknown, _options: RequestInit) =>
        new Response(
          'data: {"choices":[{"delta":{"content":"你好呀"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { "Content-Type": "text/event-stream" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const accepted = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "你好",
    });
    await runChatTurns([userId]);
    const result = await getChatTurnSnapshot(userId, accepted.id);

    expect(result.assistantMessage.content).toBe("你好呀");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer deepseek-test-secret",
        }),
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject(
      { model: "deepseek-flash", thinking: { type: "disabled" }, stream: true }
    );
    expect(extraction).toHaveBeenCalledWith({ userId });
  });

  it("rejects missing DeepSeek keys before writes, even when an OpenRouter key exists", async () => {
    const { user, conversation, db } = await seed();
    vi.stubEnv("OPERATOR_DEEPSEEK_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      submitChatTurn(user, {
        clientRequestId: crypto.randomUUID(),
        conversationId: conversation.id,
        content: "你好",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(
      await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.userId, user.id))
    ).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
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
    await createTestUser(userId);
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { choices: [{ message: { content: '{"memories":[]}' } }] },
    });
    await memory.callExtractionModel(
      await resolveChatProvider(userId),
      [{ id: 1, role: "user", content: "我喜欢喝茶" }],
      { userId }
    );
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
