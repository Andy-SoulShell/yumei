// @vitest-environment jsdom
/** 首页模块、角色预览、轮播暂停与注册入口的交互回归。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import Landing from "./Landing";

const mock = vi.hoisted(() => ({
  query: "",
  navigate: vi.fn(),
  user: null as { name: string } | null,
}));
vi.mock("wouter", async importOriginal => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["/", mock.navigate],
  useSearch: () => mock.query,
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mock.user, loading: false }),
}));
vi.mock("@/hooks/useCompanionChat", () => ({
  useCompanionChat: () => ({
    pending: null,
    findPreset: () => undefined,
    open: vi.fn(),
  }),
}));
let root: Root;
let container: HTMLDivElement;
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.user = null;
  mock.query = "";
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
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mock.navigate.mockImplementation((url: string) => {
    mock.query = url.split("?")[1] ?? "";
    root.render(<Landing />);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public landing page", () => {
  it("shows curated companions, twenty catalog characters and an explore link without search", async () => {
    await settle(() => root.render(<Landing />));
    expect(container.querySelectorAll(".featured-character")).toHaveLength(10);
    expect(container.querySelectorAll(".character-card")).toHaveLength(20);
    expect(
      container.querySelector('input[type="search"], .explore-filter-bar')
    ).toBeNull();
    expect(
      container.querySelector(".catalogue-more a")?.getAttribute("href")
    ).toBe("/explore");
    expect(container.querySelectorAll(".faq-question")).toHaveLength(5);
    expect(
      container.querySelector(".landing-signup a")?.getAttribute("href")
    ).toBe("/register?next=%2Fexplore");
  });
  it("opens a character on the homepage and returns focus after closing", async () => {
    await settle(() => root.render(<Landing />));
    const card = container.querySelector<HTMLButtonElement>(".character-card")!;
    card.focus();
    await settle(() => card.click());
    expect(mock.navigate).toHaveBeenCalledWith("/?character=xiaotao", {
      replace: true,
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "小桃"
    );
    await settle(() =>
      document
        .querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!
        .click()
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(card);
  });
  it("opens one FAQ at a time and changes the registration prompt for members", async () => {
    await settle(() => root.render(<Landing />));
    const questions =
      container.querySelectorAll<HTMLButtonElement>(".faq-question");
    await settle(() => questions[0].click());
    expect(questions[0].getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".faq-answer")?.textContent).toContain(
      "AI 角色陪伴应用"
    );
    await settle(() => questions[1].click());
    expect(questions[0].getAttribute("aria-expanded")).toBe("false");
    expect(questions[1].getAttribute("aria-expanded")).toBe("true");
    mock.user = { name: "Andy" };
    await settle(() => root.render(<Landing />));
    expect(
      container.querySelector(".landing-signup a")?.getAttribute("href")
    ).toBe("/explore");
    expect(container.querySelector(".landing-signup")?.textContent).toContain(
      "你的故事，还在继续"
    );
  });
  it("changes banners manually and keeps automatic rotation paused on request", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => root.render(<Landing />));
    expect(container.querySelector(".hero-primary")?.getAttribute("href")).toBe(
      "/explore"
    );
    await act(async () => {
      vi.advanceTimersByTime(6500);
    });
    expect(container.querySelector(".hero-primary")?.getAttribute("href")).toBe(
      "/setup"
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="暂停轮播"]')!
        .click()
    );
    await act(async () => {
      vi.advanceTimersByTime(13000);
    });
    expect(container.querySelector(".hero-primary")?.getAttribute("href")).toBe(
      "/setup"
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="下一张"]')!
        .click()
    );
    expect(container.querySelector(".hero-primary")?.getAttribute("href")).toBe(
      "/generate"
    );
    expect(
      container
        .querySelector('.carousel-dots [aria-pressed="true"]')
        ?.getAttribute("aria-label")
    ).toBe("切换到第 3 张");
  });
});
