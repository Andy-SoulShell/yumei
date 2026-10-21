// @vitest-environment jsdom
/** 显式授权、时间/频率校验和 revision 冲突均通过真实表单交互验证。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { LOCALES, type Locale } from "@shared/locales";

import { ProactivePreferences } from "./ProactivePreferences";

import {
  productFixture,
  DEFAULT_PROACTIVE_PREFERENCES,
} from "../../../../server/testProductConfig";
const mock = vi.hoisted(() => ({
  record: null as any,
  pending: false,
  loading: false,
  locale: "zh-CN" as Locale,
  options: {} as any,
  mutate: vi.fn(),
  refetch: vi.fn(),
  setData: vi.fn(),
  invalidateMemory: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT(mock.locale) as Translator,
    locale: mock.locale,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: mock.success } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    productConfig: {
      get: { useQuery: () => ({ data: productFixture, refetch: vi.fn() }) },
    },
    notification: {
      preferences: {
        useQuery: () => ({
          data: mock.record,
          isLoading: mock.loading,
          refetch: mock.refetch,
        }),
      },
      updatePreferences: {
        useMutation: (options: any) => {
          mock.options = options;
          return { mutate: mock.mutate, isPending: mock.pending };
        },
      },
    },
    useUtils: () => ({
      notification: { preferences: { setData: mock.setData } },
      memory: { state: { invalidate: mock.invalidateMemory } },
    }),
  },
}));
let root: Root;
let container: HTMLDivElement;
const t = () => i18n.getFixedT(mock.locale) as Translator;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.record = {
    ...DEFAULT_PROACTIVE_PREFERENCES,
    timeZone: "Asia/Shanghai",
    revision: 4,
    userId: "account-a",
  };
  mock.pending = false;
  mock.loading = false;
  mock.locale = "zh-CN";
  mock.refetch.mockImplementation(async () => ({ data: mock.record }));
  mock.setData.mockImplementation((_key, data) => {
    mock.record = data;
  });
  mock.invalidateMemory.mockResolvedValue(undefined);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}
async function render() {
  await settle(() => root.render(<ProactivePreferences />));
}
function field(id: string) {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}
function button(label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    item => item.textContent === label
  )!;
}
async function fill(id: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(field(id), value);
    field(id).dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function enable() {
  await settle(() => field("proactive-enabled").click());
}
async function key(element: Element, key: string) {
  await settle(() =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    )
  );
}

it("defaults to no authorization, event mode, quiet overnight hours and private previews", async () => {
  await render();
  expect(field("proactive-enabled").getAttribute("aria-checked")).toBe("false");
  expect(field("proactive-preview").getAttribute("aria-checked")).toBe("true");
  expect(field("proactive-quiet-start").value).toBe("22:00");
  expect(field("proactive-quiet-end").value).toBe("08:00");
  expect(field("proactive-frequency").value).toBe("1");
  expect(field("proactive-frequency").matches(":disabled")).toBe(true);
  expect(field("proactive-mode").disabled).toBe(true);
  expect(field("proactive-timezone").disabled).toBe(false);
  expect(mock.mutate).not.toHaveBeenCalled();
});
it.each(LOCALES)(
  "provides complete labels and independent consent explanation in %s",
  async locale => {
    mock.locale = locale;
    await render();
    expect(container.textContent).toContain(
      t()("settings:proactiveConsentHelp")
    );
    expect(container.textContent).toContain(
      t()("settings:proactivePrivatePreviewHelp")
    );
    expect(container.textContent).not.toMatch(/settings:proactive/);
    expect(button(t()("settings:proactiveSave")).disabled).toBe(true);
  }
);
it("enables only after an explicit save request with the original revision", async () => {
  await render();
  await enable();
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(field("proactive-frequency").matches(":disabled")).toBe(false);
  await submit();
  expect(mock.mutate).toHaveBeenCalledWith({
    expectedRevision: 4,
    preferences: {
      ...DEFAULT_PROACTIVE_PREFERENCES,
      timeZone: "Asia/Shanghai",
      proactiveEnabled: true,
    },
  });
  expect(mock.success).not.toHaveBeenCalled();
});
it("changes event-only mode to occasional daily contact with a keyboard", async () => {
  await render();
  await enable();
  await key(field("proactive-mode"), "ArrowDown");
  const option = Array.from(document.querySelectorAll('[role="option"]')).find(
    item => item.textContent === t()("settings:proactiveDaily")
  )!;
  await key(option, "Enter");
  expect(container.textContent).toContain(t()("settings:proactiveDailyHelp"));
  await submit();
  expect(mock.mutate.mock.calls[0][0].preferences.proactiveMode).toBe("daily");
});
it("saves an IANA timezone without requiring proactive contact to be enabled", async () => {
  await render();
  await fill("proactive-timezone", " Europe/London ");
  await submit();
  expect(mock.mutate.mock.calls[0][0].preferences).toMatchObject({
    timeZone: "Europe/London",
    proactiveEnabled: false,
  });
});
it.each(["Invalid/Zone", "+08:00", ""])(
  "rejects invalid IANA timezone %j without a request",
  async value => {
    await render();
    await fill("proactive-timezone", value);
    await submit();
    expect(mock.mutate).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      t()("settings:proactiveInvalidTimeZone")
    );
  }
);
it.each(["0", "15", "1.5", ""])("rejects invalid frequency %j", async value => {
  await render();
  await enable();
  await fill("proactive-frequency", value);
  await submit();
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    t()(
      "settings:proactiveInvalidFrequency",
      productFixture.proactive.frequencyDays
    )
  );
});
it("converts quiet hours to local minute values and supports equal times to disable them", async () => {
  await render();
  await enable();
  await fill("proactive-quiet-start", "09:15");
  await fill("proactive-quiet-end", "18:45");
  await fill("proactive-frequency", "3");
  await submit();
  expect(mock.mutate.mock.calls[0][0].preferences).toMatchObject({
    quietStart: 555,
    quietEnd: 1125,
    frequencyDays: 3,
  });
  await act(async () =>
    mock.options.onSuccess({
      ...mock.record,
      ...mock.mutate.mock.calls[0][0].preferences,
      revision: 5,
    })
  );
  await fill("proactive-quiet-end", "09:15");
  expect(container.textContent).toContain(t()("settings:proactiveQuietOff"));
  await submit();
  expect(mock.mutate.mock.calls.at(-1)![0].preferences.quietEnd).toBe(555);
});
it("rejects missing quiet hours instead of submitting an invalid time", async () => {
  await render();
  await enable();
  await fill("proactive-quiet-start", "");
  await submit();
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    t()("settings:proactiveInvalidQuiet")
  );
});
it("requires an explicit choice to reveal device preview details", async () => {
  await render();
  await settle(() => field("proactive-preview").click());
  await submit();
  expect(mock.mutate.mock.calls[0][0].preferences.hidePrivatePreview).toBe(
    false
  );
  expect(mock.mutate.mock.calls[0][0].preferences.proactiveEnabled).toBe(false);
});
it("preserves all draft changes when the save fails", async () => {
  await render();
  await enable();
  await fill("proactive-timezone", "Europe/London");
  await fill("proactive-frequency", "7");
  await submit();
  await act(async () =>
    mock.options.onError({ data: { code: "INTERNAL_SERVER_ERROR" } })
  );
  expect(field("proactive-timezone").value).toBe("Europe/London");
  expect(field("proactive-frequency").value).toBe("7");
  expect(field("proactive-enabled").getAttribute("aria-checked")).toBe("true");
  expect(mock.success).not.toHaveBeenCalled();
  expect(container.textContent).toContain(t()("settings:proactiveSaveFailed"));
});
it("keeps the draft and its original revision when background data changes", async () => {
  await render();
  await enable();
  await fill("proactive-frequency", "5");
  mock.record = {
    ...mock.record,
    revision: 5,
    frequencyDays: 10,
    timeZone: "UTC",
  };
  await render();
  await submit();
  expect(field("proactive-frequency").value).toBe("5");
  expect(mock.mutate.mock.calls[0][0].expectedRevision).toBe(4);
});
it("updates the cache and clears dirty state only after success", async () => {
  await render();
  await enable();
  await submit();
  const response = { ...mock.record, proactiveEnabled: true, revision: 5 };
  await act(async () => mock.options.onSuccess(response));
  expect(mock.setData).toHaveBeenCalledWith(undefined, response);
  expect(mock.invalidateMemory).toHaveBeenCalledOnce();
  expect(button(t()("settings:proactiveSave")).disabled).toBe(true);
  expect(mock.success).toHaveBeenCalledWith(t()("settings:proactiveSaved"));
});
it("blocks stale overwrite after a conflict and loads saved values only by explicit choice", async () => {
  await render();
  await enable();
  await fill("proactive-frequency", "5");
  await submit();
  await act(async () => mock.options.onError({ data: { code: "CONFLICT" } }));
  expect(field("proactive-frequency").value).toBe("5");
  expect(mock.refetch).not.toHaveBeenCalled();
  expect(button(t()("settings:proactiveSave")).disabled).toBe(true);
  expect(mock.success).not.toHaveBeenCalled();
  mock.record = {
    ...mock.record,
    revision: 6,
    frequencyDays: 9,
    proactiveEnabled: true,
  };
  await settle(() => button(t()("settings:proactiveReloadSaved")).click());
  expect(field("proactive-frequency").value).toBe("9");
  expect(container.textContent).not.toContain(
    t()("settings:proactiveConflict")
  );
  await fill("proactive-frequency", "4");
  await submit();
  expect(mock.mutate.mock.calls.at(-1)![0].expectedRevision).toBe(6);
});
it("retains the draft when refreshing a conflicting version fails", async () => {
  await render();
  await enable();
  await fill("proactive-frequency", "5");
  await submit();
  await act(async () => mock.options.onError({ data: { code: "CONFLICT" } }));
  mock.refetch.mockResolvedValue({ error: new Error("offline") });
  await settle(() => button(t()("settings:proactiveReloadSaved")).click());
  expect(field("proactive-frequency").value).toBe("5");
  expect(container.textContent).toContain(t()("settings:proactiveConflict"));
});
it("disables editing and duplicate submission while saving", async () => {
  await render();
  await enable();
  mock.pending = true;
  await render();
  expect(field("proactive-enabled").disabled).toBe(true);
  expect(field("proactive-timezone").disabled).toBe(true);
  expect(field("proactive-preview").disabled).toBe(true);
  await submit();
  expect(mock.mutate).not.toHaveBeenCalled();
});
it("offers a query retry when preferences cannot be loaded", async () => {
  mock.record = null;
  await render();
  expect(container.querySelector("form")).toBeNull();
  await settle(() => button(t()("explore:retry")).click());
  expect(mock.refetch).toHaveBeenCalledOnce();
});

it("coalesces rapid duplicate save events until the request settles", async () => {
  await render();
  await enable();
  await act(async () => {
    for (let index = 0; index < 2; index++)
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
  });
  expect(mock.mutate).toHaveBeenCalledOnce();
});
it("does not repopulate preferences or show a late success after leaving settings", async () => {
  await render();
  await enable();
  await submit();
  const complete = mock.options.onSuccess;
  await act(async () => root.unmount());
  complete({ ...mock.record, proactiveEnabled: true, revision: 5 });
  expect(mock.setData).not.toHaveBeenCalled();
  expect(mock.success).not.toHaveBeenCalled();
  root = createRoot(container);
});
