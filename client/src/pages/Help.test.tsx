// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { clearFormDrafts } from "@/lib/formDrafts";
import Help from "./Help";
const mock = vi.hoisted(() => ({
  user: null as any,
  list: vi.fn(),
  create: vi.fn(),
  createError: false,
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    support: {
      list: {
        useInfiniteQuery: () => {
          mock.list();
          return { data: { pages: [{ items: [] }] } };
        },
      },
      create: {
        useMutation: () => ({ mutate: mock.create, isError: mock.createError }),
      },
    },
    useUtils: () => ({ support: { list: { invalidate: vi.fn() } } }),
  },
}));
let root: Root, node: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  clearFormDrafts();
  mock.user = null;
  mock.createError = false;
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
  clearFormDrafts();
});
function fill(id: string, text: string) {
  const target = document.getElementById(id)!;
  const prototype =
    target.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  act(() => {
    setter.call(target, text);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("gives guests useful guidance and a sign-in return path without requesting private tickets", () => {
  act(() => root.render(<Help />));
  expect(node.textContent).toContain("帮助与售后");
  expect(node.textContent).toContain("避免重复购买");
  expect(node.querySelector('a[href="/login?next=%2Fhelp"]')).not.toBeNull();
  expect(mock.list).not.toHaveBeenCalled();
});
it("keeps a failed support draft when navigating away and returning", () => {
  mock.user = { id: "support-draft-user" };
  mock.createError = true;
  act(() => root.render(<Help />));
  act(() => {
    const category = document.getElementById(
      "support-category"
    ) as HTMLSelectElement;
    category.value = "billing";
    category.dispatchEvent(new Event("change", { bubbles: true }));
  });
  fill("support-subject", "付款问题");
  fill("support-content", "请核对订单");
  act(() =>
    node
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  );
  expect(mock.create).toHaveBeenCalledWith(
    expect.objectContaining({ subject: "付款问题", content: "请核对订单" })
  );
  act(() => root.render(<div />));
  act(() => root.render(<Help />));
  expect(
    (document.getElementById("support-content") as HTMLTextAreaElement).value
  ).toBe("请核对订单");
  expect(
    (document.getElementById("support-category") as HTMLSelectElement).value
  ).toBe("billing");
  expect(node.textContent).toContain("内容已保留");
});
