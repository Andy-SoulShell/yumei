// @vitest-environment jsdom
/** 使用实际认证表单验证请求、密码校验、邮件反馈以及桌面和手机入口。 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import type { AuthMode } from "@/lib/auth-navigation";
import { AuthFlow } from "./AuthFlow";
import { SignInButton } from "@/components/SignInButton";

const mock = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  magic: vi.fn(),
  reset: vi.fn(),
  requestReset: vi.fn(),
  verify: vi.fn(),
  authenticated: vi.fn(),
  user: null as { emailVerified: boolean } | null,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: mock.signIn, magicLink: mock.magic },
    signUp: { email: mock.signUp },
    resetPassword: mock.reset,
    requestPasswordReset: mock.requestReset,
    sendVerificationEmail: mock.verify,
  },
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
vi.mock("@/components/AppearanceSettings", () => ({
  LanguagePicker: () => <span>简体中文</span>,
}));
let root: Root;
let container: HTMLDivElement;
function Flow({ initial }: { initial: AuthMode }) {
  const [mode, setMode] = useState(initial);
  return (
    <AuthFlow
      mode={mode}
      onModeChange={setMode}
      returnTo="/?character=char-cute"
      onAuthenticated={mock.authenticated}
    />
  );
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }))
  );
  window.history.replaceState(null, "", "/login");
  vi.clearAllMocks();
  mock.user = null;
  for (const fn of [
    mock.signIn,
    mock.signUp,
    mock.magic,
    mock.reset,
    mock.requestReset,
    mock.verify,
  ])
    fn.mockResolvedValue({ data: {}, error: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(mode: AuthMode) {
  await act(async () => root.render(<Flow initial={mode} />));
}
async function fill(name: string, value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(
      `input[name="${name}"]`
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function click(text: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    item => item.textContent === text
  )!;
  expect(button).toBeDefined();
  await act(async () => {
    button.click();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe("email and password forms", () => {
  it("uses password login and preserves the original password and return destination", async () => {
    await render("login");
    await fill("email", "test@example.com");
    await fill("password", "  secret-pass  ");
    await submit();
    expect(mock.signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        password: "  secret-pass  ",
        fetchOptions: { headers: { "x-yumei-locale": "zh-CN" } },
      })
    );
    expect(mock.magic).not.toHaveBeenCalled();
    expect(mock.authenticated).toHaveBeenCalledWith("/?character=char-cute");
  });
  it("blocks mismatched passwords and clears password fields after registration", async () => {
    await render("register");
    await fill("email", "new@example.com");
    await fill("password", "correct-password");
    await fill("confirmPassword", "wrong-password");
    await submit();
    expect(mock.signUp).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "不一致"
    );
    await fill("confirmPassword", "correct-password");
    await submit();
    const request = mock.signUp.mock.calls[0][0];
    expect(new URL(request.callbackURL).pathname).toBe("/verify-email");
    expect(new URL(request.callbackURL).searchParams.get("next")).toBe(
      "/?character=char-cute"
    );
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).toContain("请查收邮件");
  });
  it("lets unverified users request a new verification mail and prevents immediate resends", async () => {
    mock.signIn.mockResolvedValue({
      error: { code: "EMAIL_NOT_VERIFIED", status: 403 },
    });
    await render("login");
    await fill("email", "unverified@example.com");
    await fill("password", "correct-password");
    await submit();
    await click("重新发送验证邮件");
    expect(mock.verify).toHaveBeenCalledWith(
      expect.objectContaining({ email: "unverified@example.com" })
    );
    expect(
      Array.from(container.querySelectorAll("button")).find(button =>
        button.textContent?.includes("秒后可重发")
      )?.disabled
    ).toBe(true);
  });
  it("uses a generic reset-email result and returns to password login", async () => {
    await render("forgot");
    await fill("email", "unknown@example.com");
    await submit();
    expect(mock.requestReset).toHaveBeenCalledWith(
      expect.objectContaining({ email: "unknown@example.com" })
    );
    expect(container.textContent).toContain("如果 unknown@example.com 已注册");
    await click("返回登录");
    expect(
      container.querySelector('input[autocomplete="current-password"]')
    ).not.toBeNull();
  });
  it("captures the reset token, removes it from the address bar and requires sign-in after reset", async () => {
    window.history.replaceState(
      null,
      "",
      "/reset-password?token=one-time-reset"
    );
    await render("reset");
    expect(window.location.search).not.toContain("one-time-reset");
    await fill("password", "new-password");
    await fill("confirmPassword", "new-password");
    await submit();
    expect(mock.reset).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "one-time-reset",
        newPassword: "new-password",
      })
    );
    expect(container.textContent).toContain("密码已重置");
    expect(mock.authenticated).not.toHaveBeenCalled();
  });
  it("offers a new reset link when the server rejects an expired token", async () => {
    window.history.replaceState(null, "", "/reset-password?token=expired");
    mock.reset.mockResolvedValue({
      error: { code: "INVALID_TOKEN", status: 400 },
    });
    await render("reset");
    await fill("password", "new-password");
    await fill("confirmPassword", "new-password");
    await submit();
    expect(container.textContent).toContain("链接已失效");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    await click("发送重置链接");
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
  });
  it("keeps magic links as a secondary option", async () => {
    await render("login");
    await click("使用邮箱链接登录");
    await fill("email", "old@example.com");
    await submit();
    expect(mock.magic).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "old@example.com",
        callbackURL: "/?character=char-cute",
      })
    );
  });
});

describe("responsive sign-in entry", () => {
  it("opens registration directly for a homepage call to action", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    await act(async () =>
      root.render(
        <SignInButton
          returnTo="/explore"
          initialMode="register"
          label="免费注册，开启故事"
        />
      )
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/register?next=%2Fexplore"
    );
    await act(async () => {
      container.querySelector<HTMLAnchorElement>("a")!.click();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(
      document.querySelector('[role="dialog"] input[name="confirmPassword"]')
    ).not.toBeNull();
    expect(mock.signUp).not.toHaveBeenCalled();
  });
  it("opens a desktop modal without leaving the page", async () => {
    window.history.replaceState(null, "", "/?character=char-cute");
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    await act(async () => root.render(<SignInButton returnTo="/" />));
    await act(async () => {
      container.querySelector<HTMLAnchorElement>("a")!.click();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(window.location.pathname + window.location.search).toBe(
      "/?character=char-cute"
    );
    expect(
      document.querySelector('[role="dialog"] input[name="password"]')
    ).not.toBeNull();
    await click("注册账号");
    expect(
      document.querySelector('[role="dialog"] input[name="confirmPassword"]')
    ).not.toBeNull();
    await click("关闭");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("a"));
  });
  it("leaves the mobile entry as a navigable login link", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
    await act(async () => root.render(<SignInButton returnTo="/settings" />));
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/login?next=%2Fsettings"
    );
    await act(async () =>
      container.querySelector<HTMLAnchorElement>("a")!.click()
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
