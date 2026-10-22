// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OmniVoiceSettings } from "./OmniVoiceSettings";

const service = vi.hoisted(() => ({
  data: undefined as any,
  isLoading: false,
  refetch: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { tts: { omnivoiceStatus: { useQuery: () => service } } },
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const selectVoice = vi.fn();
const preview = vi.fn();
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  service.data = { configured: false, available: false, voices: [] };
  service.isLoading = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(dirty = false) {
  const props = {
    t: (key: string) => key,
    omnivoiceVoiceId: "",
    setOmnivoiceVoiceId: selectVoice,
    handleTestApiVoice: preview,
    ttsGenerate: { isPending: false },
    hasUnsavedVoiceChanges: dirty,
  } as unknown as Parameters<typeof OmniVoiceSettings>[0];
  await act(async () => root.render(<OmniVoiceSettings {...props} />));
}

it("distinguishes an unconfigured deployment from an offline service", async () => {
  await render();
  expect(container.textContent).toContain("settings:omnivoiceNotConfigured");
  expect(container.querySelector("select")).toBeNull();
  service.data = { configured: true, available: false, voices: [] };
  await render();
  expect(container.textContent).toContain("settings:omnivoiceOffline");
  await act(async () => container.querySelector("button")!.click());
  expect(service.refetch).toHaveBeenCalledOnce();
});

it("shows the catalog and requires saved preferences before previewing", async () => {
  service.data = {
    configured: true,
    available: true,
    voices: [
      { id: "default", name: "Default" },
      { id: "custom", name: "Custom" },
    ],
  };
  await render(true);
  const select = container.querySelector("select")!;
  expect(select.options).toHaveLength(2);
  await act(async () => {
    select.value = "custom";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(selectVoice).toHaveBeenCalledWith("custom");
  expect(container.querySelectorAll("button")[1].disabled).toBe(true);
  await render(false);
  await act(async () => container.querySelectorAll("button")[1].click());
  expect(preview).toHaveBeenCalledOnce();
});

it("disables the connection button while checking", async () => {
  service.isLoading = true;
  await render();
  expect(container.textContent).toContain("settings:omnivoiceChecking");
  expect(container.querySelector("button")!.disabled).toBe(true);
});
