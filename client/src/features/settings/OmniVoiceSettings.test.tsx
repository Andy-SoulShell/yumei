// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OmniVoiceSettings } from "./OmniVoiceSettings";

const service = vi.hoisted(() => ({
  data: undefined as any,
  isLoading: false,
  refetch: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      girlfriend: { invalidate: vi.fn() },
      apiConfig: { get: { invalidate: service.invalidate } },
    }),
    tts: {
      omnivoiceStatus: { useQuery: () => service },
      createOmnivoiceVoice: {
        useMutation: () => ({ mutateAsync: service.create, isPending: false }),
      },
      deleteOmnivoiceVoice: {
        useMutation: () => ({ mutateAsync: service.remove, isPending: false }),
      },
    },
  },
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

async function render(dirty = false, voice = "") {
  const props = {
    t: (key: string) => key,
    omnivoiceVoiceId: voice,
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

function inputValue(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector
  )!;
  const prototype =
    input.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function button(key: string) {
  return Array.from(container.querySelectorAll("button")).find(
    b => b.textContent === key
  )!;
}

it("uploads a named reference and transcript, then selects the new voice for saving", async () => {
  service.data = {
    configured: true,
    available: true,
    voices: [{ id: "default", name: "Default" }],
  };
  service.create.mockResolvedValue({
    id: "clone_test",
    name: "My voice",
    durationMs: 4000,
  });
  await render();
  await act(async () => {
    inputValue("#omnivoice-clone-name", "My voice");
    inputValue("#omnivoice-reference-text", "Reference transcript");
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["wave-bytes"], "voice.wav", { type: "audio/wav" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(button("settings:omnivoiceCreateClone").disabled).toBe(false);
  await act(async () => {
    button("settings:omnivoiceCreateClone").click();
    await new Promise(resolve => setTimeout(resolve, 50));
  });
  expect(service.create).toHaveBeenCalledWith({
    name: "My voice",
    text: "Reference transcript",
    audio: btoa("wave-bytes"),
  });
  expect(selectVoice).toHaveBeenCalledWith("clone_test");
  expect(
    container.querySelector<HTMLInputElement>("#omnivoice-clone-name")!.value
  ).toBe("");
});

it("rejects oversized reference files before uploading", async () => {
  service.data = {
    configured: true,
    available: true,
    voices: [{ id: "default", name: "Default" }],
  };
  await render();
  await act(async () => {
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "voice.wav")],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "settings:omnivoiceUploadInvalid"
  );
  expect(button("settings:omnivoiceCreateClone").disabled).toBe(true);
  expect(service.create).not.toHaveBeenCalled();
});

it("deletes only the selected private voice and resets the selection", async () => {
  service.data = {
    configured: true,
    available: true,
    voices: [
      { id: "default", name: "Default" },
      { id: "clone_test", name: "My voice", cloned: true },
    ],
  };
  await render(false, "clone_test");
  await act(async () => button("settings:omnivoiceDeleteClone").click());
  expect(service.remove).toHaveBeenCalledWith({ id: "clone_test" });
  expect(selectVoice).toHaveBeenCalledWith("default");
  expect(service.invalidate).toHaveBeenCalledOnce();
});
