// @vitest-environment jsdom
/** 游客触发登录后可返回公开页面，再次使用手机导航和外观控件。 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { DEFAULT_PREFERENCES } from "@shared/preferences";
import App from "./App";

const mock = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAuthenticated: false,
  }),
}));
vi.mock("@/contexts/PreferencesContext", () => ({
  PreferencesProvider: ({ children }: { children: ReactNode }) => children,
  usePreferences: () => ({
    preferences: DEFAULT_PREFERENCES,
    locale: "zh-CN",
    resolvedMode: "light",
    update: mock.update,
  }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") as Translator }),
  translate: i18n.getFixedT("zh-CN"),
}));
vi.mock("./pages/Landing", () => ({
  default: () => <h1>首页</h1>,
}));
vi.mock("./pages/Explore", () => ({
  default: () => <h1>探索角色</h1>,
}));
vi.mock("@/features/auth/AuthFlow", () => ({
  AuthFlow: () => <h1>登录以继续</h1>,
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/explore?style=anime");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
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
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function settle(action: () => void) {
  await act(async () => {
    action();
    await vi.dynamicImportSettled();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}
async function openMenu() {
  await settle(() =>
    container.querySelector<HTMLButtonElement>(".mobile-menu-toggle")!.click()
  );
  return document.querySelector<HTMLElement>(".mobile-sidebar")!;
}
async function choose(label: string, option: string) {
  const trigger = document.querySelector(
    `.mobile-sidebar [role="combobox"][aria-label="${label}"]`
  )!;
  await settle(() =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      })
    )
  );
  const target = Array.from(document.querySelectorAll('[role="option"]')).find(
    item => item.textContent?.startsWith(option)
  )!;
  expect(target).toBeDefined();
  await settle(() =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    )
  );
}

it.each(["/setup", "/settings"])(
  "returns from the %s sign-in guard without trapping mobile navigation",
  async destination => {
    await settle(() => root.render(<App />));
    const menu = await openMenu();
    await settle(() =>
      menu.querySelector<HTMLAnchorElement>(`a[href="${destination}"]`)!.click()
    );
    expect(window.location.pathname).toBe("/login");
    expect(new URLSearchParams(window.location.search).get("next")).toBe(
      destination
    );
    // 返回时直接回到公开页，不再经过私有页并重新触发登录。
    await settle(() => window.history.back());
    expect(window.location.pathname + window.location.search).toBe(
      "/explore?style=anime"
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");

    await openMenu();
    await choose("主题", "午夜紫");
    await choose("显示模式", "深色");
    await choose("界面语言", "English");
    expect(mock.update.mock.calls).toEqual([
      [{ theme: "midnight" }],
      [{ colorMode: "dark" }],
      [{ language: "en" }],
    ]);
    expect(window.location.pathname).toBe("/explore");
    await settle(() =>
      document
        .querySelector<HTMLButtonElement>(".mobile-sidebar .sheet-close")!
        .click()
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await openMenu();
    expect(document.querySelector(".mobile-sidebar")).not.toBeNull();
    expect(window.location.pathname).toBe("/explore");
  }
);
