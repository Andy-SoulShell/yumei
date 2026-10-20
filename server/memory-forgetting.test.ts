/** 用真实事务验证删除记忆与在途提取互斥、旧证据屏蔽和主动重新提起。 */
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { memorySuppressions } from "../drizzle/schema";
import * as provider from "./_core/chatProvider";
import { getDb } from "./database";
import { completeTextGeneration, reserveGeneration } from "./generations";
import * as memory from "./memory";
import { runMemoryExtractionJobs } from "./memoryJobs";
import { createConversation } from "./repositories/conversations";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import { createTestGirlfriend } from "./testFixtures";

afterEach(() => vi.restoreAllMocks());
async function seed() {
  const userId = `forget-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "Forget test",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const content = "我家的猫叫团团，喜欢晒太阳。";
  const id = await reserveGeneration({
    userId,
    conversationId: conversation.id,
    kind: "chat",
  });
  const saved = await completeTextGeneration(id, userId, content, "我记住了");
  const candidate = {
    category: "fact" as const,
    content,
    importance: 7,
    sourceMessageId: saved.userMessage.id,
  };
  await memory.storeExtractedMemories(userId, gf.id, [candidate]);
  vi.spyOn(provider, "resolveChatProvider").mockResolvedValue({
    name: "deepseek",
    baseUrl: "https://example.test",
    model: "test",
    apiKey: "fake-key",
    isByok: false,
  });
  return { userId, gf, conversation, candidate };
}
it("does not resurrect a deleted memory when an in-flight extraction commits afterward", async () => {
  const a = await seed();
  let release!: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  let started!: () => void;
  const entered = new Promise<void>(resolve => {
    started = resolve;
  });
  vi.spyOn(memory, "callExtractionModel").mockImplementation(async () => {
    started();
    await ready;
    return [a.candidate];
  });
  const worker = runMemoryExtractionJobs(a.userId);
  await entered;
  try {
    const [row] = await memory.listMemories(a.userId, a.gf.id);
    await memory.deleteMemory(a.userId, row.id);
  } finally {
    release();
  }
  await worker;
  expect(await memory.listMemories(a.userId, a.gf.id)).toEqual([]);
  const db = (await getDb())!;
  const [suppression] = await db
    .select()
    .from(memorySuppressions)
    .where(eq(memorySuppressions.girlfriendId, a.gf.id));
  expect(suppression.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(suppression)).not.toContain("团团");
});
it("blocks old evidence but accepts the user explicitly stating the fact again in a new message", async () => {
  const a = await seed();
  const [row] = await memory.listMemories(a.userId, a.gf.id);
  await memory.deleteMemory(a.userId, row.id);
  vi.spyOn(memory, "callExtractionModel").mockResolvedValue([a.candidate]);
  await runMemoryExtractionJobs(a.userId);
  expect(await memory.listMemories(a.userId, a.gf.id)).toEqual([]);
  const id = await reserveGeneration({
    userId: a.userId,
    conversationId: a.conversation.id,
    kind: "chat",
  });
  const saved = await completeTextGeneration(
    id,
    a.userId,
    `请记住，${a.candidate.content}`,
    "好"
  );
  await memory.storeExtractedMemories(a.userId, a.gf.id, [
    a.candidate,
    { ...a.candidate, sourceMessageId: saved.userMessage.id },
  ]);
  const rows = await memory.listMemories(a.userId, a.gf.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].sourceMessageId).toBe(saved.userMessage.id);
});
it("protects legacy memories without a source id and removes suppression records with the companion", async () => {
  const a = await seed();
  await memory.storeExtractedMemories(a.userId, a.gf.id, [
    { category: "preference", content: "用户喜欢拿铁", importance: 6 },
  ]);
  const legacy = (await memory.listMemories(a.userId, a.gf.id)).find(
    row => row.sourceMessageId === null
  )!;
  await memory.deleteMemory(a.userId, legacy.id);
  await memory.storeExtractedMemories(a.userId, a.gf.id, [
    {
      category: "preference",
      content: "我喜欢不加糖的拿铁。",
      importance: 6,
      sourceMessageId: a.candidate.sourceMessageId,
    },
  ]);
  expect(
    (await memory.listMemories(a.userId, a.gf.id)).some(row =>
      row.content.includes("拿铁")
    )
  ).toBe(false);
  await permanentDeleteGirlfriend(a.gf.id, a.userId);
  expect(
    await (await getDb())!
      .select()
      .from(memorySuppressions)
      .where(eq(memorySuppressions.girlfriendId, a.gf.id))
  ).toEqual([]);
});
