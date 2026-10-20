/** 真 MySQL 与可控上游事件流验证接收、部分结算、取消和崩溃恢复。 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generationRequests,
  girlfriendMoods,
  girlfriends,
  messages,
  rateWindows,
  users,
  voiceTranscriptions,
} from "../drizzle/schema";
import { METERS } from "../shared/quotas";
import * as providers from "./_core/chatProvider";
import { getDailyMeter } from "./_core/quota";
import { getDb } from "./database";
import { expireGenerations, failGeneration } from "./generations";
import * as generations from "./generations";
import {
  getChatTurnSnapshot,
  getLatestChatTurn,
  runChatTurns,
  stopChatTurn,
  submitChatTurn,
} from "./chatStreaming";
import * as memory from "./memory";
import {
  permanentDeleteGirlfriend,
  softDeleteGirlfriend,
} from "./repositories/companions";
import { createConversation } from "./repositories/conversations";
import { createTestGirlfriend } from "./testFixtures";
import { upsertApiConfig } from "./repositories/apiConfig";

const encoder = new TextEncoder();
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const delta = (text: string) =>
  frame({ choices: [{ delta: { content: text } }] });
const finish = frame({ choices: [{ delta: {}, finish_reason: "stop" }] });
const usage = frame({
  choices: [],
  usage: { prompt_tokens: 25, completion_tokens: 8, cost: 0.001 },
});

function response(text: string) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}
function controlled() {
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let signal: AbortSignal;
  return {
    fetch: vi.fn(async (_url: unknown, options: RequestInit) => {
      signal = options.signal!;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            signal.addEventListener("abort", () => {
              try {
                controller.error(new DOMException("Aborted", "AbortError"));
              } catch {
                /* already closed */
              }
            });
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }),
    push(text: string) {
      streamController.enqueue(encoder.encode(text));
    },
    close() {
      streamController.close();
    },
    get aborted() {
      return signal?.aborted;
    },
  };
}
async function eventually(
  test: () => Promise<boolean> | boolean,
  limit = 3_000
) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    if (await test()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Expected durable state was not reached");
}
async function seed() {
  const userId = `stream-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "Yumei",
    personality: "gentle",
    appearance: "natural",
    referenceImageKey: "stream-test-ref",
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
  return {
    user,
    gf,
    conversation,
    input: {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      content: "今天工作有些累，想聊一会儿",
    },
  };
}
beforeEach(() => {
  vi.stubEnv("BILLING_PROVIDER", "free");
  vi.spyOn(providers, "resolveChatProvider").mockResolvedValue({
    name: "deepseek",
    baseUrl: "https://provider.example.test",
    model: "test-stream-model",
    apiKey: "fake-stream-secret",
    isByok: false,
  });
  vi.spyOn(memory, "buildMemoryPromptBlock").mockResolvedValue("");
  vi.spyOn(memory, "maybeExtractMemories").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("durable chat turns", () => {
  it.each([
    [true, "1", "长期记忆由后台异步提取"],
    [false, "1", "长期记忆已关闭或暂停"],
    [true, "0", "长期记忆已关闭或暂停"],
  ])(
    "passes actual role/global memory availability to the model: %s/%s",
    async (enabled, flag, expected) => {
      const { user, gf, input } = await seed();
      vi.stubEnv("COMPANION_MEMORY_ENABLED", flag);
      await (await getDb())!
        .update(girlfriends)
        .set({ memoryEnabled: enabled })
        .where(eq(girlfriends.id, gf.id));
      const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) =>
        response(delta("了解了。") + finish + "data: [DONE]\n\n")
      );
      vi.stubGlobal("fetch", fetchMock);
      await submitChatTurn(user, input);
      await runChatTurns([user.id]);
      expect(
        JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0]
          .content
      ).toContain(expected);
    }
  );
  it("applies a changed DeepSeek language before the current input while preserving old replies and raw user text", async () => {
    const { user, input } = await seed();
    const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) =>
      response(delta("旧的中文回复。") + finish + "data: [DONE]\n\n")
    );
    vi.stubGlobal("fetch", fetchMock);
    await submitChatTurn(user, input);
    await runChatTurns([user.id]);
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]?.body as string).messages.filter(
        (item: { role: string }) => item.role === "system"
      )
    ).toHaveLength(1);
    await upsertApiConfig({ userId: user.id, replyLanguage: "English" });
    const next = {
      ...input,
      clientRequestId: crypto.randomUUID(),
      content: "今天想接着聊，怎么放松？",
    };
    const accepted = await submitChatTurn(user, next);
    await runChatTurns([user.id]);
    const wire = JSON.parse(
      fetchMock.mock.calls[1][1]?.body as string
    ).messages;
    expect(wire.at(-1)).toEqual({ role: "user", content: next.content });
    expect(wire.at(-2)).toMatchObject({
      role: "system",
      content: expect.stringContaining('reply-language setting: "English"'),
    });
    expect(wire.at(-2).content).toContain(
      "platform safety and AI identity rules"
    );
    expect(wire).toContainEqual({
      role: "assistant",
      content: "旧的中文回复。",
    });
    expect(
      (await getChatTurnSnapshot(user.id, accepted.id)).userMessage.content
    ).toBe(next.content);
  });
  it("atomically accepts two canonical messages and deduplicates concurrent retries before rate/quota", async () => {
    const { user, input } = await seed();
    const [first, second] = await Promise.all([
      submitChatTurn(user, input),
      submitChatTurn(user, input),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe("queued");
    expect(first.userMessage.generationStatus).toBe("succeeded");
    expect(first.assistantMessage).toMatchObject({
      content: "",
      generationStatus: "pending",
      segments: [],
    });
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
    const db = (await getDb())!;
    expect(
      await db
        .select()
        .from(messages)
        .where(eq(messages.generationRequestId, first.id))
    ).toHaveLength(2);
    const [window] = await db
      .select()
      .from(rateWindows)
      .where(
        and(eq(rateWindows.userId, user.id), eq(rateWindows.action, "chat"))
      );
    expect(window.requests).toHaveLength(1);
    vi.mocked(providers.resolveChatProvider).mockRejectedValue(
      new Error("Should not resolve on retry")
    );
    expect((await submitChatTurn(user, input)).id).toBe(first.id);
    await expect(
      submitChatTurn(user, { ...input, content: "different" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await stopChatTurn(user.id, first.id);
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(0);
  });
  it("streams sentence/length segments with stable IDs, preserves safety/context, and separates actual use", async () => {
    const { user, input } = await seed();
    input.content = "我好累，想自杀";
    const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) =>
      response(
        delta("我听到了。") +
          delta("愿意和我说说吗？") +
          finish +
          usage +
          "data: [DONE]\n\n"
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const accepted = await submitChatTurn(user, input);
    await runChatTurns([user.id]);
    const snapshot = await getChatTurnSnapshot(user.id, accepted.id);
    expect(snapshot.status).toBe("succeeded");
    expect(snapshot.safetyNotice).toBe(true);
    expect(snapshot.assistantMessage.content).toBe(
      "我听到了。愿意和我说说吗？"
    );
    expect(
      snapshot.assistantMessage.segments?.map(item => item.content)
    ).toEqual(["我听到了。", "愿意和我说说吗？"]);
    expect(
      snapshot.assistantMessage.segments?.map(item => [item.id, item.sequence])
    ).toEqual([
      [`${snapshot.id}:0`, 0],
      [`${snapshot.id}:1`, 1],
    ]);
    expect(
      (await getLatestChatTurn(user.id, input.conversationId))?.assistantMessage
    ).toEqual(snapshot.assistantMessage);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      stream: true,
      model: "test-stream-model",
      stream_options: { include_usage: true },
    });
    expect(body.messages[0].content).toContain("companion/1.4");
    expect(body.messages[0].content).toContain("安全");
    expect(
      body.messages.filter(
        (item: { content: string }) => item.content === input.content
      )
    ).toHaveLength(1);
    const [request] = await (await getDb())!
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, snapshot.id));
    expect(request.telemetry).toMatchObject({
      inputTokens: 25,
      outputTokens: 8,
      costUsd: 0.001,
      outcome: "succeeded",
    });
    expect(JSON.stringify(request.telemetry)).not.toContain(
      "fake-stream-secret"
    );
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
  });
  it("flushes a fragment within 700 ms even when no next token arrives, then stops once and aborts upstream", async () => {
    const { user, input, gf } = await seed();
    const upstream = controlled();
    vi.stubGlobal("fetch", upstream.fetch);
    const accepted = await submitChatTurn(user, input);
    const running = runChatTurns([user.id]);
    await eventually(() => upstream.fetch.mock.calls.length === 1);
    const sentAt = Date.now();
    upstream.push(delta("没有标点的半句话"));
    await eventually(
      async () =>
        !!(await getChatTurnSnapshot(user.id, accepted.id)).assistantMessage
          .content,
      1_000
    );
    expect(Date.now() - sentAt).toBeLessThan(900);
    const stopped = await stopChatTurn(user.id, accepted.id);
    expect(stopped.status).toBe("stopped");
    expect(stopped.assistantMessage.content).toBe("没有标点的半句话");
    expect(stopped.relationship).not.toBeNull();
    const [mood] = await (await getDb())!
      .select()
      .from(girlfriendMoods)
      .where(eq(girlfriendMoods.girlfriendId, gf.id));
    await stopChatTurn(user.id, accepted.id);
    await failGeneration(accepted.id, user.id);
    expect(
      (
        await (await getDb())!
          .select()
          .from(girlfriendMoods)
          .where(eq(girlfriendMoods.girlfriendId, gf.id))
      )[0].totalMessages
    ).toBe(mood.totalMessages);
    await eventually(() => upstream.aborted);
    await running;
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
    expect(
      (await getChatTurnSnapshot(user.id, accepted.id)).assistantMessage
        .segments
    ).toEqual(stopped.assistantMessage.segments);
  });
  it("stops a zero-output request with exactly one refund and keeps the accepted user message", async () => {
    const { user, input } = await seed();
    const upstream = controlled();
    vi.stubGlobal("fetch", upstream.fetch);
    const accepted = await submitChatTurn(user, input);
    const running = runChatTurns([user.id]);
    await eventually(() => upstream.fetch.mock.calls.length === 1);
    await stopChatTurn(user.id, accepted.id);
    await eventually(() => upstream.aborted);
    await running;
    await stopChatTurn(user.id, accepted.id);
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(0);
    expect(
      (await getChatTurnSnapshot(user.id, accepted.id)).userMessage.content
    ).toBe(input.content);
  });
  it("supersedes one shared turn and carries every accepted follow-up into the next prompt", async () => {
    const { user, input } = await seed();
    const upstream = controlled();
    vi.stubGlobal("fetch", upstream.fetch);
    const first = await submitChatTurn(user, input);
    const running = runChatTurns([user.id]);
    await eventually(() => upstream.fetch.mock.calls.length === 1);
    upstream.push(delta("先听你说。"));
    await eventually(
      async () =>
        !!(await getChatTurnSnapshot(user.id, first.id)).assistantMessage
          .content
    );
    const secondInput = {
      ...input,
      clientRequestId: crypto.randomUUID(),
      content: "还有一件事，明天要面试",
    };
    const second = await submitChatTurn(user, secondInput);
    expect((await getChatTurnSnapshot(user.id, first.id)).status).toBe(
      "stopped"
    );
    await eventually(() => upstream.aborted);
    await running;
    const fetchNext = vi.fn(async (_url: unknown, _options: RequestInit) =>
      response(delta("那我们一起准备。") + finish + "data: [DONE]\n\n")
    );
    vi.stubGlobal("fetch", fetchNext);
    await runChatTurns([user.id]);
    const body = JSON.parse(fetchNext.mock.calls[0][1].body as string);
    expect(
      body.messages.slice(1).map((item: { content: string }) => item.content)
    ).toEqual([input.content, "先听你说。", secondInput.content]);
    expect((await getChatTurnSnapshot(user.id, second.id)).status).toBe(
      "succeeded"
    );
    expect(
      (await getChatTurnSnapshot(user.id, first.id)).assistantMessage.content
    ).toBe("先听你说。");
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(2);
  });
  it("preserves partial output on truncated EOF while empty and whitespace responses refund with known usage", async () => {
    const { user, input } = await seed();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(delta("已经写出的部分。")))
      .mockResolvedValueOnce(response(usage + finish + "data: [DONE]\n\n"))
      .mockResolvedValueOnce(
        response(delta("   ") + usage + finish + "data: [DONE]\n\n")
      );
    vi.stubGlobal("fetch", fetchMock);
    const first = await submitChatTurn(user, input);
    await runChatTurns([user.id]);
    expect(await getChatTurnSnapshot(user.id, first.id)).toMatchObject({
      status: "failed",
      assistantMessage: { content: "已经写出的部分。" },
    });
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
    for (let index = 0; index < 2; index++) {
      const next = await submitChatTurn(user, {
        ...input,
        clientRequestId: crypto.randomUUID(),
      });
      await runChatTurns([user.id]);
      expect((await getChatTurnSnapshot(user.id, next.id)).status).toBe(
        "failed"
      );
      const [row] = await (await getDb())!
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.id, next.id));
      expect(row.telemetry).toMatchObject({
        inputTokens: 25,
        outputTokens: 8,
        costUsd: 0.001,
      });
    }
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
  });
  it("consumes transcription atomically and allows only the same idempotent request to reuse it", async () => {
    const { user, input } = await seed();
    const db = (await getDb())!;
    const id = crypto.randomUUID();
    await db.insert(voiceTranscriptions).values({
      id,
      userId: user.id,
      text: input.content,
      durationMs: 31_000,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const withVoice = { ...input, transcriptionId: id };
    const first = await submitChatTurn(user, withVoice);
    expect((await submitChatTurn(user, withVoice)).id).toBe(first.id);
    await expect(
      submitChatTurn(user, {
        ...withVoice,
        clientRequestId: crypto.randomUUID(),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await getChatTurnSnapshot(user.id, first.id)).status).toBe(
      "queued"
    );
    await stopChatTurn(user.id, first.id);
  });
  it("recovers expired running leases without replay and keeps partial quota during generic expiry", async () => {
    const { user, input } = await seed();
    const db = (await getDb())!;
    const first = await submitChatTurn(user, input);
    await db
      .update(messages)
      .set({
        content: "持久片段",
        segments: [{ id: `${first.id}:0`, sequence: 0, content: "持久片段" }],
      })
      .where(eq(messages.id, first.assistantMessage.id));
    await db
      .update(generationRequests)
      .set({
        turnStatus: "running",
        leaseToken: crypto.randomUUID(),
        leaseUntil: new Date(Date.now() - 1_000),
      })
      .where(eq(generationRequests.id, first.id));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await runChatTurns([user.id]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getChatTurnSnapshot(user.id, first.id)).status).toBe(
      "failed"
    );
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
    const second = await submitChatTurn(user, {
      ...input,
      clientRequestId: crypto.randomUUID(),
    });
    await db
      .update(generationRequests)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(generationRequests.id, second.id));
    await expireGenerations(user.id);
    await expireGenerations(user.id);
    expect((await getChatTurnSnapshot(user.id, second.id)).status).toBe(
      "failed"
    );
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
  });
  it("deleting a role during generation aborts without orphan resurrection or partial refund", async () => {
    const { user, input, gf } = await seed();
    const db = (await getDb())!;
    const upstream = controlled();
    vi.stubGlobal("fetch", upstream.fetch);
    const accepted = await submitChatTurn(user, input);
    const running = runChatTurns([user.id]);
    await eventually(() => upstream.fetch.mock.calls.length === 1);
    upstream.push(delta("我在这里。"));
    await eventually(
      async () =>
        !!(await getChatTurnSnapshot(user.id, accepted.id)).assistantMessage
          .content
    );
    await permanentDeleteGirlfriend(gf.id, user.id);
    await eventually(() => upstream.aborted);
    await running;
    expect(
      await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.id, accepted.id))
    ).toHaveLength(0);
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
  });
  it("rejects missing configuration, overlong content, age and foreign resources before writes", async () => {
    const { user, input } = await seed();
    const other = await seed();
    await expect(
      submitChatTurn({ ...user, birthDate: null }, input)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      submitChatTurn(user, { ...input, content: "x".repeat(8001) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(submitChatTurn(other.user, input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    vi.mocked(providers.resolveChatProvider).mockResolvedValue({
      name: "deepseek",
      baseUrl: "https://provider.example.test",
      model: "test",
      apiKey: null,
      isByok: false,
    });
    await expect(submitChatTurn(user, input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(await getLatestChatTurn(user.id, input.conversationId)).toBeNull();
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(0);
  });

  it("retains provider success and actual usage when business settlement fails", async () => {
    const { user, input } = await seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(delta("这是完整回复。") + finish + usage + "data: [DONE]\n\n")
      )
    );
    const settle = vi.spyOn(generations, "settleChatTurnInTransaction");
    settle.mockRejectedValueOnce(new Error("Synthetic settlement failure"));
    const accepted = await submitChatTurn(user, input);
    await runChatTurns([user.id]);
    const snapshot = await getChatTurnSnapshot(user.id, accepted.id);
    expect(snapshot.status).toBe("failed");
    expect(snapshot.assistantMessage.content).toBe("这是完整回复。");
    const [row] = await (await getDb())!
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, accepted.id));
    expect(row.telemetry).toMatchObject({
      outcome: "succeeded",
      inputTokens: 25,
      outputTokens: 8,
    });
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
  });

  it("does not let an old worker with a replaced lease persist late tokens or a terminal status", async () => {
    const { user, input } = await seed();
    const db = (await getDb())!;
    const upstream = controlled();
    vi.stubGlobal("fetch", upstream.fetch);
    const accepted = await submitChatTurn(user, input);
    const running = runChatTurns([user.id]);
    await eventually(() => upstream.fetch.mock.calls.length === 1);
    const [before] = await db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, accepted.id));
    const otherToken = crypto.randomUUID();
    await db
      .update(generationRequests)
      .set({ leaseToken: otherToken, revision: before.revision + 1 })
      .where(eq(generationRequests.id, accepted.id));
    upstream.push(
      delta("这个迟到结果不能出现。") + finish + "data: [DONE]\n\n"
    );
    upstream.close();
    await running;
    const snapshot = await getChatTurnSnapshot(user.id, accepted.id);
    expect(snapshot.status).toBe("running");
    expect(snapshot.assistantMessage.content).toBe("");
    expect(snapshot.revision).toBe(before.revision + 1);
    await stopChatTurn(user.id, accepted.id);
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(0);
  });

  it("bounds output and response time while preserving any earlier visible fragment", async () => {
    const { user, input } = await seed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(delta("已保存。") + delta("x".repeat(16_001))))
    );
    const first = await submitChatTurn(user, input);
    await runChatTurns([user.id]);
    expect(await getChatTurnSnapshot(user.id, first.id)).toMatchObject({
      status: "failed",
      assistantMessage: { content: "已保存。" },
    });
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
    const upstream = controlled();
    vi.stubGlobal("fetch", upstream.fetch);
    const second = await submitChatTurn(user, {
      ...input,
      clientRequestId: crypto.randomUUID(),
    });
    const running = runChatTurns([user.id]);
    await eventually(() => upstream.fetch.mock.calls.length === 1);
    const now = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => now() + 121_000);
    await eventually(() => upstream.aborted);
    await running;
    expect((await getChatTurnSnapshot(user.id, second.id)).status).toBe(
      "failed"
    );
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
  });

  it("keeps all accepted follow-ups beyond the old 30-message window, and rejects overflow before acceptance", async () => {
    const { user, input } = await seed();
    const db = (await getDb())!;
    const acceptedInputs: string[] = [];
    // Separate rate windows model sends over time; admission and actual history remain the real service paths.
    let last;
    for (let index = 0; index < 32; index++) {
      await db.delete(rateWindows).where(eq(rateWindows.userId, user.id));
      const content = `补充第 ${index} 件事情`;
      acceptedInputs.push(content);
      last = await submitChatTurn(user, {
        ...input,
        clientRequestId: crypto.randomUUID(),
        content,
      });
    }
    const before = await getDailyMeter(user.id, METERS.chat);
    await db.delete(rateWindows).where(eq(rateWindows.userId, user.id));
    await expect(
      submitChatTurn(user, {
        ...input,
        clientRequestId: crypto.randomUUID(),
        content: "不能静默丢弃前文",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(before);
    expect((await getChatTurnSnapshot(user.id, last!.id)).status).toBe(
      "queued"
    );
    const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) =>
      response(delta("我都听到了。") + finish + "data: [DONE]\n\n")
    );
    vi.stubGlobal("fetch", fetchMock);
    await runChatTurns([user.id]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(
      body.messages.slice(1).map((item: { content: string }) => item.content)
    ).toEqual(acceptedInputs);
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(1);
  });

  it("exempts BYOK usage while limiting simultaneous conversations transactionally", async () => {
    const { user, input, gf } = await seed();
    vi.mocked(providers.resolveChatProvider).mockResolvedValue({
      name: "openrouter",
      baseUrl: "https://provider.example.test",
      model: "test",
      apiKey: "fake-byok-secret",
      isByok: true,
    });
    const turns = [];
    for (let index = 0; index < 3; index++) {
      const conversation = await createConversation({
        userId: user.id,
        girlfriendId: gf.id,
      });
      turns.push(
        await submitChatTurn(user, {
          ...input,
          conversationId: conversation.id,
          clientRequestId: crypto.randomUUID(),
        })
      );
    }
    await expect(submitChatTurn(user, input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(await getDailyMeter(user.id, METERS.chat)).toBe(0);
    for (const turn of turns) await stopChatTurn(user.id, turn.id);
  });

  it.each([
    { name: "provider", change: { name: "openrouter" as const } },
    { name: "credential source", change: { isByok: true } },
    {
      name: "gateway",
      change: { baseUrl: "https://different-provider.example.test" },
    },
  ])(
    "fails and refunds rather than silently changing accepted $name",
    async ({ change }) => {
      const { user, input } = await seed();
      const accepted = await submitChatTurn(user, input);
      const original = await providers.resolveChatProvider(user.id);
      vi.mocked(providers.resolveChatProvider).mockResolvedValue({
        ...original,
        ...change,
      });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await runChatTurns([user.id]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await getChatTurnSnapshot(user.id, accepted.id)).status).toBe(
        "failed"
      );
      expect(await getDailyMeter(user.id, METERS.chat)).toBe(0);
      const [request] = await (await getDb())!
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.id, accepted.id));
      expect(request.chatRouting).toMatchObject({
        provider: "deepseek",
        model: "test-stream-model",
        isByok: false,
        baseUrl: "https://provider.example.test",
      });
      expect(JSON.stringify(request.chatRouting)).not.toContain(
        "fake-stream-secret"
      );
    }
  );

  it("pins the accepted model and preserves earlier known usage when later events only report cost", async () => {
    const { user, input } = await seed();
    const accepted = await submitChatTurn(user, input);
    const original = await providers.resolveChatProvider(user.id);
    vi.mocked(providers.resolveChatProvider).mockResolvedValue({
      ...original,
      model: "changed-model",
    });
    const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) =>
      response(
        delta("好的。") +
          finish +
          frame({ usage: { prompt_tokens: 20, completion_tokens: 9 } }) +
          frame({ usage: { cost: 0.002 } }) +
          "data: [DONE]\n\n"
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await runChatTurns([user.id]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe(
      "test-stream-model"
    );
    const [request] = await (await getDb())!
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, accepted.id));
    expect(request.telemetry).toMatchObject({
      model: "test-stream-model",
      inputTokens: 20,
      outputTokens: 9,
      costUsd: 0.002,
    });
  });

  it("settles a deleted queued companion and continues the shared queue for another user", async () => {
    const first = await seed();
    const deleted = await submitChatTurn(first.user, first.input);
    await softDeleteGirlfriend(first.gf.id, first.user.id);
    const second = await seed();
    const valid = await submitChatTurn(second.user, second.input);
    const fetchMock = vi.fn(async (_url: unknown, _options: RequestInit) =>
      response(delta("我在听。") + finish + "data: [DONE]\n\n")
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runChatTurns([first.user.id, second.user.id])
    ).resolves.toBeUndefined();
    const db = (await getDb())!;
    const [failed] = await db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, deleted.id));
    expect(failed).toMatchObject({
      status: "failed",
      turnStatus: "failed",
      leaseToken: null,
      leaseUntil: null,
    });
    expect(
      (
        await db
          .select()
          .from(messages)
          .where(eq(messages.id, deleted.assistantMessage.id))
      )[0]
    ).toMatchObject({ generationStatus: "failed", content: "" });
    expect(await getDailyMeter(first.user.id, METERS.chat)).toBe(0);
    expect((await getChatTurnSnapshot(second.user.id, valid.id)).status).toBe(
      "succeeded"
    );
    expect(await getDailyMeter(second.user.id, METERS.chat)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await runChatTurns([first.user.id, second.user.id]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getDailyMeter(first.user.id, METERS.chat)).toBe(0);
  });
});
