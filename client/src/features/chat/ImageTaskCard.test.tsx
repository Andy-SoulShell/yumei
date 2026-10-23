// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@shared/i18n";
import { ImageTaskCard } from "./ImageTaskCard";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  retry: vi.fn(),
  invalidate: vi.fn(),
  setData: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN"), locale: "zh-CN" }),
}));
vi.mock("@/components/PhotoViewer", () => ({ PhotoViewer: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      girlfriend: { invalidate: mocks.invalidate },
      selfie: {
        task: { setData: mocks.setData, invalidate: mocks.invalidate },
        tasks: { invalidate: mocks.invalidate },
        quota: { invalidate: mocks.invalidate },
      },
      billing: { getInfo: { invalidate: mocks.invalidate } },
      conversation: { getMessages: { invalidate: mocks.invalidate } },
    }),
    selfie: {
      task: { useQuery: mocks.query },
      retryTask: {
        useMutation: () => ({ mutate: mocks.retry, isPending: false }),
      },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(patch: Record<string, unknown> = {}, error?: Error) {
  mocks.query.mockReturnValue({
    data: {
      id: "original-id",
      messageId: 4,
      conversationId: 42,
      kind: "selfie",
      status: "queued",
      phase: "queued",
      quota: "reserved",
      createdAt: new Date(),
      scene: "海边",
      ...patch,
    },
    error,
    refetch: mocks.refetch,
  });
  await act(async () =>
    root.render(<ImageTaskCard requestId="original-id" inChat />)
  );
}
it("restores and polls the original task, with separate queued and generating states", async () => {
  await render();
  expect(container.textContent).toContain("排队中");
  expect(container.textContent).toContain("已预留 1 次");
  expect(mocks.query.mock.calls.at(-1)?.[0]).toEqual({ id: "original-id" });
  const options = mocks.query.mock.calls.at(-1)?.[1];
  expect(
    options.refetchInterval({ state: { data: { status: "generating" } } })
  ).toBe(2500);
  expect(
    options.refetchInterval({ state: { data: { status: "completed" } } })
  ).toBe(false);
  await render({ status: "generating", phase: "submitting" });
  expect(container.textContent).toContain("核对生图服务");
  expect(mocks.retry).not.toHaveBeenCalled();
});
it("shows completed output, a full-image action and settled usage", async () => {
  await render({
    status: "completed",
    quota: "charged",
    imageUrl: "/files/result.png",
  });
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "/files/result.png"
  );
  expect(
    container.querySelector('button[aria-label="查看完整图片"]')
  ).not.toBeNull();
  expect(container.textContent).toContain("本次已使用 1 次");
  expect(container.textContent).not.toContain("重试生成");
});
it("explains the original-period refund and retries by source task ID", async () => {
  await render({
    status: "failed",
    quota: "refunded",
    failure: "provider",
    canRetry: true,
  });
  expect(container.textContent).toContain("已返还本次预留的 1 次");
  expect(container.textContent).toContain("不增加新周期额度");
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent?.includes("重试生成"))!
      .click()
  );
  expect(mocks.retry).toHaveBeenCalledWith({ id: "original-id" });
});
it("links the existing retry after a reload instead of offering a second retry", async () => {
  await render({
    status: "failed",
    quota: "refunded",
    failure: "provider",
    canRetry: true,
    retryTaskId: "retry-id",
  });
  expect(
    container.querySelector('a[href="/generate?task=retry-id"]')
  ).not.toBeNull();
  expect(container.textContent).not.toContain("重试生成");
});
it("does not promise to refund provider charges for a BYOK request", async () => {
  await render({ status: "failed", quota: "unmetered", isByok: true });
  expect(container.textContent).toContain("产品无法退还");
  expect(container.textContent).not.toContain("已返还本次预留");
});
it("does not resubmit an uncertain provider request and preserves stale state on query failure", async () => {
  await render({
    status: "failed",
    quota: "refunded",
    failure: "unconfirmed",
    canRetry: false,
  });
  expect(container.textContent).toContain("本任务不会再次提交");
  expect(container.textContent).not.toContain("重试生成");
  await render({ status: "generating" }, new Error("offline"));
  expect(container.textContent).toContain("已保留上次记录");
  expect(mocks.retry).not.toHaveBeenCalled();
});
