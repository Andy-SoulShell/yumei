// @vitest-environment jsdom
/** 验证账号切换、系统偏好、异步保存失败与连续编辑，不调用真实服务。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider, usePreferences } from "./PreferencesContext";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_PREFERENCES } from "@shared/preferences";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  remote: undefined as any,
  save: vi.fn(),
  setData: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: mocks.user }) } },
    preferences: {
      get: {
        useQuery: () => ({
          data: mocks.remote,
          isError: false,
          refetch: mocks.refetch,
        }),
      },
      update: { useMutation: () => ({ mutateAsync: mocks.save }) },
    },
    useUtils: () => ({ preferences: { get: { setData: mocks.setData } } }),
  },
}));

let current: ReturnType<typeof usePreferences>;
function Probe() {
  current = usePreferences();
  const { t } = useI18n();
  return <span>{t("设置")}</span>;
}
let root: Root;
let container: HTMLDivElement;
async function render() {
  await act(async () =>
    root.render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>
    )
  );
}
async function change(patch: Parameters<typeof current.update>[0]) {
  await act(async () => current.update(patch));
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  mocks.user = null;
  mocks.remote = undefined;
  mocks.save.mockReset().mockImplementation(async patch => ({
    userId: mocks.user?.id,
    initialized: true,
    ...DEFAULT_PREFERENCES,
    ...patch,
  }));
  mocks.setData.mockReset();
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    value: ["en-US"],
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("interface preference lifecycle", () => {
  it("uses system defaults, applies a guest choice immediately and restores it", async () => {
    await render();
    expect(current.locale).toBe("en");
    expect(current.resolvedMode).toBe("dark");
    await change({ language: "zh-CN", theme: "sakura", colorMode: "light" });
    expect(container.textContent).toBe("设置");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.documentElement.dataset.theme).toBe("sakura");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(current.preferences).toEqual({
      language: "zh-CN",
      theme: "sakura",
      colorMode: "light",
    });
  });
  it("reads account preferences, retains new edits across a late fetch and serializes writes", async () => {
    mocks.user = { id: "a" };
    await render();
    let finish!: (value: any) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await change({ language: "en" });
    await change({ theme: "midnight" });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    mocks.remote = {
      userId: "a",
      initialized: true,
      language: "zh-CN",
      theme: "sakura",
      colorMode: "dark",
    };
    await render();
    expect(current.preferences).toEqual({
      language: "en",
      theme: "midnight",
      colorMode: "dark",
    });
    await act(async () => finish({ ...mocks.remote, language: "en" }));
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(current.preferences.theme).toBe("midnight");
    expect(current.saving).toBe(false);
  });
  it("keeps failed changes pending even when another field saves, and retries them", async () => {
    mocks.user = { id: "a" };
    mocks.remote = { userId: "a", initialized: true, ...DEFAULT_PREFERENCES };
    await render();
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    await change({ language: "en" });
    expect(current.saveError).toBe(true);
    await change({ theme: "sakura" });
    expect(current.saveError).toBe(true);
    expect(current.preferences.language).toBe("en");
    await act(async () => current.retry());
    expect(mocks.save).toHaveBeenLastCalledWith({ language: "en" });
    expect(current.saveError).toBe(false);
  });
  it("does not apply old account responses or dispatch queued edits under a new account", async () => {
    mocks.user = { id: "a" };
    mocks.remote = { userId: "a", initialized: true, ...DEFAULT_PREFERENCES };
    await render();
    let finish!: (value: any) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await change({ theme: "sakura" });
    await change({ language: "zh-CN" });
    mocks.user = { id: "b" };
    mocks.remote = {
      userId: "b",
      initialized: true,
      language: "en",
      theme: "sapphire",
      colorMode: "light",
    };
    await render();
    await change({ colorMode: "dark" });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    await act(async () =>
      finish({
        userId: "a",
        initialized: true,
        language: "zh-CN",
        theme: "sakura",
        colorMode: "dark",
      })
    );
    expect(mocks.save.mock.calls.map(call => call[0])).toEqual([
      { theme: "sakura" },
      { colorMode: "dark" },
    ]);
    expect(current.preferences.theme).toBe("sapphire");
    expect(current.locale).toBe("en");
  });
  it("inherits the guest choice on first login and synchronizes it to a new account", async () => {
    await render();
    await change({ language: "zh-CN", theme: "pearl", colorMode: "light" });
    mocks.user = { id: "new" };
    mocks.remote = {
      userId: "new",
      initialized: false,
      ...DEFAULT_PREFERENCES,
    };
    await render();
    expect(current.preferences.theme).toBe("pearl");
    expect(mocks.save).toHaveBeenCalledWith({
      language: "zh-CN",
      theme: "pearl",
      colorMode: "light",
    });
  });
});
