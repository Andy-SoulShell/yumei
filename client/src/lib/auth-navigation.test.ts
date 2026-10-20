/** 认证地址保留安全回跳，邮件回调无法携带外站跳转。 */
import { describe, expect, it } from "vitest";
import { authDismissUrl, authModeForPath, authUrl } from "./auth-navigation";

describe("authentication navigation", () => {
  it.each([
    "/generate",
    "/setup?preset=rin",
    "/characters",
    "/chat/42",
    "/settings",
  ])(
    "dismisses authentication for protected target %s to a public page",
    target => {
      expect(authDismissUrl(target)).toBe("/");
      expect(
        new URL(
          authUrl("login", target),
          "https://yumei.test"
        ).searchParams.get("next")
      ).toBe(target);
    }
  );
  it.each([
    "/",
    "/?character=rin",
    "/explore?q=coffee&style=realistic&character=shiyu",
  ])("returns to the original public preview when dismissing %s", target =>
    expect(authDismissUrl(target)).toBe(target)
  );
  it("recognizes all authentication routes without consuming business routes", () => {
    expect(authModeForPath("/register")).toBe("register");
    expect(authModeForPath("/reset-password")).toBe("reset");
    expect(authModeForPath("/verify-email")).toBe("verify");
    expect(authModeForPath("/settings")).toBeUndefined();
  });
  it("preserves an intended companion while switching authentication steps", () => {
    const next = "/?character=char-cute";
    expect(
      new URL(authUrl("register", next), "https://yumei.test").searchParams.get(
        "next"
      )
    ).toBe(next);
  });
  it.each([
    "https://other.test",
    "//other.test",
    "/\\other.test",
    "/reset-password?token=secret",
  ])("rejects unsafe return URL %s", next => {
    expect(
      new URL(authUrl("login", next), "https://yumei.test").searchParams.get(
        "next"
      )
    ).toBe("/");
  });
});
