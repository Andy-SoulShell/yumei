// @vitest-environment jsdom
/** 实际视频对话框支持两种模式、发布参数和未知送达时的幂等提交。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@shared/i18n";
import { VideoComposer } from "./VideoComposer";

const mocks = vi.hoisted(() => ({
  enabled: true,
  create: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") }),
}));
vi.mock("@/features/product/useProductConfig", () => ({
  useProductConfig: () => ({
    raw: {
      models: { video: { enabled: mocks.enabled } },
      runtime: {
        video: {
          defaultDurationSeconds: 3,
          minDurationSeconds: 2,
          maxDurationSeconds: 7,
          maxPromptChars: 25,
        },
      },
    },
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      conversation: {
        getMessages: { invalidate: mocks.invalidate },
        listWithDetails: { invalidate: mocks.invalidate },
      },
    }),
    video: {
      create: {
        useMutation: () => ({ mutate: mocks.create, isPending: false }),
      },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mocks.enabled = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () =>
    root.render(
      <VideoComposer
        conversationId={42}
        referenceImage="/character.png"
        photos={[{ id: 9, imageUrl: "/photo.png" }]}
      />
    )
  );
}
async function open() {
  await render();
  await act(async () => container.querySelector("button")!.click());
}
async function choose(id: string, label: string) {
  await act(async () =>
    document
      .getElementById(id)!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      )
  );
  const option = Array.from(document.querySelectorAll('[role="option"]')).find(
    item => item.textContent === label
  )!;
  expect(option).toBeTruthy();
  await act(async () =>
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  );
}
async function submit() {
  const button = Array.from(document.querySelectorAll("button")).find(
    item => item.textContent === "开始生成"
  )!;
  await act(async () => button.click());
}

it("hides the entry when video is disabled", async () => {
  mocks.enabled = false;
  await render();
  expect(container.querySelector("button")).toBeNull();
});
it("uses published constraints and supports character, chat-image and text inputs without mixing modes", async () => {
  await open();
  const duration = document.getElementById(
    "video-duration"
  ) as HTMLInputElement;
  expect([duration.min, duration.max, duration.value]).toEqual(["2", "7", "3"]);
  const prompt = document.getElementById("video-prompt") as HTMLTextAreaElement;
  expect(prompt.maxLength).toBe(25);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(prompt, "微笑，镜头推进");
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submit();
  await submit();
  expect(mocks.create.mock.calls[0][0]).toMatchObject({
    conversationId: 42,
    mode: "reference",
    referenceMessageId: null,
    prompt: "微笑，镜头推进",
    durationSeconds: 3,
  });
  expect(mocks.create.mock.calls[0][0].clientRequestId).toBe(
    mocks.create.mock.calls[1][0].clientRequestId
  );
  await choose("video-reference", "聊天图片 1");
  await submit();
  expect(mocks.create.mock.calls.at(-1)?.[0].referenceMessageId).toBe(9);
  await choose("video-mode", "文生视频");
  expect(document.getElementById("video-reference")).toBeNull();
  await submit();
  expect(mocks.create.mock.calls.at(-1)?.[0]).toMatchObject({
    mode: "text",
    referenceMessageId: null,
  });
});
