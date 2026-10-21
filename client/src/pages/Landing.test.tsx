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
  roles: [] as { id: number; name: string; referenceImageUrl: string }[],
  rolesLoading: false,
  rolesError: null as Error | null,
  pending: null as number | null,
  open: vi.fn(),
  refetch: vi.fn(),
  recent: vi.fn(),
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
    pending: mock.pending,
    findPreset: () => undefined,
    open: mock.open,
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    girlfriend: {
      recent: {
        useQuery: () => {
          mock.recent();
          return {
            data: mock.rolesError ? undefined : mock.roles,
            isLoading: mock.rolesLoading,
            error: mock.rolesError,
            refetch: mock.refetch,
          };
        },
      },
    },
  },
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
  mock.roles = [];
  mock.rolesLoading = false;
  mock.rolesError = null;
  mock.pending = null;
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
    expect(mock.recent).not.toHaveBeenCalled();
    expect(container.querySelector(".home-companions-add")).toBeNull();
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
  it("shows up to ten owned roles above curated characters in server activity order", async () => {
    mock.user = { name: "Andy" };
    mock.roles = Array.from({ length: 12 }, (_, i) => ({
      id: 12 - i,
      name: `角色${12 - i}`,
      referenceImageUrl: "/reference.jpg",
    }));
    await settle(() => root.render(<Landing />));
    const section = container.querySelector(".home-companions-section")!;
    const roles = section.querySelectorAll<HTMLButtonElement>(
      ".featured-character"
    );
    expect(roles).toHaveLength(10);
    expect(
      Array.from(
        roles,
        role => role.querySelector(".featured-name")?.textContent
      )
    ).toEqual(mock.roles.slice(0, 10).map(role => role.name));
    expect(section.nextElementSibling?.getAttribute("aria-labelledby")).toBe(
      "featured-heading"
    );
    expect(section.querySelector("a")?.getAttribute("href")).toBe(
      "/characters"
    );
    await settle(() => roles[0].click());
    expect(mock.open).toHaveBeenCalledWith(12);
    expect(mock.navigate).not.toHaveBeenCalled();
    mock.pending = 12;
    await settle(() => root.render(<Landing />));
    expect(roles[0].getAttribute("aria-busy")).toBe("true");
    expect(Array.from(roles).every(role => role.disabled)).toBe(true);
    await settle(() => roles[1].click());
    expect(mock.open).toHaveBeenCalledTimes(1);
  });
  it("shows a compact add entry only after an authenticated empty result", async () => {
    mock.user = { name: "Andy" };
    mock.rolesLoading = true;
    await settle(() => root.render(<Landing />));
    expect(container.querySelector(".home-companions-add")).toBeNull();
    mock.rolesLoading = false;
    await settle(() => root.render(<Landing />));
    expect(container.querySelector(".home-companions-section")).toBeNull();
    expect(
      container.querySelector(".home-companions-add")?.textContent
    ).toContain("添加角色");
    expect(
      container.querySelector(".home-companions-add")?.getAttribute("href")
    ).toBe("/explore");
  });
  it("offers retry instead of treating a failed private query as an empty list", async () => {
    mock.user = { name: "Andy" };
    mock.rolesError = new Error("offline");
    await settle(() => root.render(<Landing />));
    expect(container.querySelector(".home-companions-add")).toBeNull();
    const retry = container.querySelector<HTMLButtonElement>(
      ".home-companions-notice button"
    )!;
    await settle(() => retry.click());
    expect(mock.refetch).toHaveBeenCalledOnce();
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
    await vi.waitFor(() => expect(document.activeElement).toBe(card));
  });
  it.each([".character-card", ".featured-character"])(
    "returns focus to an unfocused clicked trigger: %s",
    async selector => {
      await settle(() => root.render(<Landing />));
      const card = container.querySelector<HTMLButtonElement>(selector)!;
      expect(document.activeElement).not.toBe(card);
      await settle(() => card.click());
      await settle(() =>
        document
          .querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!
          .click()
      );
      await vi.waitFor(() => expect(document.activeElement).toBe(card));
    }
  );
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
      "继续你的故事"
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
