// @vitest-environment jsdom
/** 分组导航、偏好选择及登录前后的账号操作，折叠状态跨页面和刷新保留。 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { type InterfacePreferences } from "@shared/preferences";
import { LOCALES, type Locale } from "@shared/locales";
import { AppShell } from "./AppShell";
import { AppearanceSettings } from "./AppearanceSettings";
import { localizeProductConfig } from "@shared/productConfig";
import { productFixture } from "../../../server/testProductConfig";

import {
  DEFAULT_PREFERENCES,
  THEME_IDS,
} from "../../../server/testProductConfig";
const mock = vi.hoisted(() => ({
  location: "/",
  locale: "zh-CN" as Locale,
  navigate: vi.fn(),
  user: null as {
    name: string | null;
    email: string;
    image: string | null;
  } | null,
  loading: false,
  logout: vi.fn(),
  preferences: {} as InterfacePreferences,
  update: vi.fn(),
  experimentalGlass: false,
  setExperimentalGlass: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("wouter", async importOriginal => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => [mock.location, mock.navigate],
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mock.user,
    loading: mock.loading,
    logout: mock.logout,
  }),
}));
vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    themes: localizeProductConfig(productFixture, mock.locale).themes.items,
    preferences: mock.preferences,
    update: mock.update,
    experimentalGlass: mock.experimentalGlass,
    setExperimentalGlass: mock.setExperimentalGlass,
  }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT(mock.locale) as Translator }),
}));
vi.mock("./NotificationBell", () => ({
  NotificationBell: () => <button aria-label="通知" />,
}));
vi.mock("./AgeGate", () => ({ AgeGate: () => null }));
vi.mock("sonner", () => ({ toast: { error: mock.toastError } }));
let root: Root;
let container: HTMLDivElement;
const render = async (children: ReactNode = <div>Page</div>) => {
  await act(async () => root.render(<AppShell>{children}</AppShell>));
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.clearAllMocks();
  mock.location = "/";
  mock.locale = "zh-CN";
  mock.user = null;
  mock.loading = false;
  mock.preferences = { ...DEFAULT_PREFERENCES };
  mock.experimentalGlass = false;
  mock.logout.mockResolvedValue(undefined);
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

/** 等待 Radix 浮层完成焦点移动，无需启动应用服务。 */
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe("grouped navigation and preferences", () => {
  it("groups create/chat and explore/generate/characters, with preferences together", async () => {
    await render();
    const groups = Array.from(
      container.querySelectorAll(".app-sidebar .sidebar-nav-group")
    );
    expect(
      groups.map(group =>
        Array.from(group.querySelectorAll("a")).map(link =>
          link.getAttribute("href")
        )
      )
    ).toEqual([
      ["/setup", "/chats"],
      ["/explore", "/generate", "/characters"],
    ]);
    expect(
      Array.from(
        container.querySelectorAll(
          '.app-sidebar .sidebar-preferences [role="combobox"]'
        )
      ).map(control => control.getAttribute("aria-label"))
    ).toEqual(["界面语言", "显示模式", "主题"]);
  });
  it("returns home through the logo and activates explore only on its own route", async () => {
    await render();
    expect(container.querySelector(".app-brand")?.getAttribute("href")).toBe(
      "/"
    );
    expect(container.querySelector(".app-sidebar a[href='/']")).toBeNull();
    expect(
      container.querySelector(".app-sidebar a[aria-current='page']")
    ).toBeNull();
    mock.location = "/explore";
    await render();
    expect(
      container
        .querySelector(".app-sidebar a[aria-current='page']")
        ?.getAttribute("href")
    ).toBe("/explore");
  });

  it.each([
    ["界面语言", "English", { language: "en" }],
    ["显示模式", "深色", { colorMode: "dark" }],
    ["主题", "午夜紫", { theme: "midnight" }],
  ])(
    "changes %s through the shared account preferences",
    async (label, option, patch) => {
      await render();
      const trigger = container.querySelector(
        `[role="combobox"][aria-label="${label}"]`
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
      const target = Array.from(
        document.querySelectorAll('[role="option"]')
      ).find(item => item.textContent?.startsWith(option))!;
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
      expect(mock.update).toHaveBeenCalledWith(patch);
      expect(document.querySelector('[role="listbox"]')).toBeNull();
    }
  );

  it.each(LOCALES)(
    "shows the same theme names, descriptions and swatches in both pickers in %s",
    async locale => {
      mock.locale = locale;
      mock.preferences.theme = "neon-mint";
      await render(<AppearanceSettings />);
      const t = i18n.getFixedT(locale) as Translator;
      const trigger = container.querySelector(
        `[role="combobox"][aria-label="${t("appearance:theme")}"]`
      )!;
      expect(
        trigger.querySelectorAll(".theme-option-colors > span")
      ).toHaveLength(3);
      expect(trigger.querySelector(".theme-option-name")?.textContent).toBe(
        localizeProductConfig(productFixture, mock.locale).themes.items.find(
          item => item.id === "neon-mint"
        )!.name
      );
      const cards = Array.from(
        container.querySelectorAll('[role="radio"] .theme-option')
      );
      expect(cards).toHaveLength(THEME_IDS.length);
      await settle(() =>
        trigger.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true,
            cancelable: true,
          })
        )
      );
      const options = Array.from(
        document.querySelectorAll('[role="option"] .theme-option')
      );
      expect(options).toHaveLength(THEME_IDS.length);
      THEME_IDS.forEach((id, index) => {
        for (const item of [cards[index], options[index]]) {
          expect(item.querySelector(".theme-option-name")?.textContent).toBe(
            localizeProductConfig(
              productFixture,
              mock.locale
            ).themes.items.find(item => item.id === id)!.name
          );
          expect(
            item.querySelector(".theme-option-description")?.textContent
          ).toBe(
            localizeProductConfig(
              productFixture,
              mock.locale
            ).themes.items.find(item => item.id === id)!.description
          );
          expect(
            item.querySelectorAll(".theme-option-colors > span")
          ).toHaveLength(3);
        }
        const colors = (item: Element) =>
          Array.from(
            item.querySelectorAll<HTMLElement>(".theme-option-colors > span")
          ).map(swatch => swatch.style.backgroundColor);
        expect(colors(options[index])).toEqual(colors(cards[index]));
      });
    }
  );

  it("keeps preferences available in the mobile menu and closes it when navigating", async () => {
    await render();
    await settle(() =>
      container.querySelector<HTMLButtonElement>(".mobile-menu-toggle")!.click()
    );
    const menu = document.querySelector('[role="dialog"].mobile-sidebar')!;
    expect(menu.querySelectorAll('[role="combobox"]')).toHaveLength(3);
    const link = menu.querySelector<HTMLAnchorElement>('a[href="/setup"]')!;
    await settle(() => link.click());
    expect(document.querySelector(".mobile-sidebar")).toBeNull();
  });
});

