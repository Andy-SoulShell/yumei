/** 登录回跳仅接受站内路由，不允许外部网址或登录循环。 */
import { describe, expect, it } from "vitest";
import { loginUrl, safeReturnTo } from "./navigation";

describe("login return navigation", () => {
  it.each([
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/login?next=/login",
    "/\nexample.com",
    "/unknown",
    "/u/../../settings",
    "/u/https://example.com",
    "",
    null,
  ])("rejects unsafe destination %s", destination => {
    expect(safeReturnTo(destination)).toBe("/");
  });
  it("preserves a selected character, protected route and query", () => {
    expect(safeReturnTo("/u/my_creator")).toBe("/u/my_creator");
    expect(safeReturnTo("/create?resume=1")).toBe("/create?resume=1");
    expect(safeReturnTo("/generate?view=create&resume=1")).toBe(
      "/generate?view=create&resume=1"
    );
    expect(safeReturnTo("/community?character=rin")).toBe(
      "/community?character=rin"
    );
    expect(safeReturnTo("/?character=rin")).toBe("/?character=rin");
    expect(safeReturnTo("/help?category=billing")).toBe(
      "/help?category=billing"
    );
    expect(safeReturnTo("/privacy")).toBe("/privacy");
    expect(safeReturnTo("/setup?preset=rin")).toBe("/setup?preset=rin");
    expect(safeReturnTo("/chat/12?selfie=1")).toBe("/chat/12?selfie=1");
    expect(
      new URL(
        loginUrl("/setup?preset=rin"),
        "http://localhost"
      ).searchParams.get("next")
    ).toBe("/setup?preset=rin");
  });
});
