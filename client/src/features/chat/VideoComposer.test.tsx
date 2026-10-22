// @vitest-environment jsdom
/** 视频入口沿用自拍九宫格、亲密度解锁和文字优先，并保留未知响应的幂等键。 */
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@shared/i18n";
import { localizeProductConfig } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import { VideoComposer } from "./VideoComposer";

const mocks = vi.hoisted(() => ({
  enabled: true,
  pending: false,
  create: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") }),
}));
vi.mock("@/features/product/useProductConfig", () => ({
  useProductConfig: () => {
    const config = structuredClone(productFixture);
    config.models.video.enabled = mocks.enabled;
    Object.assign(config.runtime.video, {
      defaultDurationSeconds: 3,
      minDurationSeconds: 2,
      maxDurationSeconds: 7,
      maxPromptChars: 25,
    });
    config.videos.presets[0].label = { "zh-CN": "运营动作" };
    config.videos.presets.at(-1)!.enabled = false;
    config.selfies.poses[0].label = { "zh-CN": "自拍专用" };
    config.selfies.poses[0].enabled = false;
    return { raw: config, data: localizeProductConfig(config, "zh-CN") };
  },
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
        useMutation: () => ({ mutate: mocks.create, isPending: mocks.pending }),
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
  mocks.pending = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(
  props: Partial<ComponentProps<typeof VideoComposer>> = {}
) {
  await act(async () =>
    root.render(
      <VideoComposer
        conversationId={42}
        referenceImage="/character.png"
        intimacyPoints={0}
        photos={[{ id: 9, imageUrl: "/photo.png" }]}
        {...props}
      />
    )
  );
}
async function click(text: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    item =>
      item.textContent?.trim() === text ||
      item.title === text ||
      item.querySelector("span.truncate")?.textContent === text
  )!;
  expect(button, text).toBeTruthy();
  await act(async () => button.click());
}
async function open(props: Partial<ComponentProps<typeof VideoComposer>> = {}) {
  await render(props);
  await act(async () => container.querySelector("button")!.click());
}
async function chooseReference(label: string) {
  await act(async () =>
    document
      .getElementById("video-reference")!
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

it("hides the entry when video is disabled", async () => {
  mocks.enabled = false;
  await render();
  expect(container.querySelector("button")).toBeNull();
});
it("shows published presets and locks by current points; an unlocked preset generates with a blank description", async () => {
  await open();
  expect(
    document
      .querySelector('[aria-label="视频预设"]')!
      .querySelectorAll("button")
  ).toHaveLength(8);
  expect(
    document.querySelector('[aria-label="视频预设"]')!.textContent
  ).not.toContain("自拍专用");
  expect(
    document.querySelector('button[title="亲密度 Lv.4 解锁"]')
  ).toHaveProperty("disabled", true);
  await click("轻盈转圈");
  expect(mocks.create).not.toHaveBeenCalled();
  await click("运营动作");
  expect(mocks.create.mock.calls[0][0]).toMatchObject({
    conversationId: 42,
    mode: "reference",
    presetId: "wave",
    prompt: "",
    referenceMessageId: null,
    durationSeconds: 3,
  });
  expect(document.getElementById("video-prompt")).toBeNull();
});
it("uses the chat draft ahead of presets and reuses the request ID after an unknown response", async () => {
  await open({ draft: " 微笑，镜头推进 " });
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
    "本次描述：微笑，镜头推进"
  );
  await click("运营动作");
  await click("运营动作");
  const [a, b] = mocks.create.mock.calls.map(call => call[0]);
  expect(a).toMatchObject({ prompt: "微笑，镜头推进", presetId: "wave" });
  expect(a.clientRequestId).toBe(b.clientRequestId);
  await click("转身");
  expect(mocks.create.mock.calls.at(-1)![0].clientRequestId).not.toBe(
    a.clientRequestId
  );
});
it("keeps configurable duration, first-frame selection and custom descriptions in expandable settings", async () => {
  await open({ draft: "微笑，镜头推进" });
  await click("描述、首帧与时长");
  const duration = document.getElementById(
    "video-duration"
  ) as HTMLInputElement;
  expect([duration.min, duration.max, duration.value]).toEqual(["2", "7", "3"]);
  const prompt = document.getElementById("video-prompt") as HTMLTextAreaElement;
  expect(prompt.maxLength).toBe(25);
  await chooseReference("聊天图片 1");
  await click("开始生成");
  expect(mocks.create.mock.calls.at(-1)![0]).toMatchObject({
    referenceMessageId: 9,
  });
  expect(mocks.create.mock.calls.at(-1)![0].presetId).toBeUndefined();
  await click("文生视频");
  expect(document.getElementById("video-reference")).toBeNull();
  await click("开始生成");
  expect(mocks.create.mock.calls.at(-1)![0]).toMatchObject({
    mode: "text",
    referenceMessageId: null,
  });
});
it("unlocks higher presets as current points increase and blocks all submission while pending", async () => {
  await open({
    intimacyPoints: productFixture.intimacy.levels[3].requiredPoints,
  });
  await click("轻盈转圈");
  expect(mocks.create.mock.calls[0][0].presetId).toBe("twirl");
  mocks.pending = true;
  await render({
    intimacyPoints: productFixture.intimacy.levels[3].requiredPoints,
  });
  const presets = document
    .querySelector('[aria-label="视频预设"]')!
    .querySelectorAll("button");
  expect(Array.from(presets).every(button => button.disabled)).toBe(true);
});
it("requires a usable first frame only for reference mode", async () => {
  await open({ referenceImage: "" });
  await click("运营动作");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]')!.textContent).toContain(
    "首帧"
  );
  await click("文生视频");
  await click("运营动作");
  expect(mocks.create.mock.calls[0][0]).toMatchObject({
    mode: "text",
    presetId: "wave",
  });
});
