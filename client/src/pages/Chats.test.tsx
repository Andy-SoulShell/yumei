// @vitest-environment jsdom
/** 翻页或刷新失败时保留已有会话，重试对应的失败请求。 */
vi.mock("@/features/product/useProductConfig", async () => {
  const { productFixture, productView } =
    await import("../../../server/testProductConfig");
  return {
    useProductConfig: () => ({ raw: productFixture, data: productView }),
  };
});
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import Chats from "./Chats";
vi.mock("@/components/DeleteConversationButton", () => ({
  DeleteConversationButton: () => null,
}));

const mock = vi.hoisted(() => ({
  query: {} as any,
  next: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    conversation: { listWithDetails: { useInfiniteQuery: () => mock.query } },
  },
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  mock.next.mockReset();
  mock.refetch.mockReset();
  mock.query = {
    data: {
      pages: [
        [
          {
            id: 42,
            girlfriendName: "Yumi",
            lastMessage: "Hello",
            updatedAt: new Date(),
          },
        ],
      ],
    },
    isLoading: false,
    isFetching: false,
    error: new Error("temporary failure"),
    isFetchNextPageError: true,
    hasNextPage: true,
    fetchNextPage: mock.next,
    refetch: mock.refetch,
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render() {
  act(() => root.render(<Chats />));
}
function retry() {
  act(() =>
    Array.from(container.querySelectorAll("button"))
      .find(b => b.textContent === "重试")!
      .click()
  );
}
it("keeps existing conversations and retries only the failed next page", () => {
  render();
  expect(container.querySelector('a[href="/chat/42"]')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "重试"
  );
  retry();
  expect(mock.next).toHaveBeenCalledOnce();
  expect(mock.refetch).not.toHaveBeenCalled();
});
it("preserves conversations when a background refresh fails", () => {
  mock.query.isFetchNextPageError = false;
  render();
  expect(container.querySelector('a[href="/chat/42"]')).not.toBeNull();
  retry();
  expect(mock.refetch).toHaveBeenCalledOnce();
  expect(mock.next).not.toHaveBeenCalled();
});
it("offers a full retry when the first page has no data", () => {
  mock.query.data = undefined;
  mock.query.isFetchNextPageError = false;
  render();
  expect(container.querySelector(".conversation-card")).toBeNull();
  expect(container.textContent).not.toContain("暂无对话");
  retry();
  expect(mock.refetch).toHaveBeenCalledOnce();
});
