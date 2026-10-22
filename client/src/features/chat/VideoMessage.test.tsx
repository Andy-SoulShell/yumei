// @vitest-environment jsdom
/** 视频消息刷新恢复、原生播放与幂等重试的组件回归。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@shared/i18n";
import { VideoMessage } from "./VideoMessage";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  cancel: vi.fn(),
  create: vi.fn(),
  invalidate: vi.fn(),
  setData: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") }),
}));
vi.mock("@/features/product/useProductConfig", () => ({
  useProductConfig: () => ({ raw: { runtime: { video: { pollMs: 3000 } } } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      video: { get: { setData: mocks.setData } },
      conversation: { getMessages: { invalidate: mocks.invalidate } },
    }),
    video: {
      get: { useQuery: mocks.get },
      cancel: { useMutation: () => ({ mutate: mocks.cancel }) },
      create: { useMutation: () => ({ mutate: mocks.create }) },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
const input = {
  conversationId: 42,
  clientRequestId: "previous-id",
  prompt: "微笑",
  mode: "reference",
  durationSeconds: 5,
  referenceMessageId: null,
};
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
async function render(data: Record<string, unknown>) {
  mocks.get.mockReturnValue({
    data: {
      id: "request-id",
      input,
      conversationId: 42,
      durationSeconds: 124 / 24,
      prompt: "微笑",
      ...data,
    },
  });
  await act(async () => root.render(<VideoMessage requestId="request-id" />));
}

it("resumes polling the same durable task and stops polling after completion", async () => {
  await render({ status: "pending", phase: "running" });
  expect(container.textContent).toContain("视频生成中");
  expect(container.textContent).toContain("关闭页面后仍会继续生成");
  expect(mocks.get.mock.calls.at(-1)?.[0]).toEqual({ id: "request-id" });
  const options = mocks.get.mock.calls.at(-1)?.[1];
  expect(
    options.refetchInterval({ state: { data: { status: "pending" } } })
  ).toBe(3000);
  expect(
    options.refetchInterval({ state: { data: { status: "succeeded" } } })
  ).toBe(false);
  expect(container.querySelector("button")).toBeNull();
});
it("renders a mobile inline native video with controls and no autoplay", async () => {
  await render({ status: "succeeded", videoUrl: "/files/video-test.mp4" });
  const video = container.querySelector("video")!;
  expect(video.getAttribute("src")).toBe("/files/video-test.mp4");
  expect(video.controls).toBe(true);
  expect(video.playsInline).toBe(true);
  expect(video.preload).toBe("metadata");
  expect(video.autoplay).toBe(false);
  expect(container.textContent).toContain("5.17");
});
it("allows cancellation only before remote submission and reuses one retry key", async () => {
  await render({ status: "pending", phase: "queued" });
  await act(async () => container.querySelector("button")!.click());
  expect(mocks.cancel).toHaveBeenCalledWith({ id: "request-id" });
  await render({ status: "failed", phase: "running" });
  expect(container.textContent).toContain("不计入视频额度");
  await act(async () => container.querySelector("button")!.click());
  await act(async () => container.querySelector("button")!.click());
  const [a, b] = mocks.create.mock.calls;
  expect(a[0]).toMatchObject({ ...input, clientRequestId: expect.any(String) });
  expect(a[0].clientRequestId).not.toBe(input.clientRequestId);
  expect(a[0].clientRequestId).toBe(b[0].clientRequestId);
});
