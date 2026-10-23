// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { PrivacySettings } from "./PrivacySettings";
const mock = vi.hoisted(() => ({
  allowed: true,
  remove: vi.fn(),
  send: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "owner@example.test" } }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    privacy: {
      eligibility: { useQuery: () => ({ data: { allowed: mock.allowed } }) },
      export: { useMutation: () => ({ mutateAsync: mock.download }) },
      requestDeletion: { useMutation: () => ({ mutate: mock.send }) },
      deleteAccount: { useMutation: () => ({ mutate: mock.remove }) },
    },
  },
}));
let root: Root, node: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.allowed = true;
  history.replaceState(null, "", "/settings");
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});
function fill(id: string, value: string) {
  const input = document.getElementById(id)!;
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("opening an email link only opens confirmation and removes its token from the URL", () => {
  history.replaceState(null, "", "/settings#deleteToken=" + "a".repeat(48));
  act(() => root.render(<PrivacySettings />));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(location.hash).toBe("");
  expect(mock.remove).not.toHaveBeenCalled();
  const submit = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')
  ).find(b => b.textContent === "注销账号")!;
  expect(submit.disabled).toBe(true);
  fill("delete-email", "someone-else@example.test");
  fill("delete-confirm", "DELETE");
  expect(submit.disabled).toBe(true);
  fill("delete-email", "owner@example.test");
  expect(submit.disabled).toBe(false);
  act(() => submit.click());
  expect(mock.remove).toHaveBeenCalledWith(
    { email: "owner@example.test", token: "a".repeat(48), confirm: "DELETE" },
    expect.any(Object)
  );
});
it("blocks deletion and email requests while automatic renewal is active", () => {
  mock.allowed = false;
  history.replaceState(null, "", "/settings#deleteToken=" + "a".repeat(48));
  act(() => root.render(<PrivacySettings />));
  expect(document.body.textContent).toContain("注销前需先取消自动续费");
  expect(document.getElementById("delete-email")).toBeNull();
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.remove).not.toHaveBeenCalled();
});

it("accepts a confirmation link opened while settings are already mounted without deleting automatically", async () => {
  act(() => root.render(<PrivacySettings />));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () => {
    history.pushState(null, "", "/settings#deleteToken=" + "b".repeat(48));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(
    (document.getElementById("delete-token") as HTMLInputElement).value
  ).toBe("b".repeat(48));
  expect(location.hash).toBe("");
  expect(mock.remove).not.toHaveBeenCalled();
});
