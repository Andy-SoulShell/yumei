// @vitest-environment jsdom
/** 持久片段使用稳定 DOM 标识，停止、失败和未知送达均有独立恢复入口。 */
import { act, createRef, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { ChatMessages } from "./ChatMessages";

vi.mock("@/hooks/useChatScrollAnchor", () => ({
  useChatScrollAnchor: vi.fn(),
}));
vi.mock("@/components/PhotoViewer", () => ({ PhotoViewer: () => null }));
let root: Root;
let container: HTMLDivElement;
let props: ComponentProps<typeof ChatMessages>;
const retry = vi.fn();
const retryUnknown = vi.fn();
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  retry.mockReset();
  retryUnknown.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  props = {
    t: i18n.getFixedT("zh-CN") as Translator,
    ttsLabel: "",
    messageListRef: createRef(),
    messagesEndRef: createRef(),
    messagesQuery: { isLoading: false, hasNextPage: false },
    chatMessages: [
      { id: 1, role: "user", content: "你好" },
      {
        id: 2,
        role: "assistant",
        content: "你好呀。今天怎么样？",
        generationStatus: "pending",
        segments: [
          { id: "part-a", sequence: 0, content: "你好呀。" },
          { id: "part-b", sequence: 1, content: "今天怎么样？" },
        ],
      },
    ],
    currentConversationId: 42,
    user: { name: "Test" },
    girlfriend: { name: "小雨", referenceImageUrl: "/reference.png" },
    failedMessages: [],
    isAccepting: false,
    sendMediaMessage: { isPending: false },
    chatStream: { failures: [], pending: null, turns: [] },
    generateSelfie: { isPending: false },
    generateCouple: { isPending: false },
    retryStreamSubmission: retryUnknown,
    retryFailedGeneration: retry,
  } as unknown as ComponentProps<typeof ChatMessages>;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () => root.render(<ChatMessages {...props} />));
}

it("renders separate stable segment bubbles within one canonical assistant message", async () => {
  await render();
  expect(container.querySelectorAll('[data-message-id="2"]')).toHaveLength(1);
  const first = container.querySelector('[data-segment-id="part-a"]');
  expect(first?.textContent).toBe("你好呀。");
  expect(container.querySelectorAll("[data-segment-id]")).toHaveLength(2);
  props.chatMessages[1].segments!.push({
    id: "part-c",
    sequence: 2,
    content: "慢慢说。",
  });
  props.chatMessages[1].content += "慢慢说。";
  await render();
  expect(container.querySelector('[data-segment-id="part-a"]')).toBe(first);
  expect(container.querySelectorAll("[data-segment-id]")).toHaveLength(3);
  props.chatMessages[1].generationStatus = "stopped";
  await render();
  expect(container.textContent).toContain("回复已停止");
  expect(container.querySelectorAll("[data-segment-id]")).toHaveLength(3);
  expect(container.textContent?.match(/你好呀。/g)).toHaveLength(1);
});

it("does not render blank bubbles for provider newline-only segments", async () => {
  props.chatMessages[1].segments!.splice(1, 0, {
    id: "blank-line",
    sequence: 1,
    content: "\n\n",
  });
  await render();
  expect(container.querySelector('[data-segment-id="blank-line"]')).toBeNull();
  expect(container.querySelectorAll("[data-segment-id]")).toHaveLength(2);
  expect(container.textContent).toContain("你好呀。");
  expect(container.textContent).toContain("今天怎么样？");
});

it("retries an accepted failed generation by canonical message id", async () => {
  props.chatMessages[1].generationStatus = "failed";
  await render();
  expect(container.textContent).toContain("回复未能完成");
  const button = Array.from(container.querySelectorAll("button")).find(
    item => item.textContent === "重试"
  )!;
  await act(async () => button.click());
  expect(retry).toHaveBeenCalledWith(2);
});

it("separates unknown delivery recovery from accepted generation retry", async () => {
  const failure = {
    uncertain: true,
    submission: {
      clientRequestId: "retry-1",
      conversationId: 42,
      content: "补充",
    },
  };
  props.chatStream.failures = [failure];
  await render();
  expect(container.textContent).toContain("暂时无法确认是否送达");
  const button = Array.from(container.querySelectorAll("button")).find(
    item => item.textContent === "重试"
  )!;
  await act(async () => button.click());
  expect(retryUnknown).toHaveBeenCalledWith(failure);
  expect(retry).not.toHaveBeenCalled();
});

it("does not duplicate a pending user bubble when its UUID is already accepted", async () => {
  props.chatStream.pending = {
    clientRequestId: "accepted",
    conversationId: 42,
    content: "你好",
  };
  props.chatStream.turns = [{ clientRequestId: "accepted" }] as any;
  await render();
  expect(container.textContent?.match(/你好(?!呀)/g)).toHaveLength(1);
});
