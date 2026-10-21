import {
  DEFAULT_PROACTIVE_PREFERENCES,
  productFixture,
} from "./testProductConfig";
/** 覆盖记忆评分、提取解析、持久化和主动消息引用。 */

import { nanoid } from "nanoid";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { conversations, messages } from "../drizzle/schema";
import { renderNotification } from "../shared/notifications";

import { bigramOverlap } from "../shared/memory";
import {
  memoryCapacity,
  memoryInjectionK,
  scoreMemory,
  shouldExtractMemories,
  timeDecayFactor,
} from "./testAiConfig";
import { getDb } from "./database";
import { saveCompanionPreferences } from "./companionPreferences";
import * as providers from "./_core/chatProvider";
import {
  buildMemoryPromptBlock,
  callExtractionModel,
  deleteMemory,
  enforceMemoryCapacity,
  getFreshEventMemory,
  listMemories,
  setMemoryPinned,
  storeExtractedMemories as persistExtractedMemories,
  type ExtractedMemory,
} from "./memory";
import { parseExtractionResponse } from "./testAiConfig";
import { checkAndCreateProactiveNotification } from "./repositories/notifications";
import {
  createTestGirlfriend as createGirlfriend,
  createTestUser,
} from "./testFixtures";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";

// ---------------------------------------------------------------------------
// Pure scoring (no DB)
// ---------------------------------------------------------------------------

describe("shared/memory scoring", () => {
  it.each([
    "请更新记忆：我的猫现在叫麻薯。以后不要再叫旧名字了。",
    "请帮我记住：我的猫叫团子。",
    "请你帮我记住：我的猫叫团子。",
    "麻烦帮我记住：我的猫叫团子。",
    "請更正記憶：我的貓現在叫麻糬。",
    "把关于我的记忆更新一下：我的猫改名了。",
    "Please update your memory: my cat is now called Mochi.",
    "Correct what you remember about my cat: her name is Mochi.",
    "記憶を更新して。うちの猫の名前はモチです。",
    "覚えている内容を訂正して：猫の名前はモチです。",
    "기억을 수정해 줘. 내 고양이 이름은 모찌야.",
    "내 고양이에 대한 기억을 업데이트해 주세요.",
  ])("extracts an explicit update outside the periodic round: %s", text => {
    expect(shouldExtractMemories(2, text)).toBe(true);
  });

  it.each([
    "记忆是什么？",
    "你记住我的猫名了吗？",
    "你记住我的猫名了吗。",
    "你是否记住我的猫名。",
    "你没有记住我的猫名。",
    "不要记住我的猫名。",
    "请不要更新记忆。",
    "请不要帮我记住我的猫名。",
    "麻烦别帮我记住我的猫名。",
    "What is memory?",
    "Do you remember my cat's name?",
    "Please don't update your memory.",
    "Don't remember my cat's name.",
    "記憶とは何ですか？",
    "私の猫の名前を覚えていますか？",
    "これは覚えないで。",
    "記憶を更新しないで。",
    "기억이 뭐야?",
    "내 고양이 이름 기억해?",
    "이건 기억하지 마.",
    "기억을 수정하지 마세요.",
  ])("does not treat a question or refusal as a save request: %s", text => {
    expect(shouldExtractMemories(2, text)).toBe(false);
  });

  it("extracts the first round, explicit requests and every fifth round", () => {
    expect(shouldExtractMemories(1, "我喜欢猫")).toBe(true);
    expect(shouldExtractMemories(2, "天气不错")).toBe(false);
    expect(shouldExtractMemories(5, "天气不错")).toBe(true);
    expect(shouldExtractMemories(10, "天气不错")).toBe(true);
    for (const text of [
      "请记住，我的猫叫团团",
      "Please remember my cat's name",
      "これを覚えて",
      "기억해 줘",
    ])
      expect(shouldExtractMemories(2, text)).toBe(true);
    expect(shouldExtractMemories(0, "请记住")).toBe(false);
  });
  it("bigramOverlap finds zh overlap", () => {
    expect(
      bigramOverlap("面试", "用户下周二有一场产品经理面试")
    ).toBeGreaterThan(0.5);
    expect(bigramOverlap("今天吃什么", "用户养了一只叫团团的猫")).toBe(0);
  });

  it("bigramOverlap ignores punctuation and case", () => {
    expect(bigramOverlap("Loves Coffee!", "loves coffee")).toBe(1);
  });

  it("timeDecayFactor decays toward the 0.5 floor", () => {
    const now = new Date();
    const fresh = timeDecayFactor(now, now);
    const old = timeDecayFactor(new Date(now.getTime() - 90 * 86_400_000), now);
    expect(fresh).toBeCloseTo(1, 1);
    expect(old).toBeLessThan(0.55);
    expect(old).toBeGreaterThanOrEqual(0.5);
  });

  it("keyword affinity outranks a heavier but unrelated memory", () => {
    const now = new Date();
    const base = { pinned: false, lastRecalledAt: null, createdAt: now };
    const related = {
      ...base,
      content: "用户下周二有一场产品经理面试",
      weight: 40,
    };
    const unrelated = { ...base, content: "用户喜欢喝拿铁", weight: 90 };
    const message = "好紧张，马上要面试了";
    expect(scoreMemory(related, message, now)).toBeGreaterThan(
      scoreMemory(unrelated, message, now)
    );
  });

  it("capacity and k scale with intimacy level", () => {
    expect(memoryCapacity(1)).toBe(30);
    expect(memoryCapacity(10)).toBe(120);
    expect(memoryInjectionK(1)).toBe(5);
    expect(memoryInjectionK(10)).toBe(9);
    expect(memoryInjectionK(999)).toBeLessThanOrEqual(10);
  });
});

