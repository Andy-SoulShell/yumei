// @vitest-environment jsdom
/** 直接访问认证路由时，关闭弹框必须离开登录守卫，同时保留成功后的操作目标。 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import Login from "@/pages/Login";

const mock = vi.hoisted(() => ({ query: "", navigate: vi.fn(), returnTo: "" }));
vi.mock("wouter", async importOriginal => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["/login", mock.navigate],
  useSearch: () => mock.query,
}));
vi.mock("@/hooks/useDesktopAuth", () => ({ useDesktopAuth: () => true }));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/pages/Landing", () => ({
  default: () => <div>Public homepage</div>,
}));
vi.mock("@/features/auth/AuthFlow", () => ({
  AuthFlow: ({ returnTo }: { returnTo: string }) => {
    mock.returnTo = returnTo;
    return (
      <>
        <DialogTitle>登录</DialogTitle>
        <DialogDescription>继续你的故事</DialogDescription>
      </>
    );
  },
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") as Translator }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("dismiss route-based authentication", () => {
  it.each([
    ["/generate", "/"],
    ["/setup?preset=rin", "/"],
    [
      "/explore?q=coffee&style=realistic&character=shiyu",
      "/explore?q=coffee&style=realistic&character=shiyu",
    ],
  ])("closes the login dialog for %s to %s", async (target, expected) => {
    mock.query = "next=" + encodeURIComponent(target);
    await act(async () => root.render(<Login />));
    expect(mock.returnTo).toBe(target);
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!
        .click()
    );
    expect(mock.navigate).toHaveBeenCalledWith(expected, { replace: true });
  });
});
