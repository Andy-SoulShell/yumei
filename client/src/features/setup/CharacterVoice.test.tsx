// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CharacterVoice } from "./CharacterVoice";

const mock = vi.hoisted(() => ({
  data: undefined as any,
  create: vi.fn(),
  bind: vi.fn(),
  busy: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  editId: 1 as number | null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      girlfriend: { invalidate: mock.invalidate },
      tts: {
        omnivoiceStatus: {
          invalidate: mock.invalidate,
          setData: (_: undefined, update: any) => {
            mock.data = update(mock.data);
          },
        },
      },
    }),
    girlfriend: { update: { useMutation: () => ({ mutateAsync: mock.bind }) } },
    tts: {
      omnivoiceStatus: {
        useQuery: () => ({
          data: mock.data,
          isLoading: false,
          refetch: mock.refresh,
        }),
      },
      createOmnivoiceVoice: {
        useMutation: () => ({ mutateAsync: mock.create }),
      },
    },
  },
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let unmounted: boolean;
function Harness() {
  const [selected, select] = useState("clone_a");
  return (
    <CharacterVoice
      t={((key: string) => key) as any}
      omnivoiceVoiceId={selected}
      setOmnivoiceVoiceId={select}
      editId={mock.editId}
      name="我的角色"
      setIsCloningVoice={mock.busy}
    />
  );
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  mock.editId = 1;
  mock.data = {
    available: true,
    configured: true,
    voices: [
      { id: "default", name: "Public", cloned: false },
      { id: "clone_a", name: "Private A", cloned: true },
    ],
  };
  mock.create.mockResolvedValue({
    id: "clone_new",
    name: "我的角色",
    durationMs: 4000,
  });
  mock.bind.mockResolvedValue({ success: true });
  mock.invalidate.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  unmounted = false;
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount());
  container.remove();
});

async function chooseReference() {
  await act(async () => {
    const text = container.querySelector<HTMLTextAreaElement>("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(text, "准确的录音原文");
    text.dispatchEvent(new Event("input", { bubbles: true }));
    const file =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(file, "files", {
      configurable: true,
      value: [new File(["wave-bytes"], "reference.wav", { type: "audio/wav" })],
    });
    file.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function clone() {
  await act(async () => {
    container.querySelector<HTMLButtonElement>("button")!.click();
    await new Promise(resolve => setTimeout(resolve, 40));
  });
}

it("offers private voices and inline upload without a settings navigation step", async () => {
  const input = container.querySelector("select")!;
  expect(Array.from(input.options).map(o => o.value)).toEqual(["", "clone_a"]);
  expect(input.value).toBe("clone_a");
  expect(container.querySelector('input[type="file"]')).not.toBeNull();
  expect(container.textContent).not.toContain("setup:roleVoiceManage");
  await act(async () => {
    input.value = "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(input.value).toBe("");
});

it("clones and immediately binds only the voice field on the existing character", async () => {
  expect(
    container.querySelector<HTMLInputElement>("#character-clone-name")!.value
  ).toBe("我的角色");
  await chooseReference();
  await clone();
  expect(mock.create).toHaveBeenCalledWith({
    name: "我的角色",
    text: "准确的录音原文",
    audio: btoa("wave-bytes"),
  });
  expect(mock.bind).toHaveBeenCalledWith({
    id: 1,
    omnivoiceVoiceId: "clone_new",
  });
  expect(container.querySelector("select")!.value).toBe("clone_new");
  expect(mock.busy.mock.calls).toEqual([[true], [false]]);
  expect(container.querySelector("textarea")!.value).toBe("");
});

it("selects the cloned voice as a draft when creating a new character", async () => {
  mock.editId = null;
  await act(async () => root.render(<Harness />));
  await chooseReference();
  await clone();
  expect(mock.create).toHaveBeenCalledOnce();
  expect(mock.bind).not.toHaveBeenCalled();
  expect(container.querySelector("select")!.value).toBe("clone_new");
});

it("retains the reference and retries a failed binding without creating duplicate voices", async () => {
  mock.bind.mockRejectedValueOnce(new Error("binding failed"));
  await chooseReference();
  await clone();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "binding failed"
  );
  expect(container.querySelector("select")!.value).toBe("clone_a");
  expect(container.querySelector("textarea")!.value).toBe("准确的录音原文");
  await clone();
  expect(mock.create).toHaveBeenCalledOnce();
  expect(mock.bind).toHaveBeenCalledTimes(2);
  expect(container.querySelector("select")!.value).toBe("clone_new");
});

it("keeps the upload disabled while the local service is unavailable", async () => {
  mock.data = { ...mock.data, available: false };
  await act(async () => root.render(<Harness />));
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "settings:omnivoiceOffline"
  );
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(mock.create).not.toHaveBeenCalled();
});

it("ignores a late creation result after leaving the character page", async () => {
  let complete: (voice: any) => void = () => undefined;
  mock.create.mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  await chooseReference();
  await clone();
  expect(mock.create).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  unmounted = true;
  await act(async () =>
    complete({ id: "clone_late", name: "Late", durationMs: 4000 })
  );
  expect(mock.bind).not.toHaveBeenCalled();
  expect(mock.busy).toHaveBeenLastCalledWith(false);
});