describe("header account actions", () => {
  it("only shows sign-in on the right for visitors", async () => {
    await render();
    const actions = container.querySelector(".app-header-actions")!;
    expect(actions.querySelectorAll("a")).toHaveLength(1);
    expect(actions.querySelector("a")?.getAttribute("href")).toBe(
      "/login?next=%2F"
    );
    expect(actions.textContent).toBe("登录");
    expect(actions.querySelector("button, [role=combobox]")).toBeNull();
  });

  it("shows notifications, avatar and username with the email available on hover", async () => {
    mock.user = { name: "Andy Hoh", email: "andy@example.com", image: null };
    await render();
    const actions = container.querySelector(".app-header-actions")!;
    expect(actions.querySelector('[aria-label="通知"]')).not.toBeNull();
    expect(actions.querySelector(".account-avatar")?.textContent).toBe("A");
    expect(actions.querySelector(".account-email")?.textContent).toBe(
      mock.user.name
    );
    expect(actions.querySelector(".account-email")?.getAttribute("title")).toBe(
      mock.user.email
    );
    expect(
      actions.querySelector('.header-signin, [role="combobox"]')
    ).toBeNull();
    await act(async () =>
      actions
        .querySelector<HTMLButtonElement>('[aria-label="退出登录"]')!
        .click()
    );
    expect(mock.logout).toHaveBeenCalledOnce();
    expect(mock.navigate).toHaveBeenCalledWith("/");
  });

  it("keeps the current page and reports a failed sign-out", async () => {
    mock.user = { name: null, email: "andy@example.com", image: null };
    mock.logout.mockRejectedValueOnce(new Error("offline"));
    await render();
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".account-signout")!.click()
    );
    expect(mock.navigate).not.toHaveBeenCalled();
    expect(mock.toastError).toHaveBeenCalledWith("网络错误，请重试。");
  });

  it("opens email and sign-out from the mobile avatar without signing out on open", async () => {
    mock.user = {
      name: "Andy",
      email: "a.very.long.email.address@example.com",
      image: null,
    };
    await render();
    const trigger = container.querySelector<HTMLButtonElement>(
      ".mobile-account-trigger"
    )!;
    expect(trigger.textContent).toBe("A");
    await settle(() =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      )
    );
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu.textContent).toContain(mock.user.email);
    expect(menu.textContent).toContain(mock.user.name);
    expect(mock.logout).not.toHaveBeenCalled();
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    expect(items.some(item => item.textContent === "个人资料")).toBe(true);
    const signOut = items.find(item => item.textContent === "退出登录")!;
    expect(signOut.textContent).toBe("退出登录");
    await settle(() => signOut.click());
    expect(mock.logout).toHaveBeenCalledOnce();
    expect(mock.navigate).toHaveBeenCalledWith("/");
  });

  it("updates the account display when the shared user changes", async () => {
    mock.user = { name: "Before", email: "andy@example.com", image: null };
    await render();
    mock.user = { ...mock.user, name: "小雨" };
    await render();
    expect(container.querySelector(".account-email")?.textContent).toBe("小雨");
    expect(container.querySelector(".account-avatar")?.textContent).toBe("小");
  });
});

