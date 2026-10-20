// @vitest-environment jsdom
/** 真实 hook 配合可控传输，验证幂等重试、刷新恢复和网络断开不取消生成。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatTurnSnapshot } from "@shared/chatStreaming";
import {
  chatStreamDraftKey,
  readChatStreamDrafts,
} from "@/lib/chatStreamDrafts";
import {
  ChatStreamRequestError,
  useChatStream,
  type ChatStreamTransport,
} from "./useChatStream";

const complete = vi.fn();
const error = vi.fn();
let root: Root;
let hook: ReturnType<typeof useChatStream>;
let conversationId: number;
let accountId: string | undefined;
let transport: ChatStreamTransport;
let listeners: {
  turnId: string;
  receive: (snapshot: ChatTurnSnapshot) => void;
  disconnect: () => void;
  close: ReturnType<typeof vi.fn>;
}[];

/** 消息 ID 单调增加，模拟服务端持久消息和片段。 */
function snapshot(options: Partial<ChatTurnSnapshot> = {}): ChatTurnSnapshot {
  const message = {
    id: 10,
    conversationId: 42,
    role: "user" as const,
    content: "你好",
    imageUrl: null,
    imageKey: null,
    generationRequestId: "turn-1",
    generationStatus: null,
    segments: null,
    selfieMode: null,
    createdAt: "2026-10-20T08:00:00.000Z",
  };
  return {
    id: "turn-1",
    clientRequestId: "request-1",
    conversationId: 42,
    revision: 1,
    status: "running",
    userMessage: message,
    assistantMessage: {
      ...message,
      id: 11,
      role: "assistant",
      content: "你好呀。",
      generationStatus: "pending",
      segments: [{ id: "segment-1", sequence: 0, content: "你好呀。" }],
    },
    safetyNotice: false,
    ...options,
  };
}

