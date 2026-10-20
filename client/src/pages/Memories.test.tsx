// @vitest-environment jsdom
/** 验证记忆开关、时区、更正和遗忘确认真实交互；接口失败不覆盖草稿或冒称成功。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { LOCALES, type Locale } from "@shared/locales";
import Memories from "./Memories";

const mock = vi.hoisted(() => ({
  locale: "zh-CN" as Locale,
  rows: [] as any[],
  state: {} as any,
  pending: {} as Record<string, boolean>,
  options: {} as Record<string, any>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false }),
}));
vi.mock("@/hooks/useCompanionChat", () => ({
  useCompanionChat: () => ({ open: vi.fn(), pending: null }),
}));
vi.mock("@/hooks/usePageBack", () => ({ usePageBack: () => vi.fn() }));
vi.mock("wouter", () => ({
  useParams: () => ({ id: "7" }),
  useLocation: () => ["/memories/7", vi.fn()],
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT(mock.locale) as Translator,
    locale: mock.locale,
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: mock.success, error: mock.error },
}));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => ({
    useMutation: (options: any) => {
      mock.options[name] = options;
      mock.mutations[name] ??= vi.fn();
      return {
        mutate: mock.mutations[name],
        isPending: mock.pending[name] ?? false,
      };
    },
  });
  return {
    trpc: {
      girlfriend: {
        list: {
          useQuery: () => ({
            data: [{ id: 7, name: "小雨", intimacyLevel: 2 }],
            isLoading: false,
            refetch: mock.refresh,
          }),
        },
      },
      memory: {
        list: {
          useQuery: () => ({
            data: mock.rows,
            isLoading: false,
            refetch: mock.refresh,
          }),
        },
        state: {
          useQuery: () => ({
            data: mock.state,
            isLoading: false,
            refetch: mock.refresh,
          }),
        },
        delete: mutation("delete"),
        setPinned: mutation("setPinned"),
        setEnabled: mutation("setEnabled"),
        edit: mutation("edit"),
        clear: mutation("clear"),
        setTimeZone: mutation("setTimeZone"),
      },
      useUtils: () => ({
        memory: {
          list: { invalidate: mock.refresh },
          state: { invalidate: mock.refresh },
        },
      }),
    },
  };
});

let root: Root;
let container: HTMLDivElement;
const t = () => i18n.getFixedT(mock.locale) as Translator;
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}
async function render() {
  await settle(() => root.render(<Memories />));
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.locale = "zh-CN";
  mock.pending = {};
  mock.options = {};
  mock.mutations = {};
  mock.refresh.mockResolvedValue(undefined);
  mock.rows = [
    {
      id: 10,
      girlfriendId: 7,
      category: "event",
      content: "周四有面试",
      pinned: false,
      createdAt: new Date("2026-10-20T01:00:00Z"),
      sourceType: "user_message",
      sourceMessageId: 123,
      sourceCreatedAt: new Date("2026-10-20T01:00:00Z"),
      sourceTimeZone: "Asia/Shanghai",
      eventDay: "2026-10-22",
      eventStatus: "planned",
    },
  ];
  mock.state = {
    enabled: true,
    timeZone: "Asia/Shanghai",
    semantic: {
      supported: true,
      configured: true,
      provider: "openrouter",
      model: "private-model",
    },
    summary: {
      content:
        "用户事实：最近在准备面试。\n用户原话：周四有面试\n角色曾建议：可以先练习自我介绍。",
      facts: ["最近在准备面试。"],
      topics: [
        {
          sourceMessageId: 123,
          speaker: "user",
          quote: "周四有面试",
          open: true,
        },
        {
          sourceMessageId: 124,
          speaker: "assistant",
          quote: "可以先练习自我介绍。",
          open: false,
        },
      ],
    },
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function button(label: string, surface: ParentNode = container) {
  return Array.from(surface.querySelectorAll<HTMLButtonElement>("button")).find(
    element =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label
  )!;
}
async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector
  )!;
  await act(async () => {
    const prototype =
      input instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      value
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(selector: string) {
  await act(async () => {
    container
      .querySelector(selector)!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

it.each(LOCALES)(
  "shows sources, event status, recap and speaker attribution in %s",
  async locale => {
    mock.locale = locale;
    await render();
    const translate = t();
    expect(container.textContent).toContain(
      translate("memories:sourceUserMessage", { id: 123 })
    );
    expect(container.textContent).toContain("2026-10-22");
    expect(container.textContent).toContain(translate("memories:eventPlanned"));
    expect(container.textContent).toContain(
      translate("memories:topicFromCompanion", { id: 124 })
    );
    expect(container.textContent).toContain(translate("memories:topicOpen"));
    expect(container.textContent).toContain(
      translate("memories:forgettingHelp")
    );
    expect(container.textContent).not.toContain("private-model");
    expect(container.textContent).not.toMatch(/memories:/);
  }
);

it.each(["en", "ja", "ko"] as const)(
  "renders structured recap in %s without model-only labels or duplicated topics",
  async locale => {
    mock.locale = locale;
    await render();
    const recap = container.querySelector(
      '[aria-labelledby="memory-summary-title"]'
    )!;
    expect(recap.textContent).toContain(t()("memories:rememberedFacts"));
    expect(recap.textContent).toContain(
      t()("memories:topicFromYou", { id: 123 })
    );
    expect(recap.textContent).toContain(
      t()("memories:topicFromCompanion", { id: 124 })
    );
    expect(recap.textContent).not.toMatch(/用户事实|用户原话|角色曾建议/);
    expect(recap.textContent?.match(/周四有面试/g)).toHaveLength(1);
    expect(recap.textContent?.match(/可以先练习自我介绍。/g)).toHaveLength(1);
    expect(recap.textContent?.match(/最近在准备面试。/g)).toHaveLength(1);
  }
);

it("pauses only after confirmation from the server and leaves saved memories viewable", async () => {
  await render();
  await settle(() =>
    container.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
  );
  expect(mock.mutations.setEnabled).toHaveBeenCalledWith({
    girlfriendId: 7,
    enabled: false,
  });
  expect(mock.success).not.toHaveBeenCalled();
  expect(
    container.querySelector('[role="switch"]')?.getAttribute("aria-checked")
  ).toBe("true");
  mock.state = { ...mock.state, enabled: false, summary: null };
  await act(async () => {
    await mock.options.setEnabled.onSuccess(
      {},
      { girlfriendId: 7, enabled: false }
    );
  });
  await render();
  expect(
    container.querySelector('[role="switch"]')?.getAttribute("aria-checked")
  ).toBe("false");
  expect(container.textContent).toContain(t()("memories:memoryPausedHelp"));
  expect(container.textContent).toContain("周四有面试");
  expect(mock.success).toHaveBeenCalledWith(t()("memories:memoryPaused"));
  mock.rows = [];
  await render();
  expect(container.textContent).toContain(t()("memories:emptyPausedHelp"));
  expect(container.textContent).not.toContain(
    t()("memories:shareYourWorkInterestsAndRecentExperiencesImportant")
  );
});

it("keeps the existing pause state when an update fails", async () => {
  mock.state.enabled = false;
  mock.state.summary = null;
  await render();
  await settle(() =>
    container.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
  );
  await act(async () =>
    mock.options.setEnabled.onError({ message: "Network unavailable" })
  );
  expect(
    container.querySelector('[role="switch"]')?.getAttribute("aria-checked")
  ).toBe("false");
  expect(mock.success).not.toHaveBeenCalled();
  expect(mock.error).toHaveBeenCalledOnce();
  mock.state = { ...mock.state, enabled: true };
  await act(async () => {
    await mock.options.setEnabled.onSuccess(
      {},
      { girlfriendId: 7, enabled: true }
    );
  });
  await render();
  expect(
    container.querySelector('[role="switch"]')?.getAttribute("aria-checked")
  ).toBe("true");
  expect(mock.success).toHaveBeenCalledWith(t()("memories:memoryResumed"));
});

it("validates timezone input and preserves an unsaved timezone while data refreshes", async () => {
  await render();
  await fill("#memory-timezone", "Invalid/Zone");
  await submit("form");
  expect(mock.mutations.setTimeZone).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    t()("memories:timeZoneInvalid")
  );
  expect(document.activeElement?.id).toBe("memory-timezone");
  await fill("#memory-timezone", " Europe/London ");
  mock.state = { ...mock.state, timeZone: "UTC" };
  await render();
  expect(
    container.querySelector<HTMLInputElement>("#memory-timezone")?.value
  ).toBe(" Europe/London ");
  await submit("form");
  expect(mock.mutations.setTimeZone).toHaveBeenCalledWith({
    timeZone: "Europe/London",
  });
  expect(mock.success).not.toHaveBeenCalled();
});

it("rejects an empty correction, retains it on failure and closes it only on success", async () => {
  await render();
  await settle(() => button(t()("memories:editMemory")).click());
  await fill("textarea", "   ");
  await submit("form:has(textarea)");
  expect(mock.mutations.edit).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    t()("memories:editEmptyError")
  );
  await fill("textarea", " 面试已经改到周五 ");
  await submit("form:has(textarea)");
  expect(mock.mutations.edit).toHaveBeenCalledWith({
    id: 10,
    content: "面试已经改到周五",
  });
  await act(async () => mock.options.edit.onError({ message: "offline" }));
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
    " 面试已经改到周五 "
  );
  expect(mock.success).not.toHaveBeenCalled();
  mock.rows = [
    { ...mock.rows[0], content: "面试已经改到周五", sourceType: "user_edit" },
  ];
  await act(async () => {
    await mock.options.edit.onSuccess();
  });
  await render();
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).toContain(t()("memories:sourceEdited"));
  expect(mock.success).toHaveBeenCalledWith(t()("memories:memoryUpdated"));
});

it("explains history retention in delete confirmation and retains the row when deletion fails", async () => {
  await render();
  await settle(() => button(t()("memories:deleteMemory")).click());
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain(
    t()("memories:deleteConfirm", { content: "周四有面试" })
  );
  expect(mock.mutations.delete).not.toHaveBeenCalled();
  await settle(() => button(t()("common:delete"), dialog).click());
  expect(mock.mutations.delete).toHaveBeenCalledWith({ id: 10 });
  await act(async () => mock.options.delete.onError({ message: "offline" }));
  expect(container.textContent).toContain("周四有面试");
  expect(mock.success).not.toHaveBeenCalled();
});

it("requires confirmation before forgetting all memories even when the list is empty", async () => {
  mock.rows = [];
  mock.state.summary = null;
  await render();
  const clear = button(t()("memories:clearAll"));
  expect(clear.disabled).toBe(false);
  await settle(() => clear.click());
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain(
    t()("memories:clearConfirm", { name: "小雨" })
  );
  expect(mock.mutations.clear).not.toHaveBeenCalled();
  await settle(() => button(t()("common:delete"), dialog).click());
  expect(mock.mutations.clear).toHaveBeenCalledWith({ girlfriendId: 7 });
  expect(mock.success).not.toHaveBeenCalled();
  await act(async () => {
    await mock.options.clear.onSuccess();
  });
  expect(mock.success).toHaveBeenCalledWith(t()("memories:memoriesCleared"));
});

it("disables conflicting actions during a pending update", async () => {
  mock.pending.edit = true;
  await render();
  expect(
    container.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled
  ).toBe(true);
  expect(button(t()("memories:clearAll")).disabled).toBe(true);
  expect(button(t()("memories:deleteMemory")).disabled).toBe(true);
  expect(button(t()("memories:editMemory")).disabled).toBe(true);
});

it("keeps saved memories and recap when forgetting everything fails", async () => {
  await render();
  await settle(() => button(t()("memories:clearAll")).click());
  const dialog = document.querySelector('[role="alertdialog"]')!;
  await settle(() => button(t()("common:delete"), dialog).click());
  await act(async () => mock.options.clear.onError({ message: "offline" }));
  expect(container.textContent).toContain("周四有面试");
  expect(container.textContent).toContain("最近在准备面试。");
  expect(mock.success).not.toHaveBeenCalled();
  expect(mock.error).toHaveBeenCalledOnce();
});
