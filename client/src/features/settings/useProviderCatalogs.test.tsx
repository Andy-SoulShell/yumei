// @vitest-environment jsdom
/** 使用运营方语音且未填写 BYOK 时，真实目录 Hook 仍加载可用音色。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useProviderCatalogs } from "./useProviderCatalogs";

const queries = vi.hoisted(() => ({ eleven: vi.fn(), fish: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    apiConfig: {
      listModels: { useQuery: () => ({}) },
      listElevenLabsVoices: { useQuery: queries.eleven },
      listFishAudioModels: { useQuery: queries.fish },
    },
  },
}));
it("loads each available operator catalogue and skips restricted or unconfigured services", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  queries.eleven.mockReturnValue({});
  queries.fish.mockReturnValue({});
  const config: any = {
    chatProvider: { name: "deepseek" },
    keys: {
      openrouter: { isSet: false },
      elevenlabs: { isSet: false },
      "fish-audio": { isSet: false },
    },
    voiceProviders: {
      elevenlabs: { configured: true, allowed: true, available: true },
      fishaudio: { configured: true, allowed: false, available: false },
    },
  };
  function Probe() {
    useProviderCatalogs(config, "");
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Probe />));
    expect(queries.eleven).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ enabled: true })
    );
    expect(queries.fish).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false })
    );
    config.voiceProviders.fishaudio = {
      configured: true,
      allowed: true,
      available: true,
    };
    config.voiceProviders.elevenlabs = {
      configured: false,
      allowed: true,
      available: false,
    };
    await act(async () => root.render(<Probe />));
    expect(queries.eleven).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ enabled: false })
    );
    expect(queries.fish).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: true })
    );
  } finally {
    await act(async () => root.unmount());
  }
});

it("defers even available catalogues until their task is expanded", async () => {
  const config: any = {
    chatProvider: { name: "deepseek" },
    keys: { openrouter: { isSet: false } },
    voiceProviders: {
      elevenlabs: { available: true },
      fishaudio: { available: true },
    },
  };
  let expanded = { models: false, elevenlabs: false, fishaudio: false };
  function Probe() {
    useProviderCatalogs(config, "", expanded);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Probe />));
    expect(queries.eleven).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ enabled: false })
    );
    expect(queries.fish).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false })
    );
    expanded = { ...expanded, elevenlabs: true };
    await act(async () => root.render(<Probe />));
    expect(queries.eleven).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ enabled: true })
    );
    expect(queries.fish).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false })
    );
  } finally {
    await act(async () => root.unmount());
  }
});
