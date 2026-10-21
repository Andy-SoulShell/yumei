/** 管理 API 的真实发布直接驱动聊天请求、记忆限制与迟到任务处理。 */
import axios from "axios";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  productConfiguration,
  users,
  memoryExtractionJobs,
} from "../drizzle/schema";
import { buildChatSystemPrompt } from "../shared/chatPrompt";
import { shouldExtractMemories } from "../shared/memory";
import type { ProductConfig } from "../shared/productConfig";
import * as database from "./database";
import * as repository from "./repositories/productConfig";
import * as providers from "./_core/chatProvider";
import * as memory from "./memory";
import { runMemoryExtractionJobs } from "./memoryJobs";
import { createGirlfriend } from "./repositories/companions";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import { submitChatTurn, runChatTurns } from "./chatStreaming";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";
import { productFixture } from "./testProductConfig";
import { buildImagePrompt } from "./promptTemplates";
import { generateMemorySummary, readMemorySummary } from "./memoryDerived";

beforeAll(repository.initializeProductConfig);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 配置单独回滚，业务使用真实提交和用户锁；其他测试进程看不到这里的发布。 */
async function configured(
  work: (context: {
    userId: string;
    admin: ReturnType<typeof appRouter.createCaller>;
    publish: (config: ProductConfig) => Promise<void>;
  }) => Promise<void>
) {
  const db = (await database.getDb())!;
  const userId = await createTestUser();
  const admin = appRouter.createCaller({
    user: { id: userId, role: "admin", birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as never);
  const rollback = new Error("rollback isolated AI configuration");
  try {
    await db.transaction(
      async tx => {
        const published = vi
          .spyOn(repository, "getPublishedProductConfig")
          .mockImplementation(async () => {
            const [row] = await tx
              .select()
              .from(productConfiguration)
              .where(eq(productConfiguration.id, "main"));
            return {
              ...row.published,
              revision: row.publishedRevision,
              publishedAt: row.publishedAt,
            };
          });
        const publish = async (config: ProductConfig) => {
          const connection = vi
            .spyOn(database, "getDb")
            .mockResolvedValue(tx as never);
          try {
            const draft = await admin.productConfig.admin.getDraft();
            const saved = await admin.productConfig.admin.save({
              expectedRevision: draft.revision,
              config,
            });
            await admin.productConfig.admin.publish({
              expectedRevision: saved.revision,
            });
          } finally {
            connection.mockRestore();
          }
        };
        try {
          await work({ userId, admin, publish });
        } finally {
          published.mockRestore();
        }
        throw rollback;
      },
      { isolationLevel: "read committed" }
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function companion(userId: string, points = 0) {
  const girlfriend = await createGirlfriend({
    userId,
    name: "API测试",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref",
    intimacyPoints: points,
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: girlfriend.id,
  });
  return { girlfriend, conversation };
}
const provider = {
  name: "openrouter" as const,
  baseUrl: "https://configuration.example.test/v1",
  model: "test/chat",
  apiKey: "fake",
  isByok: true,
};

describe("AI publication execution", () => {
  it("stops displaying and recalling a cached summary after publishing a different template", () =>
    configured(async ({ userId, publish }) => {
      const config = structuredClone(productFixture);
      await publish(config);
      const { girlfriend, conversation } = await companion(userId);
      const source = await createMessage({
        conversationId: conversation.id,
        role: "user",
        content: "我喜欢下棋。",
        generationStatus: "succeeded",
      });
      await memory.storeExtractedMemories(userId, girlfriend.id, [
        {
          category: "preference",
          content: source.content,
          importance: 7,
          sourceMessageId: source.id,
        },
      ]);
      const [fact] = await memory.listMemories(userId, girlfriend.id);
      vi.spyOn(providers, "resolveChatProvider").mockResolvedValue(provider);
      vi.spyOn(axios, "post").mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({ memoryIds: [fact.id], topics: [] }),
              },
            },
          ],
        },
      });
      await generateMemorySummary(
        userId,
        girlfriend.id,
        conversation.id,
        source.id,
        provider
      );
      expect(await readMemorySummary(userId, girlfriend.id)).not.toBeNull();
      config.prompts.summary = "发布后的摘要模板\n" + config.prompts.summary;
      await publish(config);
      expect(await readMemorySummary(userId, girlfriend.id)).toBeNull();
      expect(
        (await memory.getMemoryState(userId, girlfriend.id)).summary
      ).toBeNull();
    }));
  it("renders the exact same published platform prompt for preview and an actual chat request", () =>
    configured(async ({ userId, publish }) => {
      const config = structuredClone(productFixture);
      config.memory.enabled = false;
      config.prompts.chat.expression.warm = "API 发布后的表达规则";
      config.prompts.chat.system =
        "API 模板标识\n" + config.prompts.chat.system;
      config.prompts.image.reference = "API 图片模板：{{scene}}";
      await publish(config);
      const { girlfriend, conversation } = await companion(userId);
      vi.spyOn(providers, "resolveChatProvider").mockResolvedValue(provider);
      vi.spyOn(memory, "maybeExtractMemories").mockResolvedValue();
      const fetch = vi.fn(
        async () =>
          new Response(
            'data: {"choices":[{"delta":{"content":"收到。"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            { headers: { "content-type": "text/event-stream" } }
          )
      );
      vi.stubGlobal("fetch", fetch);
      const [user] = await (await database.getDb())!
        .select()
        .from(users)
        .where(eq(users.id, userId));
      await submitChatTurn(user, {
        clientRequestId: crypto.randomUUID(),
        conversationId: conversation.id,
        content: "这是一条普通测试消息",
      });
      await runChatTurns([userId]);
      const request = JSON.parse(
        (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
          .body as string
      );
      const published = await repository.getPublishedProductConfig();
      expect(request.messages[0].content).toBe(
        buildChatSystemPrompt(
          published,
          girlfriend,
          {},
          { memoryEnabled: false }
        )
      );
      expect(request.messages[0].content).toContain("API 发布后的表达规则");
      expect(
        buildImagePrompt(published, {
          userContext: "保留本次场景",
          generationMode: "reference",
          appearance: "自然",
        }).prompt
      ).toBe("API 图片模板：保留本次场景");
    }));

  it("shares actual capacity, recall count and edit limits with the memory state API", () =>
    configured(async ({ userId, admin, publish }) => {
      const config = structuredClone(productFixture);
      config.memory.levelRules = [
        { minLevel: 1, capacity: 2, recallCount: 1 },
        { minLevel: 2, capacity: 3, recallCount: 2 },
      ];
      config.memory.maxEditedLength = 12;
      config.memory.extraction = {
        ...config.memory.extraction,
        everyRounds: 2,
        firstRound: false,
        explicitRequests: false,
      };
      config.memory.summary.enabled = false;
      await publish(config);
      const { girlfriend, conversation } = await companion(userId, 100);
      for (const [index, content] of Array.from(
        [
          "我在上海工作。",
          "我喜欢弹钢琴。",
          "我周末经常跑步。",
          "我养了一只狗。",
        ].entries()
      )) {
        const source = await createMessage({
          conversationId: conversation.id,
          role: "user",
          content,
          generationStatus: "succeeded",
        });
        await memory.storeExtractedMemories(userId, girlfriend.id, [
          {
            category: "fact",
            content,
            importance: index + 1,
            sourceMessageId: source.id,
          },
        ]);
      }
      expect(
        await memory.enforceMemoryCapacity(userId, girlfriend.id, 99)
      ).toBe(1);
      const state = await admin.memory.state({ girlfriendId: girlfriend.id });
      expect(state.capacity).toBe(3);
      expect(state.rules.maxEditedLength).toBe(12);
      expect(state.rules.levelRules).toEqual(config.memory.levelRules);
      const records = await memory.listMemories(userId, girlfriend.id);
      expect(records).toHaveLength(3);
      const block = await memory.buildMemoryPromptBlock(
        userId,
        girlfriend.id,
        "普通聊天",
        99
      );
      expect(
        JSON.parse(block.match(/<memory-data>([\s\S]*)<\/memory-data>/)![1])
      ).toHaveLength(2);
      await expect(
        admin.memory.edit({
          id: records[0].id,
          content: "这是一段超过十二个字符的编辑内容",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await admin.memory.edit({ id: records[0].id, content: "我喜欢阅读。" });
      expect(shouldExtractMemories(1, "请记住这句话", state.rules)).toBe(false);
      expect(shouldExtractMemories(2, "普通聊天", state.rules)).toBe(true);
    }));

  it("uses published extraction parameters and retries instead of storing a result after a new publication", () =>
    configured(async ({ userId, publish }) => {
      const config = structuredClone(productFixture);
      config.prompts.extraction = "API 提取模板\n" + config.prompts.extraction;
      config.memory.extraction.models.openrouter = "test/dynamic-model";
      config.memory.extraction.temperature = 0.6;
      config.memory.extraction.maxTokens = 768;
      config.memory.jobs.retryBaseMs = 100;
      config.memory.summary.enabled = false;
      await publish(config);
      const { girlfriend, conversation } = await companion(userId);
      const source = await createMessage({
        conversationId: conversation.id,
        role: "user",
        content: "我喜欢柠檬茶。",
        generationStatus: "succeeded",
      });
      await (await database.getDb())!.insert(memoryExtractionJobs).values({
        id: crypto.randomUUID(),
        userId,
        girlfriendId: girlfriend.id,
        conversationId: conversation.id,
        lastMessageId: source.id,
        intimacyLevel: girlfriend.intimacyLevel,
        memoryEpoch: girlfriend.memoryEpoch,
      });
      vi.spyOn(providers, "resolveChatProvider").mockResolvedValue(provider);
      const post = vi.spyOn(axios, "post").mockImplementation(async () => {
        const next = structuredClone(config);
        next.memory.extraction.temperature = 0.7;
        await publish(next);
        return {
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    memories: [
                      {
                        category: "preference",
                        sourceMessageId: source.id,
                        quote: source.content,
                        importance: 7,
                      },
                    ],
                  }),
                },
              },
            ],
          },
        };
      });
      await runMemoryExtractionJobs(userId);
      const body = post.mock.calls[0][1] as any;
      expect(body.model).toBe("test/dynamic-model");
      expect(body.temperature).toBe(0.6);
      expect(body.max_tokens).toBe(768);
      expect(body.messages[0].content).toContain("API 提取模板");
      expect(await memory.listMemories(userId, girlfriend.id)).toHaveLength(0);
      const [job] = await (await database.getDb())!
        .select()
        .from(memoryExtractionJobs)
        .where(eq(memoryExtractionJobs.userId, userId));
      expect(job).toMatchObject({ status: "pending", attempts: 1 });
    }));
});
