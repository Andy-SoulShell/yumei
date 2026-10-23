// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { i18n } from "@shared/i18n";
import { VerifyEmailAction } from "./VerifyEmailAction";
import { clearFormDrafts } from "@/lib/formDrafts";
const mock = vi.hoisted(() => ({ send: vi.fn(), toast: vi.fn() }));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "verify-audit",
      email: "audit@example.test",
      emailVerified: false,
    },
  }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { sendVerificationEmail: mock.send },
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN"), locale: "zh-CN" }),
}));
vi.mock("sonner", () => ({
  toast: { success: mock.toast, error: mock.toast },
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.send.mockResolvedValue({ data: {}, error: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
it("sends for the current account, preserves the wallet destination and blocks repeat sends during cooldown", async () => {
  await act(async () => root.render(<VerifyEmailAction returnTo="/wallet" />));
  await act(async () => {
    container.querySelector("button")!.click();
    container.querySelector("button")!.click();
  });
  expect(mock.send).toHaveBeenCalledTimes(1);
  const input = mock.send.mock.calls[0][0],
    callback = new URL(input.callbackURL);
  expect(input.email).toBe("audit@example.test");
  expect(callback.pathname).toBe("/verify-email");
  expect(callback.searchParams.get("next")).toBe("/wallet");
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "audit@example.test"
  );
});
it("keeps verification retryable on a network failure and suppresses late feedback after account exit", async () => {
  mock.send.mockRejectedValueOnce(new Error("network"));
  await act(async () => root.render(<VerifyEmailAction returnTo="/creator" />));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("button")!.disabled).toBe(false);
  expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
  let resolve!: (value: unknown) => void;
  mock.send.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  await act(async () => container.querySelector("button")!.click());
  clearFormDrafts();
  await act(async () => {
    resolve({ data: {}, error: null });
  });
  expect(mock.toast).not.toHaveBeenCalled();
});
