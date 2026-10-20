// @vitest-environment jsdom
/** 从真实设置控制器验证跨分区保存和保存期间继续编辑。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { useSettingsController } from "./useSettingsController";

const state = vi.hoisted(() => ({
  config: {} as any,
  saveKey: vi.fn(),
  savePreferences: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "zh" }),
}));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/settings", vi.fn()] }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    apiConfig: {
      get: { useQuery: () => ({ data: state.config, isLoading: false }) },
      setKey: { useMutation: () => ({ mutateAsync: state.saveKey }) },
      updatePreferences: {
        useMutation: () => ({
          mutateAsync: state.savePreferences,
          isPending: false,
        }),
      },
      listModels: {
        useQuery: () => ({ data: { models: [] }, isLoading: false }),
      },
      listElevenLabsVoices: {
        useQuery: () => ({ data: { voices: [] }, isLoading: false }),
      },
      listFishAudioModels: {
        useQuery: () => ({ data: { models: [] }, isLoading: false }),
      },
    },
    tts: { generate: { useMutation: () => ({ mutate: vi.fn() }) } },
    useUtils: () => ({ apiConfig: { get: { invalidate: state.invalidate } } }),
  },
}));

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.clearAllMocks();
  state.config = {
    chatProvider: { name: "openrouter", configured: false },
    preferences: {
      globalPrompt: "saved prompt",
      llmModel: "old-model",
      elevenlabsVoiceId: "old-voice",
    },
    keys: Object.fromEntries(
      ["fal", "openrouter", "elevenlabs", "fish-audio", "openai"].map(key => [
        key,
        { isSet: false },
      ])
    ),
  };
  state.saveKey.mockResolvedValue({});
  state.savePreferences.mockResolvedValue({});
  state.invalidate.mockResolvedValue(undefined);
});

async function mount() {
  let controller!: ReturnType<typeof useSettingsController>;
  function Probe() {
    controller = useSettingsController();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const render = () => act(async () => root.render(<Probe />));
  await render();
  return {
    get current() {
      return controller;
    },
    render,
    unmount: () => act(async () => root.unmount()),
  };
}

it("keeps settings and favorites usable when device storage is denied or malformed", async () => {
  localStorage.setItem("favorite-models", '{"broken":true}');
  const probe = await mount();
  try {
    expect(probe.current.favoriteModels).toEqual([]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    await act(async () => {
      probe.current.handleTtsToggle(true);
      probe.current.toggleFavoriteModel("qa-model");
    });
    expect(probe.current.ttsAutoPlay).toBe(true);
    expect(probe.current.favoriteModels).toEqual(["qa-model"]);
  } finally {
    vi.restoreAllMocks();
    await probe.unmount();
  }
});

it("keeps unsaved prompt, model, and voice while saving an image key and refreshing configuration", async () => {
  const probe = await mount();
  try {
    await act(async () => {
      probe.current.setGlobalPrompt("unsaved prompt");
      probe.current.handleSelectModel("new-model");
      probe.current.handleSelectElevenLabsVoice({
        id: "new-voice",
        name: "New voice",
      } as any);
      probe.current.setFalApiKey("fal-test-key");
    });
    await act(async () => {
      await probe.current.handleSaveFalConfig();
    });
    state.config = {
      ...state.config,
      keys: { ...state.config.keys, fal: { isSet: true } },
    };
    await probe.render();
    expect(state.saveKey).toHaveBeenCalledExactlyOnceWith({
      name: "fal",
      value: "fal-test-key",
    });
    expect(state.savePreferences).not.toHaveBeenCalled();
    expect(probe.current.globalPrompt).toBe("unsaved prompt");
    expect(probe.current.selectedModel).toBe("new-model");
    expect(probe.current.elevenlabsVoiceId).toBe("new-voice");
    expect(probe.current.hasUnsavedAiChanges).toBe(true);
    expect(probe.current.hasUnsavedLlmChanges).toBe(true);
    expect(probe.current.hasUnsavedVoiceChanges).toBe(true);
    expect(probe.current.falApiKey).toBe("");
  } finally {
    await probe.unmount();
  }
});

it("acknowledges the submitted prompt without clearing edits made during that request", async () => {
  const probe = await mount();
  let resolve!: () => void;
  state.savePreferences.mockImplementationOnce(
    () =>
      new Promise<void>(done => {
        resolve = done;
      })
  );
  try {
    await act(async () => probe.current.setGlobalPrompt("submitted"));
    const saving = probe.current.handleSaveAiConfig();
    await act(async () => probe.current.setGlobalPrompt("edited during save"));
    await act(async () => {
      resolve();
      await saving;
    });
    state.config = {
      ...state.config,
      preferences: { ...state.config.preferences, globalPrompt: "submitted" },
    };
    await probe.render();
    expect(state.savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ globalPrompt: "submitted" })
    );
    expect(probe.current.globalPrompt).toBe("edited during save");
    expect(probe.current.hasUnsavedAiChanges).toBe(true);
  } finally {
    await probe.unmount();
  }
});