function Probe() {
  hook = useChatStream(conversationId, {
    accountId,
    transport,
    onComplete: complete,
    onError: error,
  });
  return null;
}
async function render() {
  await act(async () => root.render(<Probe />));
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  complete.mockReset();
  error.mockReset();
  conversationId = 42;
  accountId = undefined;
  sessionStorage.clear();
  listeners = [];
  transport = {
    discover: vi.fn().mockResolvedValue(null),
    create: vi
      .fn()
      .mockImplementation(input =>
        Promise.resolve(snapshot({ clientRequestId: input.clientRequestId }))
      ),
    stop: vi
      .fn()
      .mockResolvedValue(snapshot({ revision: 2, status: "stopped" })),
    subscribe: vi.fn((turnId, receive, disconnect) => {
      const close = vi.fn();
      listeners.push({ turnId, receive, disconnect, close });
      return close;
    }),
  };
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("retries an unknown delivery with the same UUID and clears only that failure", async () => {
  vi.mocked(transport.create).mockRejectedValueOnce(new TypeError("offline"));
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  expect(hook.failures).toHaveLength(1);
  expect(hook.failures[0].uncertain).toBe(true);
  const original = vi.mocked(transport.create).mock.calls[0][0];
  await act(async () => {
    await hook.retry(hook.failures[0]);
  });
  expect(transport.create).toHaveBeenLastCalledWith(original);
  expect(hook.failures).toHaveLength(0);
  expect(hook.snapshot?.clientRequestId).toBe(original.clientRequestId);
});

it("creates a fresh UUID after explicit rejection and after an accepted failed turn", async () => {
  vi.mocked(transport.create).mockRejectedValueOnce(
    new ChatStreamRequestError(429)
  );
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  const original = vi.mocked(transport.create).mock.calls[0][0];
  expect(hook.failures[0].uncertain).toBe(false);
  await act(async () => {
    await hook.retry(hook.failures[0]);
  });
  const accepted = vi.mocked(transport.create).mock.calls[1][0];
  expect(accepted.clientRequestId).not.toBe(original.clientRequestId);
  expect(hook.failures).toHaveLength(0);
  const failed = snapshot({
    clientRequestId: accepted.clientRequestId,
    status: "failed",
    revision: 2,
  });
  await act(async () => listeners.at(-1)!.receive(failed));
  await act(async () => {
    await hook.retryTurn(failed);
  });
  expect(vi.mocked(transport.create).mock.calls[2][0].clientRequestId).not.toBe(
    accepted.clientRequestId
  );
});

it("restores a terminal turn without completing or autoplaying it again", async () => {
  vi.mocked(transport.discover).mockResolvedValue(
    snapshot({
      status: "succeeded",
      revision: 5,
      relationship: { leveledUp: true, intimacyLevel: 2 },
    })
  );
  await render();
  expect(hook.snapshot?.status).toBe("succeeded");
  expect(complete).not.toHaveBeenCalled();
  expect(transport.subscribe).not.toHaveBeenCalled();
  expect(transport.create).not.toHaveBeenCalled();
});

it("accepts increasing revisions once and ignores old turn callbacks after a supplement", async () => {
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  const first = hook.snapshot!;
  const oldListener = listeners[0];
  await act(async () =>
    oldListener.receive({
      ...first,
      revision: 2,
      assistantMessage: { ...first.assistantMessage, content: "第二句。" },
    })
  );
  await act(async () => oldListener.receive({ ...first, revision: 1 }));
  expect(hook.snapshot?.assistantMessage.content).toBe("第二句。");
  vi.mocked(transport.create).mockImplementationOnce(async input =>
    snapshot({
      id: "turn-2",
      clientRequestId: input.clientRequestId,
      userMessage: { ...first.userMessage, id: 20 },
      assistantMessage: { ...first.assistantMessage, id: 21 },
    })
  );
  await act(async () => {
    await hook.submit({ content: "补充" });
  });
  expect(oldListener.close).toHaveBeenCalled();
  await act(async () =>
    oldListener.receive({ ...first, revision: 99, status: "succeeded" })
  );
  expect(hook.snapshot?.id).toBe("turn-2");
  expect(complete).not.toHaveBeenCalled();
  const current = hook.snapshot!;
  const done = { ...current, revision: 3, status: "succeeded" as const };
  await act(async () => {
    listeners.at(-1)!.receive(done);
    listeners.at(-1)!.receive(done);
  });
  expect(complete).toHaveBeenCalledTimes(1);
});

it("rediscovers and subscribes after a disconnect without stopping generation", async () => {
  vi.mocked(transport.discover).mockResolvedValue(snapshot());
  await render();
  expect(listeners).toHaveLength(1);
  await act(async () => listeners[0].disconnect());
  expect(hook.connection).toBe("reconnecting");
  expect(transport.stop).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(transport.discover).toHaveBeenCalledTimes(2);
  expect(listeners).toHaveLength(2);
  await act(async () => root.unmount());
  expect(listeners[1].close).toHaveBeenCalled();
  expect(transport.stop).not.toHaveBeenCalled();
  root = createRoot(document.createElement("div"));
});

it("recovers a terminal result after disconnect without reopening or repeating live completion", async () => {
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  const current = hook.snapshot!;
  vi.mocked(transport.discover).mockResolvedValue({
    ...current,
    revision: 3,
    status: "succeeded",
  });
  await act(async () => listeners[0].disconnect());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(hook.snapshot?.status).toBe("succeeded");
  expect(listeners).toHaveLength(1);
  expect(complete).toHaveBeenCalledTimes(1);
});

it("coalesces explicit stop calls, retains partial content and does not report a completion", async () => {
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  let finish!: (value: ChatTurnSnapshot) => void;
  vi.mocked(transport.stop).mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  await act(async () => {
    first = hook.stop();
    second = hook.stop();
  });
  expect(first).toBe(second);
  expect(transport.stop).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(snapshot({ status: "stopped", revision: 2 }));
    await first;
  });
  expect(hook.snapshot?.status).toBe("stopped");
  expect(hook.snapshot?.assistantMessage.content).toBe("你好呀。");
  expect(complete).not.toHaveBeenCalled();
});

it("ignores an in-flight acceptance after switching conversations", async () => {
  let accept!: (value: ChatTurnSnapshot) => void;
  vi.mocked(transport.create).mockReturnValue(
    new Promise(resolve => {
      accept = resolve;
    })
  );
  await render();
  let submission!: Promise<ChatTurnSnapshot | null>;
  await act(async () => {
    submission = hook.submit({ content: "你好" });
  });
  conversationId = 43;
  await render();
  await act(async () => {
    accept(snapshot());
    await submission;
  });
  expect(hook.snapshot).toBeNull();
  expect(hook.turns).toHaveLength(0);
  expect(complete).not.toHaveBeenCalled();
});

it.each(["conversation", "account", "roundtrip"])(
  "rejects saved submit/retry/stop closures invoked after a %s switch",
  async mode => {
    accountId = "account-a";
    await render();
    const oldSubmit = hook.submit,
      oldRetry = hook.retry,
      oldStop = hook.stop;
    if (mode === "account") accountId = "account-b";
    else conversationId = 43;
    await render();
    if (mode === "roundtrip") {
      conversationId = 42;
      await render();
    }
    await act(async () => {
      expect(await oldSubmit({ content: "A 私密语音" })).toBeNull();
      expect(
        await oldRetry({
          uncertain: true,
          submission: {
            clientRequestId: crypto.randomUUID(),
            conversationId: 42,
            content: "A 私密重试",
          },
        })
      ).toBeNull();
      expect(await oldStop()).toBe(false);
    });
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.stop).not.toHaveBeenCalled();
    expect(hook.snapshot).toBeNull();
    expect(hook.failures).toHaveLength(0);
    expect(sessionStorage.length).toBe(0);
    expect(complete).not.toHaveBeenCalled();
  }
);

