// @vitest-environment jsdom
/** 六步选择必须进入真实创建草稿，登录衔接和名额限制不得丢失。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { discoveryFixture } from "@/features/discovery/testFixtures";
import { productFixture } from "../../../server/testProductConfig";
import { i18n, type Translator } from "@shared/i18n";
import { clearFormDrafts, formDraftKey, readFormDraft } from "@/lib/formDrafts";
import CreateCharacter from "./CreateCharacter";
const mock = vi.hoisted(() => ({
  user: null as { id: string } | null,
  navigate: vi.fn(),
  search: "",
  billing: { mode: "none", limits: { maxGirlfriends: null as number | null } },
  roles: [] as { id: number }[],
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("wouter", async original => ({
  ...(await original<typeof import("wouter")>()),
  useLocation: () => ["/create", mock.navigate],
  useSearch: () => mock.search,
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/features/discovery/useDiscovery", () => ({
  useDiscovery: () => ({ data: discoveryFixture, refetch: vi.fn() }),
}));
vi.mock("@/features/product/useProductConfig", () => ({
  useProductConfig: () => ({ raw: productFixture, refetch: vi.fn() }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    billing: { getInfo: { useQuery: () => ({ data: mock.billing }) } },
    girlfriend: { list: { useQuery: () => ({ data: mock.roles }) } },
  },
}));
let root: Root, element: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  clearFormDrafts();
  mock.user = null;
  mock.search = "";
  mock.billing = { mode: "none", limits: { maxGirlfriends: null } };
  mock.roles = [];
  vi.clearAllMocks();
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(() => root.unmount());
  element.remove();
  clearFormDrafts();
});
const click = async (text: string) => {
  const button = Array.from(element.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
  expect(button).toBeTruthy();
  await act(() => button.click());
};
const enter = async (input: HTMLInputElement, value: string) => {
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
async function throughSteps() {
  await click("开始定制");
  await click("下一步");
  await click("银色");
  await click("下一步");
  await click("高挑");
  await click("下一步");
  await click("优雅");
  await click("下一步");
}
it("keeps choices through sign-in and restores the review step", async () => {
  await act(() => root.render(<CreateCharacter />));
  await throughSteps();
  await click("确认并创建");
  expect(mock.navigate).toHaveBeenCalledWith(
    "/login?next=%2Fcreate%3Fresume%3D1"
  );
  mock.user = { id: "creator-a" };
  mock.search = "resume=1";
  await act(() => root.render(<CreateCharacter />));
  expect(element.querySelector('[aria-current="step"]')?.textContent).toContain(
    "形象与创建"
  );
  await click("确认并创建");
  const preset = discoveryFixture.characters.find(
    r => r.listed && r.style === "realistic"
  )!;
  const draft = readFormDraft(
    formDraftKey("creator-a", "character-new:" + preset.id)
  );
  expect(draft?.appearance).toEqual(
    expect.stringContaining("hairColor: silver")
  );
  expect(draft?.appearance).toEqual(expect.stringContaining("height: tall"));
  expect(draft?.appearance).toEqual(expect.stringContaining("outfit: elegant"));
  expect(mock.navigate).toHaveBeenLastCalledWith(
    "/setup?preset=" + preset.id + "&builder=1"
  );
});
it("blocks underage inputs before later customization steps", async () => {
  await act(() => root.render(<CreateCharacter />));
  await click("开始定制");
  await enter(element.querySelector('input[type="number"]')!, "17");
  const next = Array.from(element.querySelectorAll("button")).find(
    b => b.textContent === "下一步"
  )!;
  expect(next.disabled).toBe(true);
  expect(element.querySelector('[aria-current="step"]')?.textContent).toContain(
    "基本"
  );
});
it("shows a full account's capacity before choosing any appearance", async () => {
  mock.user = { id: "full-account" };
  mock.billing = { mode: "free", limits: { maxGirlfriends: 1 } };
  mock.roles = [{ id: 1 }];
  await act(() => root.render(<CreateCharacter />));
  expect(element.querySelector('[role="status"]')?.textContent).toContain(
    "个角色名额已用完"
  );
  expect(element.querySelector('a[href="/characters"]')).not.toBeNull();
  expect(
    Array.from(element.querySelectorAll("button")).find(
      b => b.textContent === "开始定制"
    )?.disabled
  ).toBe(true);
});
