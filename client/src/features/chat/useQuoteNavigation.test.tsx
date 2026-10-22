// @vitest-environment jsdom
/** 验证跨页定位、重复原文、短暂高亮与会话切换时的异步隔离。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { useQuoteNavigation } from "./useQuoteNavigation";

const notice = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: notice }));
let root: Root;
let container: HTMLDivElement;
let viewport: HTMLDivElement;
let navigation: ReturnType<typeof useQuoteNavigation>;
let messages: { id: number; content: string }[];
let scope: number;
let hasNextPage: boolean;
let reduced: boolean;
const fetchNextPage = vi.fn();
const scroll = vi.fn();
const quote = {
  author: "夏末",
  text: "相同原话",
  reply: "回复",
  sourceMessageId: 2,
};
const viewportRef: { current: HTMLDivElement | null } = { current: null };
function Probe() {
  navigation = useQuoteNavigation({
    messages,
    query: { hasNextPage, fetchNextPage },
    viewportRef,
    scope,
    t: i18n.getFixedT("zh-CN") as Translator,
  });
  return null;
}
async function render() {
  await act(async () => root.render(<Probe />));
}
function addTarget(id = 2) {
  const target = document.createElement("div");
  target.dataset.messageId = String(id);
  target.tabIndex = -1;
  viewport.append(target);
  target.getBoundingClientRect = () => ({ top: 150, height: 50 }) as DOMRect;
  return target;
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  scope = 1;
  reduced = false;
  hasNextPage = true;
  messages = [
    { id: 2, content: "相同原话" },
    { id: 20, content: "相同原话" },
  ];
  container = document.createElement("div");
  viewport = document.createElement("div");
  viewportRef.current = viewport;
  viewport.scrollTo = scroll;
  viewport.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  Object.defineProperty(viewport, "clientHeight", { value: 300 });
  document.body.append(container, viewport);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  viewport.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("centers the exact source, moves keyboard focus and removes its highlight after two seconds", async () => {
  const target = addTarget();
  const duplicate = addTarget(20);
  await act(async () => navigation.jumpToQuote(quote, 30));
  expect(fetchNextPage).not.toHaveBeenCalled();
  expect(scroll).toHaveBeenCalledWith({ top: 25, behavior: "smooth" });
  expect(document.activeElement).toBe(target);
  expect(target.dataset.quoteHighlighted).toBe("true");
  expect(duplicate.dataset.quoteHighlighted).toBeUndefined();
  await act(async () => vi.advanceTimersByTime(1999));
  expect(target.dataset.quoteHighlighted).toBe("true");
  await act(async () => vi.advanceTimersByTime(1));
  expect(target.dataset.quoteHighlighted).toBeUndefined();
});

it("respects reduced motion and restarts the highlight on a repeated jump", async () => {
  reduced = true;
  const target = addTarget();
  await act(async () => navigation.jumpToQuote(quote));
  expect(scroll).toHaveBeenLastCalledWith({ top: 25, behavior: "auto" });
  await act(async () => vi.advanceTimersByTime(1000));
  await act(async () => navigation.jumpToQuote(quote));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(target.dataset.quoteHighlighted).toBe("true");
  scope++;
  await render();
  expect(target.dataset.quoteHighlighted).toBeUndefined();
});

it("aligns a message taller than the mobile viewport near its beginning", async () => {
  const target = addTarget();
  target.getBoundingClientRect = () => ({ top: 150, height: 600 }) as DOMRect;
  await act(async () => navigation.jumpToQuote(quote));
  expect(scroll).toHaveBeenLastCalledWith({ top: 138, behavior: "smooth" });
});

it("fetches multiple history pages before locating the original", async () => {
  messages = [{ id: 30, content: "最新" }];
  await render();
  fetchNextPage.mockImplementationOnce(async () => ({
    hasNextPage: true,
    data: { pages: [[{ id: 10, content: "中间" }]] },
  }));
  fetchNextPage.mockImplementationOnce(async () => {
    addTarget();
    return {
      hasNextPage: false,
      data: {
        pages: [
          [{ id: 2, content: quote.text }],
          [{ id: 10, content: "中间" }],
        ],
      },
    };
  });
  await act(async () => navigation.jumpToQuote(quote, 40));
  expect(fetchNextPage).toHaveBeenCalledTimes(2);
  expect(fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  expect(
    viewport
      .querySelector('[data-message-id="2"]')
      ?.getAttribute("data-quote-highlighted")
  ).toBe("true");
  expect(notice.error).not.toHaveBeenCalled();
  expect(navigation.jumpingFromMessageId).toBeNull();
});

it("stops when an exact ID is missing even if another loaded message has identical text", async () => {
  messages = [
    { id: 1, content: "旧消息" },
    { id: 20, content: quote.text },
  ];
  addTarget(20);
  await render();
  await act(async () => navigation.jumpToQuote(quote, 30));
  expect(fetchNextPage).not.toHaveBeenCalled();
  expect(scroll).not.toHaveBeenCalled();
  expect(notice.info).toHaveBeenCalledWith("原消息已不可用");
});

it.each(["empty", "unchanged", "error"])(
  "terminates %s pagination with feedback instead of retrying forever",
  async mode => {
    messages = [{ id: 30, content: "最新" }];
    await render();
    fetchNextPage.mockResolvedValue(
      mode === "error"
        ? { isError: true }
        : {
            hasNextPage: true,
            data: { pages: [mode === "empty" ? [] : messages] },
          }
    );
    await act(async () => navigation.jumpToQuote(quote, 40));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(scroll).not.toHaveBeenCalled();
    expect(mode === "error" ? notice.error : notice.info).toHaveBeenCalled();
    expect(navigation.jumpingFromMessageId).toBeNull();
  }
);

it.each(["scope", "unmount", "new jump"])(
  "ignores a late page after %s",
  async mode => {
    messages = [{ id: 30, content: "最新" }];
    await render();
    let resolve!: (result: any) => void;
    fetchNextPage.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    let pending!: Promise<void>;
    const staleJump = navigation.jumpToQuote;
    await act(async () => {
      pending = staleJump(quote, 40);
    });
    expect(navigation.jumpingFromMessageId).toBe(40);
    if (mode === "scope") {
      scope++;
      await render();
    } else if (mode === "unmount") {
      await act(async () => root.unmount());
      root = createRoot(container);
    } else {
      messages = [...messages, { id: 20, content: "另一条" }];
      addTarget(20);
      await render();
      await act(async () =>
        navigation.jumpToQuote({ ...quote, sourceMessageId: 20 }, 40)
      );
    }
    const target = addTarget();
    await act(async () => {
      resolve({
        data: { pages: [[{ id: 2, content: quote.text }]] },
        hasNextPage: false,
      });
      await pending;
    });
    expect(target.dataset.quoteHighlighted).toBeUndefined();
    expect(scroll).toHaveBeenCalledTimes(mode === "new jump" ? 1 : 0);
    expect(notice.info).not.toHaveBeenCalled();
    expect(notice.error).not.toHaveBeenCalled();
    if (mode === "scope") {
      await act(async () => staleJump(quote, 40));
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    }
  }
);
