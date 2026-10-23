// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { discoveryFixture } from "@/features/discovery/testFixtures";
import { productFixture } from "../../../server/testProductConfig";
import Setup from "./Setup";

const mock = vi.hoisted(() => ({ state: {} as any, voiceRender: vi.fn() }));
vi.mock("@/features/setup/useSetupController", () => ({
  useSetupController: () => mock.state,
}));
vi.mock("@/hooks/usePageBack", () => ({ usePageBack: () => vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/features/setup/ReferenceUpload", () => ({
  ReferenceUpload: () => <p>参考图上传</p>,
}));
vi.mock("@/features/setup/AvatarUpload", () => ({
  AvatarUpload: () => <p>头像上传</p>,
}));
vi.mock("@/features/setup/BehaviorEditor", () => ({
  BehaviorEditor: () => <p>相处细节编辑器</p>,
}));
vi.mock("@/features/setup/CharacterPrompt", () => ({
  CharacterPrompt: () => <p>高级提示词</p>,
}));
vi.mock("@/features/setup/CharacterVoice", async () => {
  const { useState } = await import("react");
  return {
    CharacterVoice() {
      mock.voiceRender();
      const [value, setValue] = useState("");
      return (
        <input
          aria-label="待选声音"
          value={value}
          onChange={event => setValue(event.target.value)}
        />
      );
    },
  };
});

let root: Root;
let container: HTMLDivElement;
const render = () => root.render(<Setup />);
const settle = (action: () => void) =>
  act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
const button = (text: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    item => item.textContent?.includes(text)
  )!;
function inputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const preset = discoveryFixture.characters[0];
  mock.state = {
    t: i18n.getFixedT("zh-CN") as Translator,
    characterLimits: productFixture.characters.limits,
    trashDays: 7,
    characters: discoveryFixture.characters.filter(item => item.listed),
    isEditing: false,
    isPending: false,
    isUploadingAvatar: false,
    draftLoading: false,
    presetLoading: false,
    editLoading: false,
    presetId: preset.id,
    name: preset.name,
    personality: preset.personality,
    appearance: "",
    interests: "",
    advancedSections: { appearance: false, behavior: false, voice: false },
    capacity: {
      ready: true,
      full: false,
      remaining: 2,
      limit: 3,
      error: false,
      retry: vi.fn(),
    },
    deleteGirlfriend: { isPending: false },
    setLocation: vi.fn(),
    handleSubmit: vi.fn((event: Event) => event.preventDefault()),
    setPendingPreset: vi.fn(),
    confirmPresetChange: vi.fn(),
    handleDelete: vi.fn(),
    setName: (value: string) => {
      mock.state.name = value;
      render();
    },
    setPersonality: (value: string) => {
      mock.state.personality = value;
      render();
    },
    setAppearance: (value: string) => {
      mock.state.appearance = value;
      render();
    },
    setInterests: (value: string) => {
      mock.state.interests = value;
      render();
    },
    setAdvancedSection: (key: string, open: boolean) => {
      mock.state.advancedSections[key] = open;
      render();
    },
    handleSelectPreset: (value: typeof preset | null) => {
      mock.state.presetId = value?.id ?? null;
      mock.state.name = value?.name ?? "";
      mock.state.personality = value?.personality ?? "";
      render();
    },
    openCreatedChat: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("requires only name and personality for a selected look, with advanced sections collapsed", async () => {
  await settle(render);
  expect(container.querySelectorAll("[required]")).toHaveLength(2);
  expect(
    container.querySelector<HTMLFormElement>("form")!.checkValidity()
  ).toBe(true);
  expect(container.textContent).toContain("还可添加 2 位角色");
  expect(button("创建并开始聊天").disabled).toBe(false);
  expect(container.querySelector("#appearance")).toBeNull();
  expect(mock.voiceRender).not.toHaveBeenCalled();
  await settle(() => button("创建并开始聊天").click());
  expect(mock.state.handleSubmit).toHaveBeenCalledOnce();
});

it("retains advanced text and local voice inputs across closing and reopening sections", async () => {
  await settle(render);
  await settle(() => button("形象与兴趣").click());
  const appearance =
    container.querySelector<HTMLTextAreaElement>("#appearance")!;
  expect(appearance.required).toBe(false);
  await settle(() => inputValue(appearance, "银色短发"));
  await settle(() => button("形象与兴趣").click());
  expect(appearance.closest("[hidden]")).not.toBeNull();
  await settle(() => button("形象与兴趣").click());
  expect(appearance.value).toBe("银色短发");
  await settle(() => button("角色声音").click());
  const voice = container.querySelector<HTMLInputElement>(
    '[aria-label="待选声音"]'
  )!;
  await settle(() => inputValue(voice, "待提交的声音"));
  await settle(() => button("角色声音").click());
  await settle(() => button("角色声音").click());
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="待选声音"]')!.value
  ).toBe("待提交的声音");
});

it("limits initial look choices, supports more choices and collapses after selection", async () => {
  mock.state.presetId = null;
  await settle(render);
  expect(
    container.querySelectorAll(
      '[role="radio"][value]:not([value="custom"]):not([value="all"]):not([value="realistic"]):not([value="anime"])'
    )
  ).toHaveLength(4);
  await settle(() => button("继续查看").click());
  expect(
    container.querySelectorAll(
      '[role="radio"][value]:not([value="custom"]):not([value="all"]):not([value="realistic"]):not([value="anime"])'
    )
  ).toHaveLength(12);
  await settle(() =>
    container
      .querySelector<HTMLButtonElement>('[role="radio"][value="xiaotao"]')!
      .click()
  );
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe(
    "小桃"
  );
});

it("starts an asynchronously restored preset in its compact selected state", async () => {
  mock.state.draftLoading = true;
  await settle(render);
  expect(container.querySelector("form")).toBeNull();
  mock.state.draftLoading = false;
  await settle(render);
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe(
    "小桃"
  );
});

it("provides role management before submission when all slots are in use", async () => {
  mock.state.capacity = {
    ...mock.state.capacity,
    full: true,
    remaining: 0,
    limit: 1,
  };
  await settle(render);
  expect(container.textContent).toContain("名额已用完");
  expect(container.querySelector('button[type="submit"]')).toBeNull();
  expect(
    container.querySelector(".setup-submit-bar a")?.getAttribute("href")
  ).toBe("/characters");
});

it("blocks submission and offers retry when capacity cannot be read", async () => {
  mock.state.capacity = { ...mock.state.capacity, error: true, ready: false };
  await settle(render);
  expect(button("创建并开始聊天").disabled).toBe(true);
  await settle(() => button("重试").click());
  expect(mock.state.capacity.retry).toHaveBeenCalledOnce();
});

it("can enter custom creation even when the custom radio is already selected", async () => {
  mock.state.presetId = null;
  await settle(render);
  expect(button("创建并开始聊天").disabled).toBe(true);
  await settle(() =>
    container
      .querySelector<HTMLButtonElement>('[role="radio"][value="custom"]')!
      .click()
  );
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  expect(container.textContent).toContain("参考图上传");
});

it("shows a saved character with a chat retry instead of another creation form", async () => {
  mock.state.createdCharacter = { id: 77, name: "小桃" };
  mock.state.chatOpenError = true;
  await settle(render);
  expect(container.querySelector("form")).toBeNull();
  expect(container.textContent).toContain("角色已保存，重试即可继续");
  await settle(() => button("进入聊天").click());
  expect(mock.state.openCreatedChat).toHaveBeenCalledOnce();
});