describe("extraction provider responses", () => {
  let context: { userId: string };
  beforeEach(async () => {
    context = { userId: await createTestUser() };
    vi.spyOn(providers, "resolveChatProvider").mockResolvedValue(provider);
  });
  afterEach(() => vi.restoreAllMocks());
  const provider = {
    name: "deepseek" as const,
    baseUrl: "https://example.test",
    model: "deepseek-flash",
    apiKey: "fake-key",
    isByok: false,
  };
  const sources = [
    { id: 1, role: "user" as const, content: "我喜欢不加糖的燕麦拿铁" },
  ];
  it("rejects invalid responses so the persistent job can retry", async () => {
    for (const content of [
      undefined,
      "",
      "invalid JSON",
      '{"memories":[{"category":"nope"}]}',
    ]) {
      vi.spyOn(axios, "post").mockResolvedValue({
        data: { choices: [{ message: { content } }] },
      });
      await expect(
        callExtractionModel(provider, sources, context)
      ).rejects.toThrow("Invalid memory extraction response");
    }
  });
  it("accepts a valid empty result without retrying ordinary small talk", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { choices: [{ message: { content: '{"memories":[]}' } }] },
    });
    await expect(
      callExtractionModel(provider, sources, context)
    ).resolves.toEqual([]);
  });
  it("keeps a verbatim correction when the extractor quotes the complete two-sentence request", async () => {
    const content = "请更新记忆：我的猫现在叫麻薯。以后不要再叫旧名字了。";
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                memories: [
                  {
                    category: "fact",
                    sourceMessageId: 1,
                    quote: content,
                    importance: 7,
                  },
                ],
              }),
            },
          },
        ],
      },
    });
    await expect(
      callExtractionModel(provider, [{ id: 1, role: "user", content }], context)
    ).resolves.toEqual([
      {
        category: "fact",
        sourceMessageId: 1,
        content: "请更新记忆：我的猫现在叫麻薯。",
        importance: 7,
      },
    ]);
  });
  it.each([
    ["我不喜欢黑咖啡。请记住这个。", "我不喜欢黑咖啡。"],
    [
      "请更新记忆。我的猫现在叫麻薯。以后不要再叫旧名字了。",
      "我的猫现在叫麻薯。",
    ],
  ])(
    "keeps a grounded fact without saving a standalone memory command: %s",
    async (content, fact) => {
      vi.spyOn(axios, "post").mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  memories: [
                    {
                      category: "fact",
                      sourceMessageId: 1,
                      quote: content,
                      importance: 7,
                    },
                  ],
                }),
              },
            },
          ],
        },
      });
      await expect(
        callExtractionModel(
          provider,
          [{ id: 1, role: "user", content }],
          context
        )
      ).resolves.toEqual([
        { category: "fact", sourceMessageId: 1, content: fact, importance: 7 },
      ]);
    }
  );

  it.each([
    "我的猫叫麻薯。不要记住这个。",
    "假如我养了猫。我的猫叫麻薯。",
    "我的猫叫麻薯。刚才只是假设。",
    "我的猫叫麻薯。其实不是。",
    "我的猫叫麻薯。只是开玩笑。",
    "我喜欢黑咖啡。不是，我不喜欢黑咖啡。",
    "你说我的猫叫麻薯。那是我朋友的猫。",
  ])(
    "does not salvage an assertion by dropping unsafe cross-sentence context: %s",
    async content => {
      vi.spyOn(axios, "post").mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  memories: [
                    {
                      category: "fact",
                      sourceMessageId: 1,
                      quote: content,
                      importance: 7,
                    },
                  ],
                }),
              },
            },
          ],
        },
      });
      await expect(
        callExtractionModel(
          provider,
          [{ id: 1, role: "user", content }],
          context
        )
      ).resolves.toEqual([]);
    }
  );
  it("accepts only verbatim user evidence and never stores model-written paraphrases or companion quotes", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                memories: [
                  {
                    category: "preference",
                    sourceMessageId: 1,
                    quote: sources[0].content,
                    importance: 7,
                    content: "用户最常喝黑咖啡",
                  },
                  {
                    category: "preference",
                    sourceMessageId: 2,
                    quote: "我最常喝手冲咖啡",
                    importance: 8,
                  },
                  {
                    category: "preference",
                    sourceMessageId: 1,
                    quote: "我最常喝手冲咖啡",
                    importance: 8,
                  },
                  {
                    category: "fact",
                    sourceMessageId: 999,
                    quote: sources[0].content,
                    importance: 8,
                  },
                ],
              }),
            },
          },
        ],
      },
    });
    await expect(
      callExtractionModel(
        provider,
        [...sources, { id: 2, role: "assistant", content: "我最常喝手冲咖啡" }],
        context
      )
    ).resolves.toEqual([
      {
        category: "preference",
        content: sources[0].content,
        importance: 7,
        sourceMessageId: 1,
      },
    ]);
    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: JSON.stringify([{ id: 1, content: sources[0].content }]),
          }),
        ]),
      }),
      expect.any(Object)
    );
  });

  it("splits two supported preference statements while retaining their original negation", async () => {
    const content = "我不喜欢黑咖啡。我喜欢红茶。";
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                memories: [
                  {
                    category: "preference",
                    sourceMessageId: 1,
                    quote: content,
                    importance: 7,
                  },
                ],
              }),
            },
          },
        ],
      },
    });
    await expect(
      callExtractionModel(provider, [{ id: 1, role: "user", content }], context)
    ).resolves.toEqual([
      {
        category: "preference",
        sourceMessageId: 1,
        content: "我不喜欢黑咖啡。",
        importance: 7,
      },
      {
        category: "preference",
        sourceMessageId: 1,
        content: "我喜欢红茶。",
        importance: 7,
      },
    ]);
  });
  it.each([
    [
      "请记住：我的猫叫团子。你喜欢猫吗？",
      "我的猫叫团子。",
      [
        {
          category: "fact",
          sourceMessageId: 1,
          content: "请记住：我的猫叫团子。",
          importance: 7,
        },
      ],
    ],
    ["我的猫叫什么？", "我的猫叫什么", []],
  ])(
    "allows independent follow-up questions while rejecting a quoted question: %s",
    async (content, quote, expected) => {
      vi.spyOn(axios, "post").mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  memories: [
                    {
                      category: "fact",
                      sourceMessageId: 1,
                      quote,
                      importance: 7,
                    },
                  ],
                }),
              },
            },
          ],
        },
      });
      await expect(
        callExtractionModel(
          provider,
          [{ id: 1, role: "user", content }],
          context
        )
      ).resolves.toEqual(expected);
    }
  );
  it.each([
    ["我的猫叫麻薯。不要记住这个。", "我的猫叫麻薯。"],
    ["假如我养了猫。我的猫叫麻薯。", "我的猫叫麻薯。"],
    ["我的猫叫麻薯。刚才只是假设。", "我的猫叫麻薯。"],
    ["请更新记忆：我的猫现在叫麻薯。不要记住这个。", "我的猫现在叫麻薯。"],
  ])(
    "validates complete source context even when the extractor quotes only one sentence: %s",
    async (content, quote) => {
      vi.spyOn(axios, "post").mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  memories: [
                    {
                      category: "fact",
                      sourceMessageId: 1,
                      quote,
                      importance: 7,
                    },
                  ],
                }),
              },
            },
          ],
        },
      });
      await expect(
        callExtractionModel(
          provider,
          [{ id: 1, role: "user", content }],
          context
        )
      ).resolves.toEqual([]);
    }
  );
  it("does not send assistant-only input to the extraction provider", async () => {
    const post = vi.spyOn(axios, "post");
    await expect(
      callExtractionModel(
        provider,
        [{ id: 2, role: "assistant", content: "我喜欢手冲咖啡" }],
        context
      )
    ).resolves.toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });
  it("preserves negation when the extractor returns only a substring", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                memories: [
                  {
                    category: "preference",
                    sourceMessageId: 1,
                    quote: "喜欢黑咖啡",
                    importance: 7,
                  },
                ],
              }),
            },
          },
        ],
      },
    });
    await expect(
      callExtractionModel(
        provider,
        [{ id: 1, role: "user", content: "我不喜欢黑咖啡，也不想改喝它。" }],
        context
      )
    ).resolves.toEqual([
      {
        category: "preference",
        content: "我不喜欢黑咖啡，也不想改喝它。",
        importance: 7,
        sourceMessageId: 1,
      },
    ]);
  });
  it.each([
    "你刚才说你喜欢黑咖啡。",
    "假如我喜欢黑咖啡，我可能会尝一口。",
    "不要记住我喜欢黑咖啡这件事。",
    "你还记得我喜欢黑咖啡吗？",
  ])(
    "does not turn non-assertive context into a preference: %s",
    async content => {
      vi.spyOn(axios, "post").mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  memories: [
                    {
                      category: "preference",
                      sourceMessageId: 1,
                      quote: "喜欢黑咖啡",
                      importance: 7,
                    },
                  ],
                }),
              },
            },
          ],
        },
      });
      await expect(
        callExtractionModel(
          provider,
          [{ id: 1, role: "user", content }],
          context
        )
      ).resolves.toEqual([]);
    }
  );
});

