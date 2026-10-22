// @vitest-environment jsdom
/** 持久片段使用稳定 DOM 标识，停止、失败和未知送达均有独立恢复入口。 */
import { act, createRef, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { ChatMessages } from "./ChatMessages";
import type { PhotoViewer } from "@/components/PhotoViewer";

vi.mock("@/hooks/useChatScrollAnchor", () => ({
  useChatScrollAnchor: vi.fn(),
}));
const viewer = vi.hoisted(() => ({
  props: null as ComponentProps<typeof PhotoViewer> | null,
}));
vi.mock("@/components/PhotoViewer", () => ({
  PhotoViewer: (props: ComponentProps<typeof PhotoViewer>) => {
    viewer.props = props;
    return null;
  },
}));
const renderStats = vi.hoisted(() => ({ avatars: 0 }));
vi.mock("@/components/ui/avatar", async importOriginal => {
  const original =
    await importOriginal<typeof import("@/components/ui/avatar")>();
  return {
    ...original,
    Avatar: (props: ComponentProps<typeof original.Avatar>) => {
      renderStats.avatars++;
      return <original.Avatar {...props} />;
    },
  };
});
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
  props.chatMessages = props.chatMessages.map(msg =>
    msg.id === 2
      ? {
          ...msg,
          content: msg.content + "慢慢说。",
          segments: [
            ...msg.segments!,
            { id: "part-c", sequence: 2, content: "慢慢说。" },
          ],
        }
      : msg
  );
  await render();
  expect(container.querySelector('[data-segment-id="part-a"]')).toBe(first);
  expect(container.querySelectorAll("[data-segment-id]")).toHaveLength(3);
  props.chatMessages = props.chatMessages.map(msg =>
    msg.id === 2 ? { ...msg, generationStatus: "stopped" } : msg
  );
  await render();
  expect(container.textContent).toContain("回复已停止");
  expect(container.querySelectorAll("[data-segment-id]")).toHaveLength(3);
  expect(container.textContent?.match(/你好呀。/g)).toHaveLength(1);
});

it("输入区或查询状态更新时复用历史行，收到新片段只更新对应消息", async () => {
  await render();
  renderStats.avatars = 0;
  props.messagesQuery = { ...props.messagesQuery };
  props.chatStream = { ...props.chatStream };
  props.chatMessages = [...props.chatMessages];
  await render();
  expect(renderStats.avatars).toBe(0);
  props.chatMessages = props.chatMessages.map(msg =>
    msg.id === 2
      ? {
          ...msg,
          content: msg.content + "新片段",
          segments: [
            ...msg.segments!,
            { id: "part-new", sequence: 2, content: "新片段" },
          ],
        }
      : msg
  );
  await render();
  expect(renderStats.avatars).toBe(1);
  expect(
    container.querySelector('[data-segment-id="part-new"]')?.textContent
  ).toBe("新片段");
});

it("加载更早照片时保留当前原图，并复用已有图片消息行", async () => {
  props.chatMessages = [
    { ...props.chatMessages[1], imageUrl: "/photo-2.jpg", segments: [] },
  ];
  await render();
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>("[data-message-id] button")!
      .click();
  });
  expect(viewer.props?.index).toBe(0);
  renderStats.avatars = 0;
  props.chatMessages = [
    { ...props.chatMessages[0], id: 1, imageUrl: "/photo-1.jpg" },
    ...props.chatMessages,
  ];
  await render();
  expect(viewer.props?.index).toBe(1);
  expect(renderStats.avatars).toBe(1);
  await act(async () => viewer.props?.onIndexChange(0));
  expect(viewer.props?.index).toBe(0);
});

it("播放状态与操作回调变化时不会使用复用消息中的旧状态", async () => {
  props.handleSpeakMessage = vi.fn();
  await render();
  const speak = vi.fn();
  props.handleSpeakMessage = speak;
  props.isSpeaking = true;
  props.activeMessageId = 2;
  await render();
  const button = container.querySelector<HTMLButtonElement>(
    '[data-message-id="2"] [aria-pressed="true"]'
  )!;
  await act(async () => button.click());
  expect(speak).toHaveBeenCalledWith(props.chatMessages[1].content, 2);
});

it("刷新记录只重建时间和片段对象时仍复用相同内容", async () => {
  await render();
  renderStats.avatars = 0;
  props.chatMessages = props.chatMessages.map(msg => ({
    ...msg,
    createdAt: new Date(),
    segments: msg.segments?.map(segment => ({ ...segment })) ?? null,
  }));
  await render();
  expect(renderStats.avatars).toBe(0);
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

it("offers three named starters only for an empty conversation and fills a draft on selection", async () => {
  props.chatMessages = [];
  props.insertChatDraft = vi.fn();
  await render();
  const topics = container.querySelector('[aria-label="开场话题"]')!;
  expect(topics.querySelectorAll("button")).toHaveLength(3);
  await act(async () => topics.querySelector("button")!.click());
  expect(props.insertChatDraft).toHaveBeenCalledWith(
    "小雨，今天过得怎么样？想听你说说。"
  );
  props.chatMessages = [{ id: 1, role: "user", content: "你好" }] as any;
  await render();
  expect(container.querySelector('[aria-label="开场话题"]')).toBeNull();
});

it("renders existing quoted user messages as a card and a separate reply without raw markers", async () => {
  props.chatMessages = [
    { id: 1, role: "user", content: "> 夏末\n> 好，我在这儿，慢慢说。\nnihao" },
  ] as any;
  await render();
  const bubble = container.querySelector(".chat-bubble-user")!;
  expect(bubble.querySelector("blockquote cite")?.textContent).toBe("夏末");
  expect(bubble.querySelector(".chat-quote-text")?.textContent).toBe(
    "好，我在这儿，慢慢说。"
  );
  expect(bubble.querySelector(":scope > p")?.textContent).toBe("nihao");
  expect(bubble.textContent).not.toContain("> ");
});

it("navigates a sent quote and only updates its row while history is loading", async () => {
  props.jumpToQuote = vi.fn();
  props.chatMessages = [
    ...props.chatMessages,
    {
      id: 3,
      role: "user",
      content: "> [小雨](#message-2)\n> 你好呀。今天怎么样？\n\n回复",
    },
  ] as any;
  await render();
  const button = container.querySelector<HTMLButtonElement>(
    '[aria-label="查看原消息"]'
  )!;
  await act(async () => button.click());
  expect(props.jumpToQuote).toHaveBeenCalledWith(
    {
      author: "小雨",
      text: "你好呀。今天怎么样？",
      reply: "回复",
      sourceMessageId: 2,
    },
    3
  );
  renderStats.avatars = 0;
  props.jumpingFromMessageId = 3;
  await render();
  expect(renderStats.avatars).toBe(1);
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-label")).toBe("正在加载原消息");
  props.jumpingFromMessageId = null;
  await render();
  expect(button.disabled).toBe(false);
});
