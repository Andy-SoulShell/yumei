/** 真 MySQL 验证语义召回、事实来源、完整遗忘和派生任务迟到竞争。 */
import axios from "axios";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiTaskRuns,
  conversationSummaries,
  girlfriends,
  memoryEmbeddings,
  memoryExtractionJobs,
  messages,
  users,
} from "../drizzle/schema";
import * as providers from "./_core/chatProvider";
import { getDb } from "./database";
import * as memory from "./memory";
import * as derived from "./memoryDerived";
import { runMemoryExtractionJobs } from "./memoryJobs";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import { createTestGirlfriend } from "./testFixtures";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as productConfig from "./repositories/productConfig";
let testPolicy: Awaited<
  ReturnType<typeof productConfig.getPublishedProductConfig>
>;

beforeEach(async () => {
  testPolicy = structuredClone(await productConfig.getPublishedProductConfig());
  testPolicy.memory.semantic.model = "test/embedding";
  vi.spyOn(productConfig, "getPublishedProductConfig").mockImplementation(
    async () => testPolicy
  );
  vi.spyOn(providers, "resolveChatProvider").mockResolvedValue({
    name: "openrouter",
    baseUrl: "https://memory.example.test/v1",
    model: "test/chat",
    apiKey: "fake-memory-secret",
    isByok: false,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function fixture() {
  const userId = `derived-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "Test",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "test",
    referenceImageUrl: "https://example.test/ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const db = (await getDb())!;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const add = async (
    content: string,
    category: "fact" | "preference" | "event" = "fact",
    createdAt?: Date,
    importance = 5
  ) => {
    const source = await createMessage({
      conversationId: conversation.id,
      role: "user",
      content,
      generationStatus: "succeeded",
      createdAt,
    });
    await memory.storeExtractedMemories(userId, gf.id, [
      { content, category, importance, sourceMessageId: source.id },
    ]);
    return source;
  };
  const caller = appRouter.createCaller({
    user,
    req: {},
    res: {},
  } as TrpcContext);
  return { userId, user, gf, conversation, db, add, caller };
}
function embedding(vectors: number[][]) {
  return {
    data: {
      data: vectors.map((vector, index) => ({ index, embedding: vector })),
      usage: { prompt_tokens: 12, cost: 0.001 },
    },
  };
}
function pausedResponse() {
  let release!: (value: ReturnType<typeof embedding>) => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const result = new Promise<ReturnType<typeof embedding>>(resolve => {
    release = resolve;
  });
  return {
    started,
    release,
    call: () => {
      entered();
      return result;
    },
  };
}

describe("trusted memory lifecycle", () => {
  it.each([
    ["请记住：我的猫叫团子。你喜欢猫吗？", "我的猫叫团子。", 1],
    ["我的猫叫什么？", "我的猫叫什么", 0],
  ])(
    "applies the same selected-sentence question boundary at transaction commit: %s",
    async (content, quote, count) => {
      const a = await fixture();
      const source = await createMessage({
        conversationId: a.conversation.id,
        role: "user",
        content,
        generationStatus: "succeeded",
      });
      expect(
        await memory.storeExtractedMemories(a.userId, a.gf.id, [
          {
            category: "fact",
            content: String(quote),
            sourceMessageId: source.id,
            importance: 7,
          },
        ])
      ).toEqual({ inserted: count, updated: 0, reinforced: 0 });
      const rows = await memory.listMemories(a.userId, a.gf.id);
      expect(rows).toHaveLength(Number(count));
      if (count) expect(rows[0].content).toBe("请记住：我的猫叫团子。");
    }
  );
  it.each([
    ["我的猫叫麻薯。不要记住这个。", "我的猫叫麻薯。"],
    ["假如我养了猫。我的猫叫麻薯。", "我的猫叫麻薯。"],
    ["我的猫叫麻薯。刚才只是假设。", "我的猫叫麻薯。"],
    ["请更新记忆：我的猫现在叫麻薯。不要记住这个。", "我的猫现在叫麻薯。"],
  ])(
    "rechecks whole-source context in the store transaction instead of trusting an extracted sentence: %s",
    async (content, quote) => {
      const a = await fixture();
      await a.add("我的猫叫团子。");
      const source = await createMessage({
        conversationId: a.conversation.id,
        role: "user",
        content,
        generationStatus: "succeeded",
      });
      expect(
        await memory.storeExtractedMemories(a.userId, a.gf.id, [
          {
            category: "fact",
            content: quote,
            sourceMessageId: source.id,
            importance: 7,
          },
        ])
      ).toEqual({ inserted: 0, updated: 0, reinforced: 0 });
      expect(await memory.listMemories(a.userId, a.gf.id)).toMatchObject([
        { content: "我的猫叫团子。", contentVersion: 1 },
      ]);
    }
  );
  it("applies the observed extractor response through the real leased job without restoring old facts", async () => {
    const a = await fixture();
    const previousSource = await a.add("请记住：我的猫叫团子。");
    const coffeeSource = await a.add("我喝咖啡不加糖。", "preference");
    const [initial] = (await memory.listMemories(a.userId, a.gf.id)).filter(
      row => row.factKey === "pet.cat.name"
    );
    const source = await createMessage({
      conversationId: a.conversation.id,
      role: "user",
      content: "请更新记忆：我的猫现在叫麻薯。以后不要再叫旧名字了。",
      generationStatus: "succeeded",
    });
    await a.db.insert(memoryExtractionJobs).values({
      id: crypto.randomUUID(),
      userId: a.userId,
      girlfriendId: a.gf.id,
      conversationId: a.conversation.id,
      lastMessageId: source.id,
      intimacyLevel: 1,
      memoryEpoch: 0,
    });
    vi.spyOn(derived, "refreshMemoryDerived").mockResolvedValue();
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                memories: [
                  {
                    category: "fact",
                    sourceMessageId: previousSource.id,
                    quote: "我的猫叫团子。",
                    importance: 6,
                  },
                  {
                    category: "preference",
                    sourceMessageId: coffeeSource.id,
                    quote: "我喝咖啡不加糖。",
                    importance: 6,
                  },
                  {
                    category: "fact",
                    sourceMessageId: source.id,
                    quote: "我的猫现在叫麻薯。以后不要再叫旧名字了。",
                    importance: 6,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 90, completion_tokens: 30 },
      },
    });
    await runMemoryExtractionJobs(a.userId);
    expect(await memory.listMemories(a.userId, a.gf.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: initial.id,
          content: "请更新记忆：我的猫现在叫麻薯。",
          contentVersion: 2,
          sourceMessageId: source.id,
        }),
        expect.objectContaining({ content: "我喝咖啡不加糖。" }),
      ])
    );
    const rows = await memory.listMemories(a.userId, a.gf.id);
    expect(rows).toHaveLength(2);
    expect(rows.some(row => /团子|旧名字/.test(row.content))).toBe(false);
    expect(
      await a.db
        .select()
        .from(memoryExtractionJobs)
        .where(eq(memoryExtractionJobs.userId, a.userId))
    ).toEqual([]);
    const [role] = await a.db
      .select()
      .from(girlfriends)
      .where(eq(girlfriends.id, a.gf.id));
    expect(role.memoryEpoch).toBe(1);
    expect(role.memoryForgottenThroughId).toBe(source.id);
  });
  it.each([
    "请更新记忆：我的猫现在叫麻薯。以后不要再叫旧名字了。",
    "请记住，更正：我的猫现在叫麻薯。",
  ])(
    "replaces the same cat's name from an explicit sourced correction: %s",
    async update => {
      const a = await fixture();
      await a.add("请记住：我的猫叫团子。");
      await a.add("我喝咖啡不加糖。", "preference");
      const before = await memory.listMemories(a.userId, a.gf.id);
      const initial = before.find(row => row.content.includes("团子"))!;
      const [role] = await a.db
        .select()
        .from(girlfriends)
        .where(eq(girlfriends.id, a.gf.id));
      await a.db.insert(memoryEmbeddings).values({
        memoryId: initial.id,
        userId: a.userId,
        girlfriendId: a.gf.id,
        memoryEpoch: role.memoryEpoch,
        contentVersion: initial.contentVersion,
        provider: "openrouter",
        baseUrl: "test-hash",
        model: "test/embedding",
        isByok: false,
        dimensions: 2,
        vector: [1, 0],
      });
      await a.db.insert(conversationSummaries).values({
        configurationRevision: testPolicy.revision,
        conversationId: a.conversation.id,
        userId: a.userId,
        girlfriendId: a.gf.id,
        memoryEpoch: role.memoryEpoch,
        throughMessageId: initial.sourceMessageId!,
        content: initial.content,
        sources: [
          {
            memoryId: initial.id,
            contentVersion: initial.contentVersion,
            sourceMessageId: initial.sourceMessageId,
          },
        ],
        topics: [],
      });
      const latest = await createMessage({
        conversationId: a.conversation.id,
        role: "user",
        content: update,
        generationStatus: "succeeded",
      });
      expect(
        await memory.storeExtractedMemories(a.userId, a.gf.id, [
          {
            category: "fact",
            content: "我的猫现在叫麻薯",
            sourceMessageId: latest.id,
            importance: 7,
          },
        ])
      ).toEqual({ inserted: 0, reinforced: 0, updated: 1 });
      const rows = await memory.listMemories(a.userId, a.gf.id);
      expect(rows).toHaveLength(2);
      expect(rows.find(row => row.id === initial.id)).toMatchObject({
        content: update.split("。")[0] + "。",
        factKey: "pet.cat.name",
        sourceMessageId: latest.id,
        contentVersion: initial.contentVersion + 1,
      });
      expect(rows.some(row => row.content.includes("团子"))).toBe(false);
      expect(rows.some(row => row.content === "我喝咖啡不加糖。")).toBe(true);
      expect(
        await a.db
          .select()
          .from(memoryEmbeddings)
          .where(eq(memoryEmbeddings.userId, a.userId))
      ).toEqual([]);
      expect(
        await a.db
          .select()
          .from(conversationSummaries)
          .where(eq(conversationSummaries.userId, a.userId))
      ).toEqual([]);
      const [currentRole] = await a.db
        .select()
        .from(girlfriends)
        .where(eq(girlfriends.id, a.gf.id));
      expect(currentRole.memoryEpoch).toBe(role.memoryEpoch + 1);
      await memory.storeExtractedMemories(a.userId, a.gf.id, [
        {
          category: "fact",
          content: initial.content,
          sourceMessageId: initial.sourceMessageId!,
          importance: 7,
        },
      ]);
      expect(
        (await memory.listMemories(a.userId, a.gf.id)).some(row =>
          row.content.includes("团子")
        )
      ).toBe(false);
    }
  );

  it("keeps a person's name and a dog's name separate from the corrected cat", async () => {
    const a = await fixture();
    await a.add("我叫团子。");
    await a.add("我的狗叫团子。");
    await a.add("我的猫叫团子。");
    await a.add("更正，我的猫现在叫麻薯。");
    const rows = await memory.listMemories(a.userId, a.gf.id);
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.content)).toEqual(
      expect.arrayContaining([
        "我叫团子。",
        "我的狗叫团子。",
        "更正，我的猫现在叫麻薯。",
      ])
    );
  });

  it.each([
    "更正，不是我的猫叫麻薯，是我朋友的猫叫麻薯。",
    "更正，你说我的猫叫麻薯，但那是我朋友的猫。",
    "更正，我朋友说我的猫叫麻薯，但他说错了。",
    "Correction: you said my cat is called Mochi, but it is my friend's cat.",
    "Correction: my friend said my cat is called Mochi, but he was wrong.",
  ])(
    "rejects a negated or reported personal-pet assertion: %s",
    async correction => {
      const a = await fixture();
      await a.add("我的猫叫团子。");
      await a.add(correction);
      expect(await memory.listMemories(a.userId, a.gf.id)).toMatchObject([
        { content: "我的猫叫团子。", contentVersion: 1 },
      ]);
    }
  );

  it("reinforces the same named pet across a request prefix and remains correctable", async () => {
    const a = await fixture();
    await a.add("请记住：我的猫叫团子。");
    const [initial] = await memory.listMemories(a.userId, a.gf.id);
    await a.add("我的猫叫团子。");
    expect(await memory.listMemories(a.userId, a.gf.id)).toMatchObject([
      { id: initial.id, content: "我的猫叫团子。", contentVersion: 2 },
    ]);
    await a.add("请更新记忆：我的猫改名叫麻薯。");
    expect(await memory.listMemories(a.userId, a.gf.id)).toMatchObject([
      {
        id: initial.id,
        content: "请更新记忆：我的猫改名叫麻薯。",
        contentVersion: 3,
      },
    ]);
  });

  it.each([
    ["My cat is called Dumpling.", "Correction: my cat is now called Mochi."],
    ["うちの猫の名前はダンゴです。", "訂正：うちの猫の名前はモチです。"],
    ["내 고양이 이름은 단고야.", "정정: 내 고양이 이름은 모찌야."],
  ])(
    "resolves the same pet slot from a supported language: %s",
    async (before, correction) => {
      const a = await fixture();
      await a.add(before);
      const [initial] = await memory.listMemories(a.userId, a.gf.id);
      const source = await a.add(correction);
      expect(await memory.listMemories(a.userId, a.gf.id)).toMatchObject([
        {
          id: initial.id,
          content: correction,
          factKey: "pet.cat.name",
          contentVersion: 2,
          sourceMessageId: source.id,
        },
      ]);
    }
  );

  it("keeps a statement naming multiple pets outside any single-pet slot", async () => {
    const a = await fixture();
    await a.add("我的猫叫团子，我的另一只猫叫汤圆。");
    await a.add("更正，我的猫现在叫麻薯。");
    const rows = await memory.listMemories(a.userId, a.gf.id);
    expect(rows).toHaveLength(2);
    expect(
      rows.some(
        row =>
          row.content === "我的猫叫团子，我的另一只猫叫汤圆。" &&
          row.factKey === null
      )
    ).toBe(true);
  });

  it("corrects only an explicitly identified cat among multiple pets", async () => {
    const a = await fixture();
    await a.add("我的黑猫叫团子。");
    await a.add("我的白猫叫汤圆。");
    await a.add("更正，我的黑猫现在叫麻薯。");
    const rows = await memory.listMemories(a.userId, a.gf.id);
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.content)).toEqual(
      expect.arrayContaining(["我的白猫叫汤圆。", "更正，我的黑猫现在叫麻薯。"])
    );
  });

  it.each([
    "我也养了另一只猫叫汤圆。",
    "我又养了一只猫，叫汤圆。",
    "我还有一只猫叫汤圆。",
    "我有另一只猫，名字是汤圆。",
    "我还有一只猫。",
    "My other cat is called Tangyuan.",
    "I also have another cat named Tangyuan.",
    "I also have another cat.",
  ])(
    "keeps additional cats and an ambiguous later rename separate: %s",
    async other => {
      const a = await fixture();
      await a.add("我的猫叫团子。");
      await a.add(other);
      await a.add("更正，我的猫现在叫麻薯。");
      const rows = await memory.listMemories(a.userId, a.gf.id);
      expect(rows).toHaveLength(3);
      expect(rows.map(row => row.content)).toEqual(
        expect.arrayContaining(["我的猫叫团子。", other])
      );
    }
  );

  it("does not replace a user's confirmed name with a correction about their cat", async () => {
    const a = await fixture();
    const nameSource = await a.add("我叫张三。");
    await a.add("更正一下，我的猫叫张三。");
    const rows = await memory.listMemories(a.userId, a.gf.id);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.factKey === "profile.name")).toMatchObject({
      content: "我叫张三。",
      sourceMessageId: nameSource.id,
      contentVersion: 1,
    });
  });

  it.each([
    ["今天面试已经结束了。", "completed"],
    ["面试取消了。", "unknown"],
  ])(
    "retires the prior planned event from a later real user statement: %s",
    async (nextContent, priorStatus) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
      const a = await fixture();
      await a.add(
        "明天我要参加面试。",
        "event",
        new Date("2026-10-20T02:00:00Z")
      );
      const [initial] = await memory.listMemories(a.userId, a.gf.id);
      expect((await memory.getFreshEventMemory(a.userId, a.gf.id))?.id).toBe(
        initial.id
      );
      vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
      await a.add(nextContent, "event", new Date("2026-10-21T02:00:00Z"));
      const rows = await memory.listMemories(a.userId, a.gf.id);
      expect(rows.find(row => row.id === initial.id)?.eventStatus).toBe(
        priorStatus
      );
      expect(rows.some(row => row.eventStatus === "planned")).toBe(false);
      expect(await memory.getFreshEventMemory(a.userId, a.gf.id)).toBeNull();
    }
  );

  it("keeps every reinforced statement verbatim traceable to the recorded source", async () => {
    const a = await fixture();
    await a.add("我是一名医生。");
    const latest = await a.add("我是医生。");
    const [fact] = await memory.listMemories(a.userId, a.gf.id);
    const [source] = await a.db
      .select()
      .from(messages)
      .where(eq(messages.id, fact.sourceMessageId!));
    expect(fact).toMatchObject({
      content: "我是医生。",
      sourceMessageId: latest.id,
      contentVersion: 2,
      sourceType: "user_message",
    });
    expect(source.content).toContain(fact.content);
  });

  it.each([
    ["我明天要完成项目", "planned"],
    ["我已经报名了明天的考试", "planned"],
    ["明天我已经约好了面试", "planned"],
    ["明天不打算去面试了", "cancelled"],
  ])(
    "distinguishes future execution from completed preparation: %s",
    (content, status) => {
      expect(
        memory.anchorMemoryEvent(
          content,
          new Date("2026-10-20T02:00:00Z"),
          "Asia/Shanghai"
        )
      ).toMatchObject({ eventDay: "2026-10-21", eventStatus: status });
    }
  );

  it("rejects model-written and foreign-role evidence, while dates use the actual user's IANA source day", async () => {
    const a = await fixture();
    const b = await fixture();
    const foreign = await b.add("我住在上海。");
    const assistant = await createMessage({
      conversationId: a.conversation.id,
      role: "assistant",
      content: "我住在月球。",
      generationStatus: "succeeded",
    });
    expect(
      await memory.storeExtractedMemories(a.userId, a.gf.id, [
        {
          category: "fact",
          content: foreign.content,
          sourceMessageId: foreign.id,
          importance: 5,
        },
        {
          category: "fact",
          content: assistant.content,
          sourceMessageId: assistant.id,
          importance: 5,
        },
        { category: "fact", content: "没有来源的断言", importance: 5 },
      ])
    ).toEqual({ inserted: 0, reinforced: 0, updated: 0 });
    await a.caller.memory.setTimeZone({ timeZone: "Asia/Shanghai" });
    await a.add("我明天要面试。", "event", new Date("2026-10-20T17:00:00Z"));
    const [event] = await memory.listMemories(a.userId, a.gf.id);
    expect(event).toMatchObject({
      eventDay: "2026-10-22",
      eventStatus: "planned",
      sourceTimeZone: "Asia/Shanghai",
      sourceType: "user_message",
    });
    expect(
      memory.anchorMemoryEvent("我过阵子要面试。", null, "UTC")
    ).toMatchObject({ eventDay: null, eventStatus: "unknown" });
    await expect(
      a.caller.memory.setTimeZone({ timeZone: "+08:00" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("corrects a city across unrelated wording and keeps additive professions independent", async () => {
    const a = await fixture();
    await a.add("我住在北京。");
    const [initial] = await memory.listMemories(a.userId, a.gf.id);
    await memory.setMemoryPinned(a.userId, initial.id, true);
    await a.add("我已经搬到厦门了。");
    expect(await memory.listMemories(a.userId, a.gf.id)).toMatchObject([
      {
        id: initial.id,
        content: "我已经搬到厦门了。",
        factKey: "profile.city",
        contentVersion: 2,
        pinned: true,
      },
    ]);
    await a.add("我是程序员。");
    await a.add("我也是摄影师。");
    const rows = await memory.listMemories(a.userId, a.gf.id);
    expect(rows.map(row => row.content)).toEqual(
      expect.arrayContaining(["我是程序员。", "我也是摄影师。"])
    );
    expect(rows).toHaveLength(3);
  });

  it("pauses and resumes a leased extraction without resurrecting any prior messages", async () => {
    const a = await fixture();
    const source = await createMessage({
      conversationId: a.conversation.id,
      role: "user",
      content: "我喜欢绿茶。",
      generationStatus: "succeeded",
    });
    await a.db.insert(memoryExtractionJobs).values({
      id: crypto.randomUUID(),
      userId: a.userId,
      girlfriendId: a.gf.id,
      conversationId: a.conversation.id,
      lastMessageId: source.id,
      intimacyLevel: 1,
      memoryEpoch: 0,
    });
    let release!: () => void, enter!: () => void;
    const started = new Promise<void>(resolve => {
      enter = resolve;
    });
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.spyOn(derived, "refreshMemoryDerived").mockResolvedValue();
    const extract = vi
      .spyOn(memory, "callExtractionModel")
      .mockImplementation(async (_provider, sources) => {
        enter();
        await wait;
        return sources.map(message => ({
          category: "preference",
          content: message.content,
          sourceMessageId: message.id,
          importance: 5,
        }));
      });
    const worker = runMemoryExtractionJobs(a.userId);
    await started;
    await a.caller.memory.setEnabled({ girlfriendId: a.gf.id, enabled: false });
    expect(
      await memory.buildMemoryPromptBlock(a.userId, a.gf.id, "茶", 1)
    ).toBe("");
    await a.caller.memory.setEnabled({ girlfriendId: a.gf.id, enabled: true });
    release();
    await worker;
    expect(await memory.listMemories(a.userId, a.gf.id)).toEqual([]);
    await memory.storeExtractedMemories(a.userId, a.gf.id, [
      {
        category: "preference",
        content: source.content,
        sourceMessageId: source.id,
        importance: 5,
      },
    ]);
    expect(await memory.listMemories(a.userId, a.gf.id)).toEqual([]);
    await a.add("我现在喜欢红茶。", "preference");
    expect((await memory.listMemories(a.userId, a.gf.id))[0].content).toBe(
      "我现在喜欢红茶。"
    );
    expect(extract).toHaveBeenCalledTimes(1);
    await a.caller.memory.clear({ girlfriendId: a.gf.id });
    expect(await memory.listMemories(a.userId, a.gf.id)).toEqual([]);
  });
});

describe("actual semantic memory path", () => {
  it.each(["index", "summary"])(
    "does not dispatch %s after a pause while provider resolution is suspended",
    async kind => {
      const a = await fixture();
      const source = await a.add("我住在上海。");
      const provider = await providers.resolveChatProvider(a.userId);
      let release!: (value: typeof provider) => void, enter!: () => void;
      const started = new Promise<void>(resolve => {
        enter = resolve;
      });
      const resolution = new Promise<typeof provider>(resolve => {
        release = resolve;
      });
      vi.mocked(providers.resolveChatProvider).mockImplementationOnce(
        async () => {
          enter();
          return resolution;
        }
      );
      const post = vi.spyOn(axios, "post");
      const running = (
        kind === "index"
          ? derived.indexMemoryVersions(a.userId, a.gf.id)
          : derived.generateMemorySummary(
              a.userId,
              a.gf.id,
              a.conversation.id,
              source.id
            )
      ).catch(error => error);
      await started;
      await memory.setMemoryEnabled(a.userId, a.gf.id, false);
      release(provider);
      expect(await running).toBeInstanceOf(Error);
      expect(post).not.toHaveBeenCalled();
      expect(
        await a.db
          .select()
          .from(aiTaskRuns)
          .where(eq(aiTaskRuns.userId, a.userId))
      ).toEqual([]);
    }
  );

  it("recalls different wording through indexed cosine similarity and reuses only current role/model versions", async () => {
    const a = await fixture();
    await a.add("下周有重要的答辩让我很紧张。", "event", undefined, 1);
    for (let index = 0; index < 7; index++)
      await a.add(`我喜欢第${index}种甜点。`, "preference", undefined, 9);
    const post = vi
      .spyOn(axios, "post")
      .mockImplementation(async (_url, rawBody) =>
        embedding(
          (rawBody as { input: string[] }).input.map(text =>
            /答辩|睡不着/.test(text) ? [1, 0] : [0, 1]
          )
        )
      );
    await derived.indexMemoryVersions(a.userId, a.gf.id);
    expect(
      await memory.buildMemoryPromptBlock(a.userId, a.gf.id, "最近睡不着", 1)
    ).toContain("答辩");
    expect(post).toHaveBeenCalledTimes(2);
    expect(
      post.mock.calls.every(
        call => call[0] === "https://memory.example.test/v1/embeddings"
      )
    ).toBe(true);
    const indexes = await a.db
      .select()
      .from(memoryEmbeddings)
      .where(eq(memoryEmbeddings.userId, a.userId));
    expect(indexes[0].baseUrl).toMatch(/^[a-f0-9]{64}$/);
    testPolicy.memory.semantic.model = "different/model";
    expect(
      await derived.semanticMemoryScores(a.userId, a.gf.id, "睡不着")
    ).toEqual(new Map());
  });

  it("does not commit an old index after editing and does not return a deleted memory from an in-flight query", async () => {
    const a = await fixture();
    await a.add("我住在上海。");
    const [original] = await memory.listMemories(a.userId, a.gf.id);
    const delayed = pausedResponse();
    const post = vi
      .spyOn(axios, "post")
      .mockImplementationOnce(delayed.call)
      .mockResolvedValue(embedding([[1, 0]]));
    const indexing = derived.indexMemoryVersions(a.userId, a.gf.id);
    await delayed.started;
    await a.caller.memory.edit({ id: original.id, content: "我住在杭州。" });
    delayed.release(embedding([[1, 0]]));
    await indexing;
    expect(
      await a.db
        .select()
        .from(memoryEmbeddings)
        .where(eq(memoryEmbeddings.userId, a.userId))
    ).toEqual([]);
    const [edited] = await memory.listMemories(a.userId, a.gf.id);
    expect(edited).toMatchObject({
      sourceType: "user_edit",
      sourceMessageId: null,
      contentVersion: 2,
      sourceTimeZone: "UTC",
    });
    await derived.indexMemoryVersions(a.userId, a.gf.id);
    const query = pausedResponse();
    post.mockImplementationOnce(query.call);
    const searching = derived.semanticMemoryScores(a.userId, a.gf.id, "住哪儿");
    await query.started;
    await a.caller.memory.delete({ id: edited.id });
    query.release(embedding([[1, 0]]));
    expect(await searching).toEqual(new Map());
    expect(
      await a.db
        .select()
        .from(memoryEmbeddings)
        .where(eq(memoryEmbeddings.userId, a.userId))
    ).toEqual([]);
  });

  it("rejects malformed vectors after recording actual usage and falls back only inside the selected provider", async () => {
    const a = await fixture();
    await a.add("我喜欢绿茶。", "preference");
    const post = vi.spyOn(axios, "post").mockResolvedValue(embedding([[0, 0]]));
    await expect(
      derived.indexMemoryVersions(a.userId, a.gf.id)
    ).rejects.toThrow("Invalid memory embedding vectors");
    expect(
      await a.db
        .select()
        .from(memoryEmbeddings)
        .where(eq(memoryEmbeddings.userId, a.userId))
    ).toEqual([]);
    const [attempt] = await a.db
      .select()
      .from(aiTaskRuns)
      .where(eq(aiTaskRuns.userId, a.userId));
    expect(attempt).toMatchObject({
      outcome: "succeeded",
      usage: { inputTokens: 12, costUsd: 0.001 },
    });
    vi.mocked(providers.resolveChatProvider).mockResolvedValue({
      name: "deepseek",
      baseUrl: "https://deepseek.example.test",
      model: "deepseek-test",
      apiKey: "fake-key",
      isByok: false,
    });
    expect(
      await derived.semanticMemoryScores(a.userId, a.gf.id, "绿茶")
    ).toEqual(new Map());
    expect(
      await memory.buildMemoryPromptBlock(a.userId, a.gf.id, "茶", 1)
    ).toContain("绿茶");
    expect(
      (await a.caller.memory.state({ girlfriendId: a.gf.id })).semantic
    ).toMatchObject({
      supported: false,
      configured: false,
      provider: "deepseek",
    });
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("source-bound conversation summaries", () => {
  it("preserves an English open thread from the second complete sentence", async () => {
    const a = await fixture();
    const source = await createMessage({
      conversationId: a.conversation.id,
      role: "user",
      content:
        "I'm preparing for an interview. I still need help with the introduction.",
      generationStatus: "succeeded",
    });
    const quote = "I still need help with the introduction.";
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                memoryIds: [],
                topics: [
                  {
                    sourceMessageId: source.id,
                    speaker: "user",
                    quote,
                    open: true,
                  },
                ],
              }),
            },
          },
        ],
      },
    });
    await derived.generateMemorySummary(
      a.userId,
      a.gf.id,
      a.conversation.id,
      source.id
    );
    expect(
      (await derived.readMemorySummary(a.userId, a.gf.id, a.conversation.id))
        ?.topics
    ).toEqual([
      { sourceMessageId: source.id, speaker: "user", quote, open: true },
    ]);
    expect(
      (await a.caller.memory.state({ girlfriendId: a.gf.id })).summary?.facts
    ).toEqual([]);
  });

  it("cannot write a summary after the source is cleared while the provider is still responding", async () => {
    const a = await fixture();
    const source = await a.add("我住在上海。");
    const [fact] = await memory.listMemories(a.userId, a.gf.id);
    let release!: (value: { data: unknown }) => void, enter!: () => void;
    const started = new Promise<void>(resolve => {
      enter = resolve;
    });
    const response = new Promise<{ data: unknown }>(resolve => {
      release = resolve;
    });
    vi.spyOn(axios, "post").mockImplementation(async () => {
      enter();
      return response;
    });
    const generating = derived.generateMemorySummary(
      a.userId,
      a.gf.id,
      a.conversation.id,
      source.id
    );
    await started;
    await a.caller.memory.clear({ girlfriendId: a.gf.id });
    release({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                memoryIds: [fact.id],
                topics: [
                  {
                    sourceMessageId: source.id,
                    speaker: "user",
                    quote: source.content,
                    open: true,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 17, completion_tokens: 5 },
      },
    });
    await generating;
    expect(
      await derived.readMemorySummary(a.userId, a.gf.id, a.conversation.id)
    ).toBeNull();
    expect(
      await a.db
        .select()
        .from(conversationSummaries)
        .where(eq(conversationSummaries.userId, a.userId))
    ).toEqual([]);
    const [attempt] = await a.db
      .select()
      .from(aiTaskRuns)
      .where(eq(aiTaskRuns.userId, a.userId));
    expect(attempt.usage).toMatchObject({ inputTokens: 17, outputTokens: 5 });
  });

  it("keeps open user topics and completed companion advice separate and invalidates both on edit", async () => {
    const a = await fixture();
    await a.add("我住在上海。");
    const [fact] = await memory.listMemories(a.userId, a.gf.id);
    const topic = await createMessage({
      conversationId: a.conversation.id,
      role: "user",
      content: "明天面试，还没准备好。",
      generationStatus: "succeeded",
    });
    const advice = await createMessage({
      conversationId: a.conversation.id,
      role: "assistant",
      content: "可以先把简历整理好。",
      generationStatus: "succeeded",
    });
    const partial = await createMessage({
      conversationId: a.conversation.id,
      role: "assistant",
      content: "我住在月球。",
      generationStatus: "stopped",
    });
    const content = JSON.stringify({
      memoryIds: [fact.id],
      topics: [
        {
          sourceMessageId: topic.id,
          speaker: "user",
          quote: topic.content,
          open: true,
        },
        {
          sourceMessageId: advice.id,
          speaker: "assistant",
          quote: advice.content,
          open: true,
        },
        {
          sourceMessageId: partial.id,
          speaker: "assistant",
          quote: partial.content,
          open: true,
        },
      ],
    });
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 20, completion_tokens: 9 },
      },
    });
    await derived.generateMemorySummary(
      a.userId,
      a.gf.id,
      a.conversation.id,
      partial.id
    );
    const summary = await derived.readMemorySummary(
      a.userId,
      a.gf.id,
      a.conversation.id
    );
    expect(summary?.topics).toHaveLength(2);
    expect(summary?.content).toContain("角色曾建议");
    expect(summary?.content).not.toContain("月球");
    expect(summary?.sources).toEqual([
      {
        memoryId: fact.id,
        contentVersion: 1,
        sourceMessageId: fact.sourceMessageId,
      },
    ]);
    const block = await memory.buildMemoryPromptBlock(
      a.userId,
      a.gf.id,
      "继续面试准备",
      1,
      { conversationId: a.conversation.id, maxChars: 700 }
    );
    expect(block.length).toBeLessThanOrEqual(700);
    expect(() =>
      JSON.parse(block.split("<memory-data>")[1].split("</memory-data>")[0])
    ).not.toThrow();
    expect(block).toContain("summaryTopic");
    await a.caller.memory.edit({ id: fact.id, content: "我住在成都。" });
    expect(
      await derived.readMemorySummary(a.userId, a.gf.id, a.conversation.id)
    ).toBeNull();
    expect(
      await a.db
        .select()
        .from(conversationSummaries)
        .where(eq(conversationSummaries.userId, a.userId))
    ).toEqual([]);
  });
});
