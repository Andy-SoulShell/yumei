/** 用真实事务验证删除记忆与在途提取互斥、旧证据屏蔽和主动重新提起。 */
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import {
  girlfriends,
  memories,
  memoryExtractionJobs,
  users,
} from "../drizzle/schema";
import * as provider from "./_core/chatProvider";
import { getDb } from "./database";
import {
  getChatTurnSnapshot,
  runChatTurns,
  submitChatTurn,
} from "./chatStreaming";
import * as memory from "./memory";
import { runMemoryExtractionJobs } from "./memoryJobs";
import { createConversation } from "./repositories/conversations";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import { createTestGirlfriend } from "./testFixtures";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
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
  const [user] = await (await getDb())!
    .select()
    .from(users)
    .where(eq(users.id, userId));
  vi.spyOn(provider, "resolveChatProvider").mockResolvedValue({
    name: "deepseek",
    baseUrl: "https://example.test",
    model: "test",
    apiKey: "fake-key",
    isByok: false,
  });
  // 自动唤醒由测试接管；真实结算仍创建待提取任务，用显式 worker 验证遗忘互斥。
  vi.spyOn(memory, "maybeExtractMemories").mockImplementation(async () => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "我记住了。" } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        )
    )
  );
  const send = async (content: string) => {
    const accepted = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content,
    });
    await runChatTurns([user.id]);
    const saved = await getChatTurnSnapshot(user.id, accepted.id);
    expect(saved.status).toBe("succeeded");
    return saved;
  };
  const content = "我家的猫叫团团，喜欢晒太阳。";
  const saved = await send(content);
  const candidate = {
    category: "fact" as const,
    content,
    importance: 7,
    sourceMessageId: saved.userMessage.id,
  };
  await memory.storeExtractedMemories(userId, gf.id, [candidate]);
  return { userId, gf, conversation, candidate, send };
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
  const [role] = await db
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, a.gf.id));
  expect(role.memoryEpoch).toBeGreaterThan(0);
  expect(role.memoryForgottenThroughId).toBeGreaterThanOrEqual(
    a.candidate.sourceMessageId
  );
});
it("blocks old evidence but accepts the user explicitly stating the fact again in a new message", async () => {
  const a = await seed();
  const [row] = await memory.listMemories(a.userId, a.gf.id);
  await memory.deleteMemory(a.userId, row.id);
  vi.spyOn(memory, "callExtractionModel").mockResolvedValue([a.candidate]);
  await runMemoryExtractionJobs(a.userId);
  expect(await memory.listMemories(a.userId, a.gf.id)).toEqual([]);
  const saved = await a.send(`请记住，${a.candidate.content}`);
  await memory.storeExtractedMemories(a.userId, a.gf.id, [
    a.candidate,
    { ...a.candidate, sourceMessageId: saved.userMessage.id },
  ]);
  const rows = await memory.listMemories(a.userId, a.gf.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].sourceMessageId).toBe(saved.userMessage.id);
});
it("rejects memories without a real source and removes forgotten metadata with the companion", async () => {
  const a = await seed();
  await memory.storeExtractedMemories(a.userId, a.gf.id, [
    { category: "preference", content: "用户喜欢拿铁", importance: 6 },
  ]);
  expect(
    (await memory.listMemories(a.userId, a.gf.id)).some(
      row => row.sourceMessageId === null
    )
  ).toBe(false);
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
  const db = (await getDb())!;
  expect(
    await db.select().from(memories).where(eq(memories.girlfriendId, a.gf.id))
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(memoryExtractionJobs)
      .where(eq(memoryExtractionJobs.girlfriendId, a.gf.id))
  ).toEqual([]);
});

it("rejects stale correction and deletion versions without erasing the newer memory or resetting context", async () => {
  const a = await seed();
  const db = (await getDb())!;
  const [before] = await memory.listMemories(a.userId, a.gf.id);
  await memory.editMemory(
    a.userId,
    before.id,
    "我家的猫叫豆豆。",
    before.contentVersion
  );
  const [role] = await db
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, a.gf.id));
  await expect(
    memory.editMemory(
      a.userId,
      before.id,
      "旧页面写入另一个名字。",
      before.contentVersion
    )
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    memory.deleteMemory(a.userId, before.id, before.contentVersion)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await memory.listMemories(a.userId, a.gf.id))[0].content).toBe(
    "我家的猫叫豆豆。"
  );
  expect(
    (await db.select().from(girlfriends).where(eq(girlfriends.id, a.gf.id)))[0]
      .memoryEpoch
  ).toBe(role.memoryEpoch);
});
it("treats a repeated successful correction as a no-op after chatting continues", async () => {
  const a = await seed();
  const db = (await getDb())!;
  const [before] = await memory.listMemories(a.userId, a.gf.id);
  await memory.editMemory(
    a.userId,
    before.id,
    "我家的猫叫豆豆。",
    before.contentVersion
  );
  await a.send("接下来聊聊周末的安排。");
  const [role] = await db
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, a.gf.id));
  await memory.editMemory(
    a.userId,
    before.id,
    "我家的猫叫豆豆。",
    before.contentVersion
  );
  const [after] = await db
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, a.gf.id));
  expect(after.memoryEpoch).toBe(role.memoryEpoch);
  expect(after.memoryForgottenThroughId).toBe(role.memoryForgottenThroughId);
});