it("does not let an old stop closure cancel the current conversation's active turn", async () => {
  await render();
  const oldStop = hook.stop;
  conversationId = 43;
  await render();
  vi.mocked(transport.create).mockImplementation(async input =>
    snapshot({
      conversationId: 43,
      clientRequestId: input.clientRequestId,
      userMessage: { ...snapshot().userMessage, id: 20, conversationId: 43 },
      assistantMessage: {
        ...snapshot().assistantMessage,
        id: 21,
        conversationId: 43,
      },
    })
  );
  await act(async () => {
    await hook.submit({ content: "B 问题" });
  });
  await act(async () => {
    expect(await oldStop()).toBe(false);
  });
  expect(transport.stop).not.toHaveBeenCalled();
  expect(hook.snapshot?.conversationId).toBe(43);
  expect(hook.isGenerating).toBe(true);
});

it("ignores an in-flight acceptance after switching accounts on the same route", async () => {
  accountId = "account-a";
  let accept!: (value: ChatTurnSnapshot) => void;
  vi.mocked(transport.create).mockReturnValue(
    new Promise(resolve => {
      accept = resolve;
    })
  );
  await render();
  let request!: Promise<ChatTurnSnapshot | null>;
  await act(async () => {
    request = hook.submit({ content: "A 私密问题" });
  });
  accountId = "account-b";
  await render();
  await act(async () => {
    accept(snapshot({ status: "succeeded" }));
    await request;
  });
  expect(hook.snapshot).toBeNull();
  expect(hook.turns).toHaveLength(0);
  expect(complete).not.toHaveBeenCalled();
});

it("confirms an uncertain stop with discovery before allowing subsequent work", async () => {
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  const current = hook.snapshot!;
  vi.mocked(transport.stop).mockRejectedValue(
    new DOMException("Timed out", "AbortError")
  );
  vi.mocked(transport.discover).mockResolvedValue({
    ...current,
    revision: 3,
    status: "stopped",
  });
  let stopped = false;
  await act(async () => {
    stopped = await hook.stop();
  });
  expect(stopped).toBe(true);
  expect(hook.snapshot?.status).toBe("stopped");
  expect(hook.isStopping).toBe(false);
  expect(error).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

it("does not assume an uncertain stop succeeded while discovery still reports running", async () => {
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  vi.mocked(transport.stop).mockRejectedValue(
    new DOMException("Timed out", "AbortError")
  );
  vi.mocked(transport.discover).mockResolvedValue(hook.snapshot);
  let stopped = true;
  await act(async () => {
    stopped = await hook.stop();
  });
  expect(stopped).toBe(false);
  expect(hook.isGenerating).toBe(true);
  expect(hook.isStopping).toBe(false);
  expect(error).toHaveBeenCalledOnce();
});

it("never rolls a terminal snapshot back even when a delayed running event has a higher revision", async () => {
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  const current = hook.snapshot!;
  const listener = listeners[0];
  await act(async () => {
    listener.receive({ ...current, status: "succeeded", revision: 3 });
    listener.receive({ ...current, status: "running", revision: 4 });
  });
  expect(hook.snapshot?.status).toBe("succeeded");
  expect(hook.snapshot?.revision).toBe(3);
  expect(complete).toHaveBeenCalledOnce();
});

it("restores an unknown submission after remount and retries the persisted UUID", async () => {
  accountId = "account-a";
  vi.mocked(transport.create).mockRejectedValueOnce(new TypeError("offline"));
  await render();
  await act(async () => {
    await hook.submit({ content: "不能丢失的消息" });
  });
  const original = vi.mocked(transport.create).mock.calls[0][0];
  const key = chatStreamDraftKey(accountId, conversationId);
  expect(readChatStreamDrafts(key, 42)).toEqual([original]);
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  expect(hook.failures).toEqual([{ uncertain: true, submission: original }]);
  await act(async () => {
    await hook.retry(hook.failures[0]);
  });
  expect(transport.create).toHaveBeenLastCalledWith(original);
  expect(readChatStreamDrafts(key, 42)).toHaveLength(0);
});

it("clears persisted uncertainty when discovery confirms acceptance without replaying completion", async () => {
  accountId = "account-a";
  vi.mocked(transport.create).mockRejectedValueOnce(new TypeError("offline"));
  await render();
  await act(async () => {
    await hook.submit({ content: "你好" });
  });
  const original = vi.mocked(transport.create).mock.calls[0][0];
  vi.mocked(transport.discover).mockResolvedValue(
    snapshot({ clientRequestId: original.clientRequestId, status: "succeeded" })
  );
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  expect(hook.failures).toHaveLength(0);
  expect(
    readChatStreamDrafts(chatStreamDraftKey(accountId, 42), 42)
  ).toHaveLength(0);
  expect(complete).not.toHaveBeenCalled();
});
