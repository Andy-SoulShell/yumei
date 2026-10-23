// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import type { useCompanionChat } from "@/hooks/useCompanionChat";
import { discoveryFixture } from "./testFixtures";
import { CharacterChatActions } from "./CharacterChatActions";

const mock = vi.hoisted(() => ({
  authenticated: true,
  billing: undefined as
    { mode?: string; limits: { maxGirlfriends: number | null } } | undefined,
  billingError: null as Error | null,
  billingQuery: vi.fn(),
  billingRefetch: vi.fn(),
  listRefetch: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: mock.authenticated, loading: false }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") as Translator }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    billing: {
      getInfo: {
        useQuery: () => {
          mock.billingQuery();
          return {
            data: mock.billing,
            error: mock.billingError,
            refetch: mock.billingRefetch,
          };
        },
      },
    },
  },
}));

let root: Root;
let container: HTMLDivElement;
let chat: ReturnType<typeof useCompanionChat>;
const selected = discoveryFixture.characters[0];
const render = () =>
  act(async () => {
    root.render(<CharacterChatActions selected={selected} chat={chat} />);
  });

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.authenticated = true;
  mock.billing = { limits: { maxGirlfriends: 3 } };
  mock.billingError = null;
  chat = {
    companions: [{ id: 1 }],
    pending: null,
    findPreset: () => undefined,
    open: mock.open,
    refetch: mock.listRefetch,
    error: null,
    isLoading: false,
  } as unknown as ReturnType<typeof useCompanionChat>;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("character capacity before adding", () => {
  it("matches unlimited server behavior when billing is disabled", async () => {
    mock.billing = { mode: "none", limits: { maxGirlfriends: 0 } };
    await render();
    expect(container.textContent).toContain("角色名额不限");
    expect(
      container.querySelector<HTMLButtonElement>(".detail-start")?.disabled
    ).toBe(false);
  });
  it("uses the actual remaining slots and opens the selected character", async () => {
    await render();
    expect(container.textContent).toContain("还可添加 2 位角色");
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".detail-start")!.click()
    );
    expect(mock.open).toHaveBeenCalledWith(selected);
  });
  it("offers role management at capacity without submitting another creation", async () => {
    mock.billing = { limits: { maxGirlfriends: 1 } };
    await render();
    expect(container.querySelector(".detail-start")?.getAttribute("href")).toBe(
      "/characters"
    );
    expect(container.textContent).toContain("名额已用完");
    expect(mock.open).not.toHaveBeenCalled();
    expect(container.querySelector('a[href^="/setup"]')).toBeNull();
  });
  it("keeps an existing character usable without a billing dependency", async () => {
    chat.findPreset = () =>
      ({ id: 1 }) as NonNullable<ReturnType<typeof chat.findPreset>>;
    mock.billing = undefined;
    mock.billingError = new Error("offline");
    await render();
    expect(mock.billingQuery).not.toHaveBeenCalled();
    const button = container.querySelector<HTMLButtonElement>(".detail-start")!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("继续聊天");
  });
  it("keeps guest login available without querying protected billing data", async () => {
    mock.authenticated = false;
    await render();
    expect(mock.billingQuery).not.toHaveBeenCalled();
    expect(container.textContent).toContain("你选的角色会保留");
    expect(
      container.querySelector<HTMLButtonElement>(".detail-start")?.disabled
    ).toBe(false);
  });
  it("waits for both entitlement and role data instead of assuming empty ownership", async () => {
    chat.companions = undefined;
    await render();
    expect(container.textContent).toContain("正在确认");
    expect(
      container.querySelector<HTMLButtonElement>(".detail-start")?.disabled
    ).toBe(true);
    chat.companions = [];
    mock.billing = undefined;
    await render();
    expect(
      container.querySelector<HTMLButtonElement>(".detail-start")?.disabled
    ).toBe(true);
  });
  it("shows a recoverable error rather than a fabricated remaining count", async () => {
    mock.billing = undefined;
    mock.billingError = new Error("offline");
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "无法确认"
    );
    expect(container.querySelector(".detail-start")).toBeNull();
    await act(async () => container.querySelector("button")!.click());
    expect(mock.billingRefetch).toHaveBeenCalledOnce();
    expect(mock.listRefetch).toHaveBeenCalledOnce();
  });
  it("explains unlimited capacity and blocks duplicate actions while opening", async () => {
    mock.billing = { limits: { maxGirlfriends: null } };
    chat.pending = selected.id;
    await render();
    expect(container.textContent).toContain("角色名额不限");
    expect(
      Array.from(container.querySelectorAll("button")).every(
        button => button.disabled
      )
    ).toBe(true);
    expect(container.querySelector("a")).toBeNull();
  });
});
