/** 验证任务随消息提交、独立执行者互斥、失败重试以及过期租约恢复。 */
import { eq } from "drizzle-orm";
import axios from "axios";
import { afterEach, expect, it, vi } from "vitest";
import { girlfriends, memories, memoryExtractionJobs } from "../drizzle/schema";
import * as provider from "./_core/chatProvider";
import type { TrpcContext } from "./_core/context";
import { getDb, withUserTransaction } from "./database";
import { completeTextGeneration, reserveGeneration } from "./generations";
import * as memory from "./memory";
import { runMemoryExtractionJobs } from "./memoryJobs";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import { createTestGirlfriend } from "./testFixtures";
import { appRouter } from "./routers";

afterEach(() => vi.restoreAllMocks());
async function seed(rounds = 1) {
  const userId = `memory-job-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "Test",
    personality: "Test",
    appearance: "Test",
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  for (let index = 0; index < rounds; index++) {
    const id = await reserveGeneration({
      userId,
      conversationId: conversation.id,
      kind: "chat",
    });
    await completeTextGeneration(
      id,
      userId,
      "用户喜欢猫和安静的咖啡馆",
      "记住了"
    );
  }
  vi.spyOn(provider, "resolveChatProvider").mockResolvedValue({
    name: "openrouter",
    baseUrl: "https://example.test",
    apiKey: "fake-test-key",
    isByok: false,
    model: "test",
  });
  return { userId, gf, conversation, db: (await getDb())! };
}
it("persists a job after the first round and applies its result once across competing workers", async () => {
  const a = await seed();
  expect(
    await a.db
      .select()
      .from(memoryExtractionJobs)
      .where(eq(memoryExtractionJobs.userId, a.userId))
  ).toHaveLength(1);
  const extract = vi
    .spyOn(memory, "callExtractionModel")
    .mockResolvedValue([
      { category: "preference", content: "用户喜欢猫", importance: 5 },
    ]);
  await Promise.all([
    runMemoryExtractionJobs(a.userId),
    runMemoryExtractionJobs(a.userId),
  ]);
  expect(extract).toHaveBeenCalledTimes(1);
  expect((await memory.listMemories(a.userId, a.gf.id))[0].weight).toBe(50);
  expect(
    await a.db
      .select()
      .from(memoryExtractionJobs)
      .where(eq(memoryExtractionJobs.userId, a.userId))
  ).toEqual([]);
});
it("keeps the five-round interval when a standalone image makes the message count odd", async () => {
  const a = await seed(4);
  const jobs = () =>
    a.db
      .select()
      .from(memoryExtractionJobs)
      .where(eq(memoryExtractionJobs.userId, a.userId));
  expect(await jobs()).toHaveLength(1);
  await createMessage({
    conversationId: a.conversation.id,
    role: "assistant",
    content: "照片",
    imageUrl: "https://example.test/photo",
    generationStatus: "succeeded",
  });
  const id = await reserveGeneration({
    userId: a.userId,
    conversationId: a.conversation.id,
    kind: "chat",
  });
  await completeTextGeneration(id, a.userId, "今天也很开心", "我也是");
  expect(await jobs()).toHaveLength(2);
});
it("queues an explicit memory request before the normal interval", async () => {
  const a = await seed();
  const id = await reserveGeneration({
    userId: a.userId,
    conversationId: a.conversation.id,
    kind: "chat",
  });
  await completeTextGeneration(id, a.userId, "请记住，我的猫叫团团", "好的");
  expect(
    await a.db
      .select()
      .from(memoryExtractionJobs)
      .where(eq(memoryExtractionJobs.userId, a.userId))
  ).toHaveLength(2);
});
it("extracts legacy text while excluding images and failed messages, then recalls it in another conversation", async () => {
  const a = await seed(0);
  await createMessage({
    conversationId: a.conversation.id,
    role: "user",
    content: "用户喜欢猫和安静的咖啡馆",
  });
  await createMessage({
    conversationId: a.conversation.id,
    role: "assistant",
    content: "图片不应进入提取",
    imageUrl: "https://example.test/photo",
    generationStatus: "succeeded",
  });
  await createMessage({
    conversationId: a.conversation.id,
    role: "assistant",
    content: "失败不应进入提取",
    generationStatus: "failed",
  });
  await createMessage({
    conversationId: a.conversation.id,
    role: "assistant",
    content: "我最常喝手冲咖啡，别把我的偏好当成用户的",
    generationStatus: "succeeded",
  });
  const id = await reserveGeneration({
    userId: a.userId,
    conversationId: a.conversation.id,
    kind: "chat",
  });
  await completeTextGeneration(id, a.userId, "今天很开心", "我也是");
  // The job's upper boundary must still exclude messages that arrived later.
  await createMessage({
    conversationId: a.conversation.id,
    role: "user",
    content: "后续消息",
  });
  const extract = vi
    .spyOn(memory, "callExtractionModel")
    .mockResolvedValue([
      { category: "preference", content: "用户喜欢猫", importance: 5 },
    ]);
  await runMemoryExtractionJobs(a.userId);
  const extractionInput = extract.mock.calls[0][1];
  expect(extractionInput.every(message => message.role === "user")).toBe(true);
  expect(extractionInput.map(message => message.content)).toContain(
    "用户喜欢猫和安静的咖啡馆"
  );
  expect(JSON.stringify(extractionInput)).not.toMatch(
    /后续消息|图片不应进入提取|失败不应进入提取|手冲咖啡|我也是/
  );
  const nextConversation = await createConversation({
    userId: a.userId,
    girlfriendId: a.gf.id,
  });
  expect(
    await memory.buildMemoryPromptBlock(a.userId, a.gf.id, "我喜欢什么", 1)
  ).toContain("用户喜欢猫");
  vi.spyOn(memory, "maybeExtractMemories").mockImplementation(() => {});
  const post = vi.spyOn(axios, "post").mockResolvedValue({
    data: { choices: [{ message: { content: "你喜欢猫呀" } }] },
  });
  const caller = appRouter.createCaller({
    user: { id: a.userId, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as TrpcContext);
  await caller.chat.sendMessage({
    conversationId: nextConversation.id,
    content: "我喜欢什么",
  });
  expect(post).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("用户喜欢猫"),
        }),
      ]),
    }),
    expect.any(Object)
  );
});
it("retains failed work and recovers an expired worker lease without losing the extraction", async () => {
  const a = await seed();
  const extract = vi
    .spyOn(memory, "callExtractionModel")
    .mockRejectedValueOnce(new Error("upstream unavailable"))
    .mockResolvedValue([
      { category: "fact", content: "用户喜欢咖啡", importance: 6 },
    ]);
  await runMemoryExtractionJobs(a.userId);
  const [job] = await a.db
    .select()
    .from(memoryExtractionJobs)
    .where(eq(memoryExtractionJobs.userId, a.userId));
  expect(job.attempts).toBe(1);
  expect(await memory.listMemories(a.userId, a.gf.id)).toEqual([]);
  await a.db
    .update(memoryExtractionJobs)
    .set({
      nextRunAt: new Date("2020-01-01"),
      leaseUntil: new Date("2020-01-01"),
      leaseToken: crypto.randomUUID(),
    })
    .where(eq(memoryExtractionJobs.id, job.id));
  await runMemoryExtractionJobs(a.userId);
  expect(extract).toHaveBeenCalledTimes(2);
  expect(await memory.listMemories(a.userId, a.gf.id)).toHaveLength(1);
});
it("removes pending jobs when the companion is permanently deleted", async () => {
  const a = await seed();
  await permanentDeleteGirlfriend(a.gf.id, a.userId);
  expect(
    await a.db
      .select()
      .from(memoryExtractionJobs)
      .where(eq(memoryExtractionJobs.userId, a.userId))
  ).toEqual([]);
});

it("uses the companion's current capacity when a delayed extraction finishes after a level-up", async () => {
  const a = await seed();
  await a.db.insert(memories).values(
    Array.from({ length: 35 }, (_, index) => ({
      userId: a.userId,
      girlfriendId: a.gf.id,
      category: "event" as const,
      content: `不同日期的第 ${index + 1} 次旅行。`,
      weight: 50,
    }))
  );
  let release!: () => void;
  const paused = new Promise<void>(resolve => {
    release = resolve;
  });
  let started!: () => void;
  const entered = new Promise<void>(resolve => {
    started = resolve;
  });
  vi.spyOn(memory, "callExtractionModel").mockImplementation(async () => {
    started();
    await paused;
    return [];
  });
  const worker = runMemoryExtractionJobs(a.userId);
  await entered;
  try {
    await withUserTransaction(a.userId, tx =>
      tx
        .update(girlfriends)
        .set({ intimacyLevel: 2, intimacyPoints: 50 })
        .where(eq(girlfriends.id, a.gf.id))
    );
  } finally {
    release();
    await worker;
  }
  expect(await memory.listMemories(a.userId, a.gf.id)).toHaveLength(35);
});