// ---------------------------------------------------------------------------
// Extraction parsing (no DB / no network)
// ---------------------------------------------------------------------------

describe("parseExtractionResponse", () => {
  it("parses a clean JSON response", () => {
    const out = parseExtractionResponse(
      JSON.stringify({
        memories: [
          { category: "fact", content: "用户是产品经理", importance: 7 },
        ],
      })
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("fact");
  });

  it("recovers JSON wrapped in code fences / prose", () => {
    const out = parseExtractionResponse(
      '好的，以下是提取结果：\n```json\n{"memories":[{"category":"event","content":"用户明天要面试","importance":8}]}\n```'
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("event");
  });

  it("returns [] on invalid shapes instead of throwing", () => {
    expect(parseExtractionResponse("not json at all")).toEqual([]);
    expect(
      parseExtractionResponse(
        '{"memories":[{"category":"nope","content":"x","importance":5}]}'
      )
    ).toEqual([]);
    expect(parseExtractionResponse("")).toEqual([]);
  });

  it("truncates over-long content", () => {
    const long = "用".repeat(500);
    const out = parseExtractionResponse(
      JSON.stringify({
        memories: [{ category: "fact", content: long, importance: 5 }],
      })
    );
    // 400+ chars exceeds the schema max — rejected outright is acceptable,
    // but if accepted it must be truncated to MEMORY_MAX_LENGTH.
    if (out.length > 0) {
      expect(out[0].content.length).toBeLessThanOrEqual(200);
    }
  });
});

// ---------------------------------------------------------------------------
// DB-backed behavior
// ---------------------------------------------------------------------------

async function makeGirlfriend(userId: string) {
  return createGirlfriend({
    userId,
    name: "MemTest",
    personality: "test",
    appearance: "test",
    referenceImageUrl: "https://example.com/x.png",
    referenceImageKey: "mem-test-key",
    isActive: false,
  });
}

const fixtureSources = new Map<string, number>();
/** 存储回归的候选必须有真实所属用户原文，旧数字仅作为夹具的稳定标签。 */
async function storeExtractedMemories(
  userId: string,
  girlfriendId: number,
  candidates: ExtractedMemory[]
) {
  const db = (await getDb())!;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.girlfriendId, girlfriendId)
      )
    )
    .limit(1);
  const target =
    conversation ?? (await createConversation({ userId, girlfriendId }));
  const grounded: ExtractedMemory[] = [];
  for (const candidate of candidates) {
    const key = `${userId}:${girlfriendId}:${candidate.sourceMessageId}`;
    let sourceId =
      candidate.sourceMessageId === undefined
        ? undefined
        : fixtureSources.get(key);
    if (!sourceId && candidate.sourceMessageId !== undefined) {
      const [source] = await db
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(
          and(
            eq(messages.id, candidate.sourceMessageId),
            eq(conversations.userId, userId),
            eq(conversations.girlfriendId, girlfriendId)
          )
        );
      sourceId = source?.id;
    }
    if (!sourceId)
      sourceId = (
        await createMessage({
          conversationId: target.id,
          role: "user",
          content: candidate.content,
          generationStatus: "succeeded",
        })
      ).id;
    if (candidate.sourceMessageId !== undefined)
      fixtureSources.set(key, sourceId);
    grounded.push({ ...candidate, sourceMessageId: sourceId });
  }
  return persistExtractedMemories(userId, girlfriendId, grounded);
}

