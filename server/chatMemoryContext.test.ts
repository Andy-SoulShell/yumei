import { stubProductConfig } from "./testProductConfig";
/** 遗忘必须作用于真实聊天请求的原始历史和异步流写入。 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { users } from "../drizzle/schema";
import * as providers from "./_core/chatProvider";
import { getDb } from "./database";
import {
  getChatTurnSnapshot,
  runChatTurns,
  submitChatTurn,
} from "./chatStreaming";
import * as memory from "./memory";
import {
  createConversation,
  getConversationMessages,
} from "./repositories/conversations";
import { createTestGirlfriend } from "./testFixtures";

function reply(content: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } }
  );
}
beforeEach(() => {
  stubProductConfig("billing.mode", "none");
  vi.stubEnv("MEMORY_EMBEDDING_MODEL", "");
  vi.spyOn(providers, "resolveChatProvider").mockResolvedValue({
    name: "openrouter",
    model: "test",
    baseUrl: "https://example.test",
    apiKey: "fake",
    isByok: true,
  });
  vi.spyOn(memory, "maybeExtractMemories").mockImplementation(async () => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function seed() {
  const userId = `memory-context-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "Test",
    personality: "gentle",
    appearance: "adult",
    referenceImageKey: "memory-context-ref",
    referenceImageUrl: "/files/memory-context-ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const [user] = await (await getDb())!
    .select()
    .from(users)
    .where(eq(users.id, userId));
  const send = async (content: string) => {
    const accepted = await submitChatTurn(user, {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content,
    });
    await runChatTurns([userId]);
    return getChatTurnSnapshot(userId, accepted.id);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply("你说猫叫麻薯，我听到了。"))
  );
  const first = await send("我的猫叫麻薯，请记住。");
  await memory.storeExtractedMemories(userId, gf.id, [
    {
      category: "fact",
      content: "我的猫叫麻薯，请记住。",
      importance: 8,
      sourceMessageId: first.userMessage.id,
    },
  ]);
  const [stored] = await memory.listMemories(userId, gf.id);
  expect(stored).toBeDefined();
  return { userId, user, gf, conversation, stored, send };
}

it.each(["delete", "clear"])(
  "%s prevents the next real provider request from seeing forgotten user facts or assistant repetition",
  async action => {
    const a = await seed();
    if (action === "delete") await memory.deleteMemory(a.userId, a.stored.id);
    else await memory.clearMemories(a.userId, a.gf.id);
    const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) =>
      reply("我目前没有这项记忆。")
    );
    vi.stubGlobal("fetch", fetchMock);
    const next = await a.send("我的猫叫什么？");
    expect(next.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(JSON.stringify(body)).not.toContain("麻薯");
    expect(body.messages.at(-1).content).toBe("我的猫叫什么？");
    expect(
      (await getConversationMessages(a.conversation.id)).some(item =>
        item.content.includes("麻薯")
      )
    ).toBe(true);
  }
);

it("rejects tokens arriving after the user forgot the context during an upstream request", async () => {
  const a = await seed();
  let resolve!: (value: Response) => void;
  const fetchMock = vi.fn(
    async () =>
      new Promise<Response>(done => {
        resolve = done;
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  const accepted = await submitChatTurn(a.user, {
    clientRequestId: crypto.randomUUID(),
    conversationId: a.conversation.id,
    content: "再聊聊我的猫",
  });
  const worker = runChatTurns([a.userId]);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await memory.deleteMemory(a.userId, a.stored.id);
  resolve(reply("麻薯还是那么可爱。"));
  await worker;
  const result = await getChatTurnSnapshot(a.userId, accepted.id);
  expect(result.status).toBe("failed");
  expect(result.assistantMessage.content).toBe("");
});

it("ends a queued turn covered by the new forgetting boundary before any provider request", async () => {
  const a = await seed();
  const accepted = await submitChatTurn(a.user, {
    clientRequestId: crypto.randomUUID(),
    conversationId: a.conversation.id,
    content: "我的猫叫什么？",
  });
  await memory.clearMemories(a.userId, a.gf.id);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await runChatTurns([a.userId]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await getChatTurnSnapshot(a.userId, accepted.id)).status).toBe(
    "failed"
  );
});
