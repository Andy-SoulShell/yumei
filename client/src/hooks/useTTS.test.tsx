// @vitest-environment jsdom
/** 语音切换、取消和离开页面时，不让迟到的事件恢复旧播放。 */
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
import { useTTS } from "./useTTS";

const mock = vi.hoisted(() => ({
  provider: "browser",
  mutate: vi.fn(),
  error: vi.fn(),
  translate: (key: string) => key,
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: mock.translate }) }));
vi.mock("sonner", () => ({ toast: { error: mock.error } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    apiConfig: {
      get: {
        useQuery: () => ({
          data: { preferences: { ttsProvider: mock.provider } },
        }),
      },
    },
    tts: { generate: { useMutation: () => ({ mutate: mock.mutate }) } },
  },
}));
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useTTS>;
let unmounted: boolean;
const utterances: any[] = [];
const audio: any[] = [];
const cancel = vi.fn();
function Harness() {
  state = useTTS();
  return null;
}
beforeEach(() => {
  localStorage.clear();
  mock.provider = "browser";
  mock.mutate.mockReset();
  mock.error.mockReset();
  cancel.mockReset();
  utterances.length = 0;
  audio.length = 0;
  unmounted = false;
  vi.stubGlobal("speechSynthesis", {
    cancel,
    getVoices: () => [],
    speak: (value: unknown) => utterances.push(value),
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    }
  );
  vi.stubGlobal(
    "Audio",
    class {
      pause = vi.fn();
      play = vi.fn().mockResolvedValue(undefined);
      constructor(public src: string) {
        audio.push(this);
      }
    }
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  if (!unmounted) act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function render() {
  act(() => root.render(<Harness />));
}
function unmount() {
  act(() => root.unmount());
  unmounted = true;
}

it("无关状态更新不会重建播放回调，速度改变后仍使用新的配置", () => {
  render();
  const speak = state.speak;
  act(() => state.toggleAutoPlay());
  expect(state.speak).toBe(speak);
  act(() => state.updateSpeed(1.5));
  expect(state.speak).not.toBe(speak);
  act(() => state.speak("新语速", 11));
  expect(utterances[0].rate).toBeCloseTo(1.5 * 0.95);
});

it("tracks the selected message and ignores the previous utterance ending after a switch", () => {
  render();
  act(() => state.speak("first", 11));
  expect(state.activeMessageId).toBe(11);
  act(() => state.speak("second", 12));
  expect(cancel).toHaveBeenCalledTimes(2);
  act(() => utterances[0].onend());
  expect(state.isSpeaking).toBe(true);
  expect(state.activeMessageId).toBe(12);
  act(() => utterances[1].onend());
  expect(state.isSpeaking).toBe(false);
  expect(state.activeMessageId).toBeNull();
});
it("cancels pending API audio even when the browser has no speech synthesis", () => {
  mock.provider = "fishaudio";
  Reflect.deleteProperty(window, "speechSynthesis");
  render();
  act(() => state.speak("pending", 11));
  const callbacks = mock.mutate.mock.calls[0][1];
  act(() => state.stop());
  act(() => callbacks.onSuccess({ audioUrl: "/late.mp3" }));
  expect(audio).toHaveLength(0);
  expect(state.isSpeaking).toBe(false);
  expect(state.activeMessageId).toBeNull();
});
it("only plays the latest API result and pauses it when stopped", () => {
  mock.provider = "elevenlabs";
  render();
  act(() => state.speak("old", 11));
  const old = mock.mutate.mock.calls[0][1];
  act(() => state.speak("new", 12));
  const latest = mock.mutate.mock.calls[1][1];
  act(() => old.onSuccess({ audioUrl: "/old.mp3" }));
  act(() => old.onError(new Error("old failure")));
  expect(audio).toHaveLength(0);
  expect(mock.error).not.toHaveBeenCalled();
  act(() => latest.onSuccess({ audioUrl: "/new.mp3" }));
  expect(audio[0].play).toHaveBeenCalledOnce();
  expect(state.activeMessageId).toBe(12);
  act(() => state.stop());
  expect(audio[0].pause).toHaveBeenCalledOnce();
});
it("stops browser speech on unmount and ignores a late autoplay call", () => {
  render();
  act(() => state.speak("now", 11));
  const lateSpeak = state.speak;
  unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
  lateSpeak("late", 12);
  expect(utterances).toHaveLength(1);
});
it("does not create audio if generation finishes after leaving the page", () => {
  mock.provider = "elevenlabs";
  render();
  act(() => state.speak("pending", 11));
  const callbacks = mock.mutate.mock.calls[0][1];
  unmount();
  callbacks.onSuccess({ audioUrl: "/late.mp3" });
  expect(audio).toHaveLength(0);
});

it("allows speed and autoplay changes even when device storage is denied", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "QuotaExceededError");
  });
  render();
  expect(state.playbackSpeed).toBe(1);
  expect(state.autoPlay).toBe(false);
  act(() => {
    state.updateSpeed(1.5);
    state.toggleAutoPlay();
  });
  expect(state.playbackSpeed).toBe(1.5);
  expect(state.autoPlay).toBe(true);
});
it.each(["NaN", "0", "100", "1.5bad"])(
  "uses normal speed instead of corrupt cached value %s",
  saved => {
    localStorage.setItem("tts-speed", saved);
    render();
    expect(state.playbackSpeed).toBe(1);
  }
);
