// @vitest-environment jsdom
/** PC 导航仅在用户主动操作时展开，折叠状态跨页面和刷新保留。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { AppShell } from "./AppShell";

const mock = vi.hoisted(() => ({ location: "/", navigate: vi.fn() }));
vi.mock("wouter", async importOriginal => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => [mock.location, mock.navigate],
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") as Translator }),
}));
vi.mock("./AppearanceSettings", () => ({ LanguagePicker: () => null }));
vi.mock("./NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("./AgeGate", () => ({ AgeGate: () => null }));
let root: Root;
let container: HTMLDivElement;
const render = async () => {
  await act(async () =>
    root.render(
      <AppShell>
        <div>Page</div>
      </AppShell>
    )
  );
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  mock.location = "/";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("desktop navigation modes", () => {
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
