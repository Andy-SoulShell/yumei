// @vitest-environment jsdom
/** 录音生命周期：空闲清理不提示，取消会释放资源并结束等待。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { productFixture } from "../../../server/testProductConfig";
let recordingPolicy = structuredClone(productFixture);
import { useVoiceRecorder } from "./useVoiceRecorder";

vi.mock("@/features/product/useProductConfig", () => ({
  useProductConfig: () => ({ raw: recordingPolicy }),
}));
const mock = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mock }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useVoiceRecorder>;
const trackStop = vi.fn();
const recorders: Recorder[] = [];
class Recorder {
  static isTypeSupported() {
    return true;
  }
  state = "inactive";
  mimeType = "audio/webm";
  onstop?: () => void;
  ondataavailable?: (event: { data: Blob }) => void;
  constructor() {
    recorders.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop = vi.fn(() => {
    this.state = "inactive";
  });
}
function Harness() {
  state = useVoiceRecorder();
  return null;
}
beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  recordingPolicy = structuredClone(productFixture);
  vi.clearAllMocks();
  recorders.length = 0;
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }),
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("does not announce a cancellation when cleanup is called without recording", () => {
  act(() => state.cancelRecording());
  expect(mock.info).not.toHaveBeenCalled();
});
it("announces an active cancellation once and releases the microphone", async () => {
  await act(async () => state.startRecording());
  expect(state.isRecording).toBe(true);
  act(() => state.cancelRecording());
  act(() => state.cancelRecording());
  expect(recorders[0].stop).toHaveBeenCalledOnce();
  expect(trackStop).toHaveBeenCalledOnce();
  expect(mock.info).toHaveBeenCalledOnce();
  expect(state.isRecording).toBe(false);
});
it("resolves an in-flight stop when cancelled before onstop", async () => {
  await act(async () => state.startRecording());
  let pending!: Promise<unknown>;
  act(() => {
    pending = state.stopRecording();
  });
  act(() => state.cancelRecording());
  await expect(
    Promise.race([pending, Promise.resolve("unresolved")])
  ).resolves.toBeNull();
});
it("returns recorded bytes on normal stop without a cancellation notice", async () => {
  await act(async () => state.startRecording());
  recorders[0].ondataavailable?.({ data: new Blob(["audio"]) });
  let pending!: ReturnType<typeof state.stopRecording>;
  act(() => {
    pending = state.stopRecording();
  });
  act(() => recorders[0].onstop?.());
  const result = await pending;
  expect(result?.blob.size).toBe(5);
  expect(result?.mimeType).toBe("audio/webm");
  expect(trackStop).toHaveBeenCalledOnce();
  expect(mock.info).not.toHaveBeenCalled();
});
it("does not mix a cancelled recorder's late data into the next recording", async () => {
  await act(async () => state.startRecording());
  const oldData = recorders[0].ondataavailable!;
  act(() => state.cancelRecording());
  await act(async () => state.startRecording());
  oldData({ data: new Blob(["old-private"]) });
  recorders[1].ondataavailable?.({ data: new Blob(["new"]) });
  let pending!: ReturnType<typeof state.stopRecording>;
  act(() => {
    pending = state.stopRecording();
  });
  act(() => recorders[1].onstop?.());
  expect((await pending)?.blob.size).toBe(3);
});

it("uses the published microphone sample rate and duration timer", async () => {
  vi.useFakeTimers();
  recordingPolicy.uploads.audio.sampleRate = 22050;
  recordingPolicy.uploads.audio.maxDurationSeconds = 2;
  const reached = vi.fn();
  act(() => state.setOnMaxDuration(reached));
  await act(async () => state.startRecording());
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: expect.objectContaining({ sampleRate: 22050 }),
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999);
  });
  expect(reached).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(reached).toHaveBeenCalledOnce();
});
