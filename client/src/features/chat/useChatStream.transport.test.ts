import { productFixture } from "../../../../server/testProductConfig";
// @vitest-environment jsdom
/** 浏览器传输必须带会话和 CSRF；关闭 SSE 订阅不发送停止请求。 */
import { afterEach, expect, it, vi } from "vitest";
import {
  createBrowserChatStreamTransport,
  ChatStreamRequestError,
} from "./useChatStream";

afterEach(() => {
  document.cookie = "csrf_token=; max-age=0; path=/";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("posts UUID and transcription with same-origin credentials and decoded CSRF", async () => {
  document.cookie = "csrf_token=token%20value; path=/";
  const result = { id: "turn" };
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => result });
  vi.stubGlobal("fetch", fetcher);
  const submission = {
    clientRequestId: "request",
    conversationId: 42,
    content: "你好",
    transcriptionId: "voice",
  };
  expect(await browserChatStreamTransport.create(submission)).toBe(result);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("/api/chat/turns");
  expect(init.credentials).toBe("include");
  expect(init.headers.get("x-csrf-token")).toBe("token value");
  expect(JSON.parse(init.body)).toEqual(submission);
});

it("keeps discovery read-only and preserves finite structured rejection details", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => null })
    .mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: "FORBIDDEN",
          message: "Access denied",
          business: { reason: "UPGRADE_REQUIRED" },
        },
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  expect(await browserChatStreamTransport.discover(42)).toBeNull();
  expect(fetcher.mock.calls[0][1].method).toBe("GET");
  expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  await expect(browserChatStreamTransport.stop("turn")).rejects.toBeInstanceOf(
    ChatStreamRequestError
  );
});

it("bounds an unanswered acceptance request without sending a cancellation", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      })
  );
  vi.stubGlobal("fetch", fetcher);
  const pending = browserChatStreamTransport.create({
    clientRequestId: "request",
    conversationId: 42,
    content: "你好",
  });
  const rejection = expect(pending).rejects.toThrow("Aborted");
  await vi.advanceTimersByTimeAsync(15000);
  await rejection;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/chat/turns");
  expect(vi.getTimerCount()).toBe(0);
});

it("receives snapshot events and disconnects without invoking the stop endpoint", () => {
  const fetcher = vi.fn();
  const receive = vi.fn();
  const disconnect = vi.fn();
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    listener!: (event: { data: string }) => void;
    onerror!: () => void;
    close = vi.fn();
    constructor(
      readonly url: string,
      readonly options: object
    ) {
      FakeEventSource.instances.push(this);
    }
    addEventListener(
      name: string,
      listener: (event: { data: string }) => void
    ) {
      expect(name).toBe("snapshot");
      this.listener = listener;
    }
  }
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("EventSource", FakeEventSource);
  const close = browserChatStreamTransport.subscribe(
    "turn",
    receive,
    disconnect
  );
  const source = FakeEventSource.instances[0];
  expect(source.url).toBe("/api/chat/turns/turn/events");
  expect(source.options).toEqual({ withCredentials: true });
  source.listener({ data: JSON.stringify({ id: "turn", revision: 2 }) });
  expect(receive).toHaveBeenCalledWith({ id: "turn", revision: 2 });
  source.onerror();
  expect(disconnect).toHaveBeenCalledOnce();
  close();
  expect(source.close).toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

const browserChatStreamTransport = createBrowserChatStreamTransport(
  productFixture.experience.transport
);

it("keeps the voice reply preference local without sending a credential for edited text", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ id: "turn" }) });
  vi.stubGlobal("fetch", fetcher);
  await browserChatStreamTransport.create({
    clientRequestId: "request",
    conversationId: 42,
    content: "修改的转写",
    replyWithVoice: true,
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    clientRequestId: "request",
    conversationId: 42,
    content: "修改的转写",
  });
});
