// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { LOCALES } from "@shared/locales";
import Setup from "@/pages/Setup";
import { CREATOR_IMAGE_GROUPS } from "./creatorAssets";
import { loadCreatorReference } from "./creatorOptions";

const mock = vi.hoisted(() => ({
  query: "",
  create: vi.fn(),
  update: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/setup", mock.navigate],
  useParams: () => ({}),
  useSearch: () => mock.query,
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("sonner", () => ({ toast: { error: mock.error, success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ girlfriend: { invalidate: vi.fn() } }),
    apiConfig: { get: { useQuery: () => ({ data: undefined }) } },
    girlfriend: {
      list: { useQuery: () => ({ data: [] }) },
      create: {
        useMutation: () => ({ mutate: mock.create, isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: mock.update, isPending: false }),
      },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadAvatar: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

let root: Root;
let container: HTMLDivElement;
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}
async function click(text: string) {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find(button => button.textContent?.trim() === text);
  expect(button, `Missing button: ${text}`).toBeDefined();
  await settle(() => button!.click());
}
async function choose(group: string, label: string) {
  const control = container.querySelector<HTMLButtonElement>(
    `[role="radiogroup"][aria-label="${group}"] [role="radio"][aria-label="${label}"]`
  );
  expect(control, `Missing choice: ${group}/${label}`).not.toBeNull();
  await settle(() => control!.click());
}
async function fill(selector: string, value: string) {
  const element = container.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(selector)!;
  const prototype =
    element.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await settle(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.query = "";
  mock.fetch.mockResolvedValue({
    ok: true,
    blob: async () =>
      new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" }),
  });
  vi.stubGlobal("fetch", mock.fetch);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("companion creation", () => {
  it("walks through visual choices and submits a local reference with the editable profile", async () => {
    await settle(() => root.render(<Setup />));
    expect(mock.create).not.toHaveBeenCalled();
    await click("下一步");
    await choose("模板", "邻家女孩");
    await choose("气质", "甜美治愈系");
    await choose("发型", "马尾");
    await click("下一步");
    await choose("体型", "运动型");
    await click("下一步");
    expect(
      container.querySelector<HTMLTextAreaElement>("#appearance")!.value
    ).toContain("马尾");
    await fill("#name", "小雨");
    await fill("#personality", "温柔，喜欢分享日常。自定义设定。");
    await fill("#appearance", "成年女性，棕色马尾，运动装。保留手动描述。");
    await click("下一步");
    expect(mock.create).not.toHaveBeenCalled();
    await click("上一步");
    expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe(
      "小雨"
    );
    expect(
      container.querySelector<HTMLTextAreaElement>("#appearance")!.value
    ).toContain("保留手动描述");
    await click("下一步");
    const form = container.querySelector("form")!;
    await settle(() =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
    );
    expect(mock.fetch).toHaveBeenCalledWith(
      "/character-options/creator/female/realistic/ethnicity/sweethealing.webp"
    );
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "小雨",
        appearance: "成年女性，棕色马尾，运动装。保留手动描述。",
        referenceImageBase64: "UklGRg==",
        referenceImageMimeType: "image/webp",
      })
    );
  });

  it("clears incompatible body choices when switching gender and supports the anime route", async () => {
    await settle(() => root.render(<Setup />));
    await click("下一步");
    await click("从头自定义");
    await click("下一步");
    await choose("胸部大小", "大");
    const styleStep = Array.from(
      container.querySelectorAll<HTMLButtonElement>("nav button")
    ).find(button => button.textContent?.includes("风格"))!;
    await settle(() => styleStep.click());
    const male = container.querySelector<HTMLButtonElement>(
      '[role="radio"][value="male"]'
    )!;
    await settle(() => male.click());
    await choose("风格", "动漫");
    await click("下一步");
    expect(container.textContent).toContain("从下一步开始");
    await click("从头自定义");
    expect(
      container.querySelectorAll(
        '[role="radiogroup"][aria-label="气质"] [role="radio"]'
      )
    ).toHaveLength(7);
    await click("下一步");
    expect(container.textContent).not.toContain("胸部大小");
    expect(container.textContent).not.toContain("臀部大小");
    await click("下一步");
    const appearance =
      container.querySelector<HTMLTextAreaElement>("#appearance")!.value;
    expect(appearance).toContain("男性");
    expect(appearance).not.toContain("胸部");
    await click("下一步");
    expect(mock.error).toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("keeps existing preset links and sends no reference fetch for them", async () => {
    mock.query = "?preset=momoka";
    await settle(() => root.render(<Setup />));
    expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe(
      "桃香"
    );
    await click("下一步");
    await settle(() =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({ presetId: "momoka", name: "桃香" })
    );
    expect(mock.fetch).not.toHaveBeenCalled();
  });

  it("blocks failed reference downloads and accepts only registered local assets", async () => {
    await expect(
      loadCreatorReference("https://example.com/reference.webp")
    ).rejects.toThrow();
    expect(mock.fetch).not.toHaveBeenCalled();
    mock.query = "?preset=rin";
    await settle(() => root.render(<Setup />));
    // Changing the style replaces the original preset with a local option image.
    const first = Array.from(
      container.querySelectorAll<HTMLButtonElement>("nav button")
    ).find(button => button.textContent?.includes("风格"))!;
    await settle(() => first.click());
    await choose("风格", "动漫");
    await click("下一步");
    await click("从头自定义");
    await click("下一步");
    await click("下一步");
    await click("下一步");
    mock.fetch.mockResolvedValueOnce({ ok: false });
    await settle(() =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.error).toHaveBeenCalledWith(
      "参考图加载失败，请重试或上传图片。"
    );
  });

  it("localizes every registered picture option", () => {
    for (const group of CREATOR_IMAGE_GROUPS) {
      for (const option of group.options) {
        for (const locale of LOCALES)
          expect(
            i18n.exists(`creator:${option.id}`, {
              lng: locale,
              fallbackLng: false,
            }),
            `${locale}/${option.id}`
          ).toBe(true);
      }
    }
  });
});
