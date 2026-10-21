// @vitest-environment jsdom
/** 多行输入、桌面/触屏回车和输入法确认键的交互回归。 */
import { act, useRef, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { ChatComposer } from "./ChatComposer";

type Props = ComponentProps<typeof ChatComposer>;
let root: Root;
let container: HTMLDivElement;
let desktop = true;
let busy = false;
let generating = false;
let stopping = false;
let connection = "connected";
let voiceSupported = true;
let preferredInputMode: "text" | "voice" = "text";
const stopped = vi.fn();
const submitted = vi.fn();
function Harness() {
  const [message, setMessage] = useState("");
  const [inputMode, switchInputMode] = useState<"text" | "voice">(
    preferredInputMode
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const props = {
    handleSendMessage: (event: React.FormEvent) => {
      event.preventDefault();
      submitted(message);
      setMessage("");
    },
    isAccepting: busy,
    chatStream: {
      isGenerating: generating,
      isStopping: stopping,
      connection,
    },
    handleStopGeneration: stopped,
    generateSelfie: { isPending: false },
    generateCouple: { isPending: false },
    setShowPoseDialog: vi.fn(),
    isRecording: false,
    isTranscribing: false,
    apiConfig: { imageProvider: { configured: true } },
    selfieRemaining: Infinity,
    t: i18n.getFixedT("zh-CN") as Translator,
    inputMode,
    inputRef,
    message,
    setMessage,
    voiceSupported,
    switchInputMode,
    duration: 0,
    startRecording: vi.fn(),
    handleRecordingComplete: vi.fn(),
    cancelRecording: vi.fn(),
    girlfriend: { name: "小雨" },
  } as unknown as Props;
  return <ChatComposer {...props} />;
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  desktop = true;
  busy = false;
  generating = false;
  stopping = false;
  connection = "connected";
  voiceSupported = true;
  preferredInputMode = "text";
  stopped.mockClear();
  submitted.mockClear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: desktop }))
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const input = () => container.querySelector("textarea")!;
async function fill(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(async () => {
    input().dispatchEvent(event);
  });
  return event;
}
it("sends multiline desktop text with Enter and reserves Shift+Enter for newlines", async () => {
  await fill("第一行\n第二行");
  expect((await key({ shiftKey: true })).defaultPrevented).toBe(false);
  expect(submitted).not.toHaveBeenCalled();
  expect((await key()).defaultPrevented).toBe(true);
  expect(submitted).toHaveBeenCalledWith("第一行\n第二行");
  expect(input().value).toBe("");
});
it("keeps touch Enter for a newline and supports a hardware keyboard shortcut", async () => {
  desktop = false;
  await fill("手机草稿");
  expect((await key()).defaultPrevented).toBe(false);
  expect(submitted).not.toHaveBeenCalled();
  await key({ ctrlKey: true });
  expect(submitted).toHaveBeenCalledWith("手机草稿");
});
it("does not send while confirming an IME candidate or immediately after composition ends", async () => {
  vi.useFakeTimers();
  await fill("你好");
  await act(async () => {
    input().dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true })
    );
  });
  await key({ isComposing: true });
  await act(async () => {
    input().dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true })
    );
  });
  await key();
  expect(submitted).not.toHaveBeenCalled();
  await act(async () => {
    vi.runAllTimers();
  });
  await key();
  expect(submitted).toHaveBeenCalledOnce();
});
it("allows the next draft while acceptance is pending without submitting it", async () => {
  busy = true;
  await act(async () => root.render(<Harness />));
  await fill("下一条，继续写");
  expect(input().disabled).toBe(false);
  expect(input().value).toBe("下一条，继续写");
  expect(
    container.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled
  ).toBe(true);
  await key();
  expect(submitted).not.toHaveBeenCalled();
});
it("allows supplements during generation and provides an independent stop action", async () => {
  generating = true;
  await act(async () => root.render(<Harness />));
  await fill("还有一件事");
  expect(
    container.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled
  ).toBe(false);
  const stop = container.querySelector<HTMLButtonElement>(
    '[aria-label="停止回复"]'
  )!;
  expect(stop.textContent).toContain("停止回复");
  await act(async () => stop.click());
  expect(stopped).toHaveBeenCalledOnce();
  expect(input().value).toBe("还有一件事");
  await key();
  expect(submitted).toHaveBeenCalledWith("还有一件事");
});
it("keeps the draft editable while stop is pending and prevents duplicate stop actions", async () => {
  generating = true;
  stopping = true;
  await act(async () => root.render(<Harness />));
  await fill("停止后接着说");
  const stop = container.querySelector<HTMLButtonElement>(
    '[aria-label="停止回复"]'
  )!;
  expect(stop.disabled).toBe(true);
  await act(async () => stop.click());
  expect(stopped).not.toHaveBeenCalled();
  expect(input().disabled).toBe(false);
  expect(input().value).toBe("停止后接着说");
});
it("shows reconnecting status without a stop action when there is no active reply", async () => {
  connection = "reconnecting";
  await act(async () => root.render(<Harness />));
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "正在重新连接"
  );
  expect(container.querySelector('[aria-label="停止回复"]')).toBeNull();
  await fill("网络恢复后再发");
  expect(input().disabled).toBe(false);
});
it("keeps the text draft when switching to voice and back", async () => {
  await fill("  ");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="切换到语音输入"]')!
      .click()
  );
  expect(container.querySelector("textarea")).toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="切换到文字输入"]')!
      .click()
  );
  expect(input().value).toBe("  ");
  expect(document.activeElement).toBe(input());
});

it("uses text input when saved voice mode is unavailable on LAN HTTP", async () => {
  preferredInputMode = "voice";
  voiceSupported = false;
  await act(async () => root.render(<Harness key="saved-voice" />));
  expect(input()).not.toBeNull();
  expect(container.querySelector('[aria-label="切换到语音输入"]')).toBeNull();
  await fill("局域网文字消息");
  await key();
  expect(submitted).toHaveBeenCalledWith("局域网文字消息");
});
