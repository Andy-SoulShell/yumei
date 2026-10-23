import { clearFormDrafts } from "@/lib/formDrafts";
// @vitest-environment jsdom
/** 从真实设置控制器验证跨分区保存和保存期间继续编辑。 */
vi.mock("@/features/product/useProductConfig", async () => {
  const { productFixture, productView } =
    await import("../../../../server/testProductConfig");
  return {
    useProductConfig: () => ({ raw: productFixture, data: productView }),
  };
});
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { useSettingsController } from "./useSettingsController";

const state = vi.hoisted(() => ({
  config: {} as any,
  accountId: "settings-qa",
  saveKey: vi.fn(),
  savePreferences: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: state.accountId } }),
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
  sessionStorage.clear();
  clearFormDrafts();
  vi.clearAllMocks();
  state.accountId = "settings-qa";
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

it("saves a local voice without requesting a cloud API key", async () => {
  const probe = await mount();
  await act(async () => {
    probe.current.setTtsProvider("omnivoice");
    probe.current.setOmnivoiceVoiceId("custom");
  });
  expect(probe.current.hasUnsavedVoiceChanges).toBe(true);
  await act(async () => {
    await probe.current.handleSaveVoiceConfig();
  });
  expect(state.savePreferences).toHaveBeenCalledWith(
    expect.objectContaining({
      ttsProvider: "omnivoice",
      omnivoiceVoiceId: "custom",
    })
  );
  expect(state.saveKey).not.toHaveBeenCalled();
  expect(probe.current.hasUnsavedVoiceChanges).toBe(false);
  await probe.unmount();
});

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

it("never includes API keys in persisted ordinary settings drafts", async () => {
  const { readFormDraft, formDraftKey } = await import("@/lib/formDrafts");
  const probe = await mount();
  try {
    await act(async () => {
      probe.current.setGlobalPrompt("保留普通设置");
      probe.current.setFalApiKey("private-do-not-persist-key");
    });
    const record = readFormDraft(
      formDraftKey("settings-qa", "reply-and-service-settings")
    );
    expect(record).toEqual({ globalPrompt: "保留普通设置" });
    expect(JSON.stringify(record)).not.toContain("private-do-not-persist-key");
  } finally {
    await probe.unmount();
  }
});

it("shows its own saving state, blocks duplicate writes, and keeps failure input for retry", async () => {
  const probe = await mount();
  let reject!: (error: Error) => void;
  state.savePreferences.mockImplementationOnce(
    () =>
      new Promise((_, no) => {
        reject = no;
      })
  );
  try {
    await act(async () => probe.current.setReplyLanguage("中文"));
    let saving!: ReturnType<typeof probe.current.handleSaveAiConfig>;
    await act(async () => {
      saving = probe.current.handleSaveAiConfig();
    });
    expect(probe.current.feedback.behavior?.status).toBe("saving");
    expect(probe.current.feedback.voice).toBeUndefined();
    expect(probe.current.isSavingSection).toBe(true);
    await act(async () => {
      await probe.current.handleSaveAiConfig();
      await probe.current.handleSaveVoiceConfig();
    });
    expect(state.savePreferences).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject(new Error("offline"));
      await saving;
    });
    expect(probe.current.feedback.behavior?.status).toBe("error");
    expect(probe.current.replyLanguage).toBe("中文");
    expect(probe.current.hasUnsavedAiChanges).toBe(true);
    await act(async () => {
      await probe.current.handleSaveAiConfig();
    });
    expect(probe.current.feedback.behavior?.status).toBe("saved");
    expect(probe.current.hasUnsavedAiChanges).toBe(false);
  } finally {
    await probe.unmount();
  }
});

it("snapshots keys at click, preserves later edits, and retries failed keys without rewriting saved preferences", async () => {
  const probe = await mount();
  let finish!: () => void;
  state.savePreferences.mockImplementationOnce(
    () =>
      new Promise<void>(yes => {
        finish = yes;
      })
  );
  state.saveKey.mockRejectedValueOnce(new Error("key rejected"));
  try {
    await act(async () => {
      probe.current.setTtsProvider("elevenlabs");
      probe.current.setElevenlabsApiKey("submitted-key");
    });
    let saving!: ReturnType<typeof probe.current.handleSaveVoiceConfig>;
    await act(async () => {
      saving = probe.current.handleSaveVoiceConfig();
    });
    await act(async () =>
      probe.current.setElevenlabsApiKey("edited-after-click")
    );
    await act(async () => {
      finish();
      await saving;
    });
    expect(state.saveKey).toHaveBeenCalledExactlyOnceWith({
      name: "elevenlabs",
      value: "submitted-key",
    });
    expect(probe.current.elevenlabsApiKey).toBe("edited-after-click");
    expect(probe.current.feedback.voice?.status).toBe("partial");
    await act(async () => {
      await probe.current.handleSaveVoiceConfig();
    });
    expect(state.savePreferences).toHaveBeenCalledTimes(1);
    expect(state.saveKey).toHaveBeenLastCalledWith({
      name: "elevenlabs",
      value: "edited-after-click",
    });
    expect(probe.current.feedback.voice?.status).toBe("saved");
    expect(probe.current.hasUnsavedVoiceChanges).toBe(false);
  } finally {
    await probe.unmount();
  }
});

it("reports successful writes separately from a failed refresh", async () => {
  const probe = await mount();
  state.invalidate.mockRejectedValueOnce(new Error("refresh offline"));
  try {
    await act(async () =>
      probe.current.setGlobalPrompt("save despite stale cache")
    );
    await act(async () => {
      await probe.current.handleSaveAiConfig();
    });
    expect(probe.current.feedback.behavior).toEqual({
      status: "saved",
      refreshFailed: true,
    });
    expect(probe.current.hasUnsavedAiChanges).toBe(false);
    await act(async () => {
      await probe.current.refreshSavedSettings();
    });
    expect(probe.current.feedback.behavior?.refreshFailed).toBe(false);
    expect(state.savePreferences).toHaveBeenCalledTimes(1);
  } finally {
    await probe.unmount();
  }
});

it("does not continue an old account's key batch or publish its result into a new account", async () => {
  const probe = await mount();
  let finish!: () => void;
  state.savePreferences.mockImplementationOnce(
    () =>
      new Promise<void>(yes => {
        finish = yes;
      })
  );
  try {
    await act(async () => {
      probe.current.setTtsProvider("elevenlabs");
      probe.current.setElevenlabsApiKey("account-a-private");
    });
    let saving!: ReturnType<typeof probe.current.handleSaveVoiceConfig>;
    await act(async () => {
      saving = probe.current.handleSaveVoiceConfig();
    });
    state.accountId = "settings-account-b";
    await probe.render();
    expect(probe.current.elevenlabsApiKey).toBe("");
    await act(async () => {
      finish();
      await saving;
    });
    expect(state.saveKey).not.toHaveBeenCalled();
    expect(probe.current.feedback).toEqual({});
    expect(probe.current.isSavingSection).toBe(false);
  } finally {
    await probe.unmount();
  }
});
