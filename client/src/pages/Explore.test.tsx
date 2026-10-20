// @vitest-environment jsdom
/** 探索页搜索、画风筛选、无结果提示和角色详情的交互回归。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import Explore from "./Explore";

const mock = vi.hoisted(() => ({
  query: "",
  navigate: vi.fn(),
  open: vi.fn(),
}));
vi.mock("wouter", async importOriginal => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["/explore", mock.navigate],
  useSearch: () => mock.query,
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/hooks/useCompanionChat", () => ({
  useCompanionChat: () => ({
    pending: null,
    findPreset: () => undefined,
    open: mock.open,
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
  mock.query = "";
  vi.clearAllMocks();
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
  mock.navigate.mockImplementation((url: string) => {
    mock.query = url.split("?")[1] ?? "";
    root.render(<Explore />);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("exploration", () => {
  it("filters the catalog by localized label and offers a useful empty state", async () => {
    await settle(() => root.render(<Explore />));
    expect(container.querySelectorAll(".character-card")).toHaveLength(20);
    expect(
      container.querySelector(".explore-hero, .featured-section")
    ).toBeNull();
    const input = container.querySelector("input")!;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    await settle(() => {
      setValue.call(input, "策展");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".character-card")).toHaveLength(1);
    expect(container.querySelector(".character-card")?.textContent).toContain(
      "凛"
    );
    await settle(() => {
      setValue.call(input, "不存在的角色");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".character-card")).toHaveLength(0);
    expect(container.textContent).toContain("没有匹配的角色");
    const reset = container.querySelector<HTMLButtonElement>(
      ".explore-empty button"
    )!;
    await settle(() => reset.click());
    expect(container.querySelectorAll(".character-card")).toHaveLength(20);
  });
  it("uses one style selection and preserves a selected preset in the URL", async () => {
    await settle(() => root.render(<Explore />));
    const anime = container.querySelector<HTMLButtonElement>(
      '[role="radio"][value="anime"]'
    )!;
    await settle(() => anime.click());
    expect(container.querySelectorAll(".character-card")).toHaveLength(10);
    expect(
      container.querySelectorAll('[role="radio"][aria-checked="true"]')
    ).toHaveLength(1);
    await settle(() =>
      container.querySelector<HTMLButtonElement>(".character-card")!.click()
    );
    expect(mock.navigate).toHaveBeenCalledWith(
      "/explore?style=anime&character=momoka",
      {
        replace: true,
      }
    );
  });
  it("restores URL filters and closes details without losing the search or page", async () => {
    mock.query = "q=策展&style=realistic&page=2";
    await settle(() => root.render(<Explore />));
    expect(container.querySelector("input")?.value).toBe("策展");
    expect(container.querySelectorAll(".character-card")).toHaveLength(1);
    const card = container.querySelector<HTMLButtonElement>(".character-card")!;
    card.focus();
    await settle(() => card.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "凛"
    );
    await settle(() =>
      document
        .querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!
        .click()
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(new URLSearchParams(mock.query).get("q")).toBe("策展");
    expect(new URLSearchParams(mock.query).get("style")).toBe("realistic");
    expect(new URLSearchParams(mock.query).get("page")).toBe("2");
    expect(new URLSearchParams(mock.query).has("character")).toBe(false);
    expect(document.activeElement).toBe(card);
  });
  it("normalizes invalid filter and page values for a usable public directory", async () => {
    mock.query = "style=unknown&page=Infinity";
    await settle(() => root.render(<Explore />));
    expect(container.querySelectorAll(".character-card")).toHaveLength(20);
    expect(
      container
        .querySelector('[role="radio"][value="all"]')
        ?.getAttribute("aria-checked")
    ).toBe("true");
  });
  it("opens the selected character's existing chat flow from the detail dialog", async () => {
    mock.query = "character=rin";
    await settle(() => root.render(<Explore />));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("凛");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
      "/characters/char_mature.jpg"
    );
    await settle(() =>
      dialog.querySelector<HTMLButtonElement>(".detail-start")!.click()
    );
    expect(mock.open).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rin" })
    );
  });
});
