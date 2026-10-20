// @vitest-environment jsdom
/** 验证账号安全表单按密码状态选择邮件设置或旧密码修改，失败时允许重试。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { PasswordSettings } from "./PasswordSettings";

const mock = vi.hoisted(() => ({
  change: vi.fn(),
  request: vi.fn(),
  retry: vi.fn(),
  status: { data: { hasPassword: true }, isError: false, isLoading: false },
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "account@example.com" } }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: mock.change,
    requestPasswordReset: mock.request,
  },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      passwordStatus: {
        useQuery: () => ({ ...mock.status, refetch: mock.retry }),
      },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.status = {
    data: { hasPassword: true },
    isError: false,
    isLoading: false,
  };
  mock.change.mockResolvedValue({ error: null });
  mock.request.mockResolvedValue({ error: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function fill(name: string, value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(
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
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
it("uses email ownership verification to add a password to a magic-link account", async () => {
  mock.status.data.hasPassword = false;
  await act(async () => root.render(<PasswordSettings />));
  expect(container.querySelector("input")).toBeNull();
  await submit();
  expect(mock.request).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "account@example.com",
      redirectTo: expect.stringContaining("/reset-password?next=%2Fsettings"),
    })
  );
  expect(mock.change).not.toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "account@example.com"
  );
  expect(container.querySelector("button")?.disabled).toBe(true);
});
it("keeps the form after an incorrect current password, then clears it when the retry succeeds", async () => {
  mock.change.mockResolvedValueOnce({ error: { code: "INVALID_PASSWORD" } });
  await act(async () => root.render(<PasswordSettings />));
  await fill("currentPassword", "wrong-password");
  await fill("newPassword", "new-password");
  await fill("confirmPassword", "new-password");
  await submit();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(
    container.querySelector<HTMLInputElement>('input[name="newPassword"]')
      ?.value
  ).toBe("new-password");
  await fill("currentPassword", "correct-password");
  await submit();
  expect(mock.change).toHaveBeenLastCalledWith(
    expect.objectContaining({
      currentPassword: "correct-password",
      newPassword: "new-password",
      revokeOtherSessions: true,
    })
  );
  for (const input of Array.from(container.querySelectorAll("input")))
    expect(input.value).toBe("");
  expect(container.querySelector('[role="status"]')).not.toBeNull();
});
it("provides a retry instead of enabling password actions when the account status cannot load", async () => {
  mock.status.isError = true;
  await act(async () => root.render(<PasswordSettings />));
  expect(container.querySelector("form")).toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(mock.retry).toHaveBeenCalledOnce();
  expect(mock.change).not.toHaveBeenCalled();
  expect(mock.request).not.toHaveBeenCalled();
});