describe("desktop navigation modes", () => {
  it("offers the same device experiment in the sidebar and settings, with a compact collapsed control", async () => {
    await render();
    const toggle = container.querySelector<HTMLButtonElement>(
      '.app-sidebar [role="switch"]'
    )!;
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle.click());
    expect(mock.setExperimentalGlass).toHaveBeenCalledWith(true);
    expect(mock.update).not.toHaveBeenCalled();
    mock.experimentalGlass = true;
    await render(<AppearanceSettings />);
    const switches = container.querySelectorAll('[role="switch"]');
    expect(switches).toHaveLength(2);
    for (const control of Array.from(switches))
      expect(control.getAttribute("aria-checked")).toBe("true");
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".sidebar-toggle")!.click()
    );
    const collapsed = container.querySelector<HTMLButtonElement>(
      '.app-sidebar button[aria-label="通透玻璃"]'
    )!;
    expect(collapsed.getAttribute("aria-pressed")).toBe("true");
    await act(async () => collapsed.click());
    expect(mock.setExperimentalGlass).toHaveBeenLastCalledWith(false);
  });
  it("starts expanded and only changes when its toggle is activated", async () => {
    await render();
    const toggle =
      container.querySelector<HTMLButtonElement>(".sidebar-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("yumei:sidebar-collapsed")).toBe("true");
    expect(
      container
        .querySelector('.app-sidebar a[href="/chats"]')
        ?.getAttribute("title")
    ).toBe("聊天");
    await act(async () => {
      container
        .querySelector(".app-sidebar")!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    mock.location = "/chats";
    await render();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      container
        .querySelector('.app-sidebar a[href="/chats"]')
        ?.getAttribute("aria-current")
    ).toBe("page");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(localStorage.getItem("yumei:sidebar-collapsed")).toBe("false");
  });
  it("restores a collapsed sidebar after a full remount", async () => {
    localStorage.setItem("yumei:sidebar-collapsed", "true");
    await render();
    expect(
      container.querySelector(".sidebar-toggle")?.getAttribute("aria-label")
    ).toBe("展开导航");
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(
      container.querySelector(".app-sidebar")?.getAttribute("data-state")
    ).toBe("collapsed");
    expect(
      container.querySelectorAll(".app-bottom-nav .app-nav-label")
    ).toHaveLength(5);
  });
  it("still toggles when the browser blocks preference storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await render();
    const toggle =
      container.querySelector<HTMLButtonElement>(".sidebar-toggle")!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