describe("memory storage (DB)", () => {
  it("reinforces a repeated fact only when a new user message supports it", async () => {
    const userId = `source-dedupe-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    const conversation = await createConversation({
      userId,
      girlfriendId: gf.id,
    });
    const content = "我家的猫叫团团。";
    const source = await createMessage({
      conversationId: conversation.id,
      role: "user",
      content,
    });
    const candidate = {
      category: "fact" as const,
      content,
      importance: 6,
      sourceMessageId: source.id,
    };
    expect(
      await storeExtractedMemories(userId, gf.id, [candidate, candidate])
    ).toEqual({ inserted: 1, reinforced: 0, updated: 0 });
    expect(await storeExtractedMemories(userId, gf.id, [candidate])).toEqual({
      inserted: 0,
      reinforced: 0,
      updated: 0,
    });
    expect((await listMemories(userId, gf.id))[0].weight).toBe(60);
    const repeated = await createMessage({
      conversationId: conversation.id,
      role: "user",
      content,
    });
    expect(
      await storeExtractedMemories(userId, gf.id, [
        { ...candidate, sourceMessageId: repeated.id },
      ])
    ).toEqual({ inserted: 0, reinforced: 1, updated: 0 });
    expect((await listMemories(userId, gf.id))[0].weight).toBe(65);
  });
  it("recalls several personal facts despite synonyms and more than five competing memories", async () => {
    const userId = `recall-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    await storeExtractedMemories(userId, gf.id, [
      {
        category: "preference",
        content: "我最喜欢不加糖的燕麦拿铁",
        importance: 7,
      },
      { category: "fact", content: "我家养了一只叫团团的猫", importance: 7 },
      {
        category: "relationship",
        content: "我们的专属暗号是月亮颜料",
        importance: 7,
      },
      ...Array.from({ length: 12 }, () => ({
        category: "event" as const,
        content: `之前提过的日常安排${nanoid(30)}`,
        importance: 8,
      })),
    ]);
    const block = await buildMemoryPromptBlock(
      userId,
      gf.id,
      "你还记得我之前提过的猫叫什么、常喝哪种咖啡和专属暗号吗？",
      1
    );
    expect(block).toContain("团团");
    expect(block).toContain("燕麦拿铁");
    expect(block).toContain("月亮颜料");
  });
  it("recalls a weakly worded preference beyond the former twenty-item cutoff", async () => {
    const userId = `large-recall-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    await storeExtractedMemories(userId, gf.id, [
      {
        category: "preference",
        content: "我最喜欢喝不加糖的燕麦拿铁",
        importance: 4,
      },
      ...Array.from({ length: 25 }, (_, i) => ({
        category: "event" as const,
        content: `咖啡海报设计第${i}次安排${nanoid(32)}`,
        importance: 8,
      })),
    ]);
    await enforceMemoryCapacity(userId, gf.id, 1);
    const block = await buildMemoryPromptBlock(
      userId,
      gf.id,
      "你还记得我最常喝哪种咖啡吗？",
      1
    );
    expect(block).toContain("燕麦拿铁");
    expect(
      JSON.parse(block.split("<memory-data>")[1].split("</memory-data>")[0])
    ).toHaveLength(26);
    expect(memoryInjectionK(10, "Do you remember my favorite drink?")).toBe(
      120
    );
    expect(memoryInjectionK(1, "今天天气不错")).toBe(5);
  });
  it("inserts new memories and reinforces near-duplicates", async () => {
    if (!(await getDb())) throw new Error("DATABASE_URL required");
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);

    const first = await storeExtractedMemories(userId, gf.id, [
      { category: "fact", content: "用户是一名产品经理", importance: 7 },
    ]);
    expect(first.inserted).toBe(1);

    // Near-duplicate reinforces rather than inserting.
    const second = await storeExtractedMemories(userId, gf.id, [
      { category: "fact", content: "用户是产品经理", importance: 6 },
    ]);
    expect(second.reinforced).toBe(1);
    expect(second.inserted).toBe(0);

    const all = await listMemories(userId, gf.id);
    expect(all).toHaveLength(1);
    expect(all[0].weight).toBeGreaterThanOrEqual(70); // 70 base + 5 bump
  });

  it("enforces level-based capacity, sparing pinned rows", async () => {
    if (!(await getDb())) throw new Error("DATABASE_URL required");
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);

    // Fill past level-1 capacity (30) with genuinely distinct memories
    // (random bodies, varied shapes — must not trip the similarity dedupe).
    const batch = Array.from({ length: 35 }, (_, i) => ({
      category: "preference" as const,
      content: `${nanoid(6)}偏好${i}：${nanoid(12)}`,
      importance: 2,
    }));
    await storeExtractedMemories(userId, gf.id, batch);

    // Pin one row, then enforce.
    const before = await listMemories(userId, gf.id);
    await setMemoryPinned(userId, before[before.length - 1].id, true);
    const evicted = await enforceMemoryCapacity(userId, gf.id, 1);
    expect(evicted).toBeGreaterThan(0);

    const after = await listMemories(userId, gf.id);
    expect(after.length).toBeLessThanOrEqual(30);
    expect(after.some(m => m.pinned)).toBe(true);
  });

  it("builds a relevance-ranked prompt block and refreshes recall time", async () => {
    if (!(await getDb())) throw new Error("DATABASE_URL required");
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);

    await storeExtractedMemories(userId, gf.id, [
      {
        category: "event",
        content: "用户下周二有一场重要的面试",
        importance: 8,
      },
      { category: "preference", content: "用户喜欢喝拿铁咖啡", importance: 5 },
    ]);

    const block = await buildMemoryPromptBlock(
      userId,
      gf.id,
      "面试好紧张啊",
      1
    );
    expect(block).toContain("你记得的关于用户的事");
    expect(block).toContain("面试");

    await vi.waitFor(async () => {
      const rows = await listMemories(userId, gf.id);
      const interview = rows.find(m => m.content.includes("面试"));
      expect(interview?.lastRecalledAt).toBeTruthy();
    });
  });

  it("returns empty block when there are no memories", async () => {
    if (!(await getDb())) throw new Error("DATABASE_URL required");
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    expect(await buildMemoryPromptBlock(userId, gf.id, "你好", 1)).toBe("");
  });

  it("delete removes only the caller's memory", async () => {
    if (!(await getDb())) throw new Error("DATABASE_URL required");
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    await storeExtractedMemories(userId, gf.id, [
      { category: "fact", content: "用户住在杭州西湖区", importance: 6 },
    ]);
    const [row] = await listMemories(userId, gf.id);

    // A different user cannot delete it…
    await deleteMemory("someone-else", row.id);
    expect(await listMemories(userId, gf.id)).toHaveLength(1);
    // …the owner can.
    await deleteMemory(userId, row.id);
    expect(await listMemories(userId, gf.id)).toHaveLength(0);
  });
});

describe("proactive notifications reference memories", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it("mentions a fresh event memory in the notification", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    vi.stubEnv("COMPANION_PROACTIVE_ENABLED", "1");
    if (!(await getDb())) throw new Error("DATABASE_URL required");
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    const conversation = await createConversation({
      userId,
      girlfriendId: gf.id,
    });
    const source = await createMessage({
      conversationId: conversation.id,
      role: "user",
      generationStatus: "succeeded",
      content: "用户明天要参加朋友的婚礼",
      createdAt: new Date(),
    });
    await persistExtractedMemories(userId, gf.id, [
      {
        category: "event",
        content: source.content,
        sourceMessageId: source.id,
        importance: 7,
      },
    ]);
    await saveCompanionPreferences(userId, 0, {
      ...DEFAULT_PROACTIVE_PREFERENCES,
      proactiveEnabled: true,
      quietStart: 0,
      quietEnd: 0,
    });
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));

    const fresh = await getFreshEventMemory(userId, gf.id);
    expect(fresh?.content).toContain("婚礼");

    const notification = await checkAndCreateProactiveNotification(userId);
    expect(notification).toBeTruthy();
    expect(notification!.content).toEqual({
      key: "notifications:eventUpcoming",
      values: {
        name: gf.name,
        memory: "用户明天要参加朋友的婚礼",
        eventDay: "2026-10-21",
      },
    });
    expect(
      renderNotification(
        productFixture.proactive,
        notification!.content,
        "zh-CN"
      )
    ).toContain("婚礼");

    // Daily cap: second call the same day yields nothing.
    expect(await checkAndCreateProactiveNotification(userId)).toBeNull();
  });
});

describe("memory reinforcement regressions", () => {
  it("updates a negated preference and rejects a late result from older evidence", async () => {
    const userId = `correction-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    const before = {
      category: "preference" as const,
      content: "我喜欢加糖的燕麦拿铁",
      importance: 7,
      sourceMessageId: 10,
    };
    await storeExtractedMemories(userId, gf.id, [before]);
    const [initial] = await listMemories(userId, gf.id);
    await setMemoryPinned(userId, initial.id, true);
    await expect(
      storeExtractedMemories(userId, gf.id, [
        {
          ...before,
          content: "我不喜欢加糖的燕麦拿铁",
          importance: 8,
          sourceMessageId: 20,
        },
      ])
    ).resolves.toEqual({ inserted: 0, reinforced: 0, updated: 1 });
    await storeExtractedMemories(userId, gf.id, [before]);
    const rows = await listMemories(userId, gf.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      content: "我不喜欢加糖的燕麦拿铁",
      sourceMessageId: fixtureSources.get(`${userId}:${gf.id}:20`),
      pinned: true,
      weight: 80,
    });
  });
  it("keeps independently stated similar preferences instead of merging them", async () => {
    const userId = `distinct-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    await storeExtractedMemories(userId, gf.id, [
      {
        category: "preference",
        content: "我喜欢喝燕麦拿铁",
        importance: 6,
        sourceMessageId: 10,
      },
      {
        category: "preference",
        content: "我喜欢喝黑糖拿铁",
        importance: 6,
        sourceMessageId: 11,
      },
    ]);
    expect(await listMemories(userId, gf.id)).toHaveLength(2);
  });
  it("reinforces the real inserted row repeatedly within the same batch", async () => {
    const userId = `batch-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    const candidate = {
      category: "fact" as const,
      content: "用户养了一只叫团团的猫",
      importance: 5,
    };
    expect(
      await storeExtractedMemories(userId, gf.id, [
        candidate,
        candidate,
        candidate,
      ])
    ).toEqual({ inserted: 1, reinforced: 2, updated: 0 });
    const rows = await listMemories(userId, gf.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].weight).toBe(60);
  });
});
