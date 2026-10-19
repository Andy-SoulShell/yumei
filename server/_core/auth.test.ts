/** 覆盖认证实例和会话用户解析。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "a".repeat(40);
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("auth instance in test mode", () => {
  it("is null when DATABASE_URL is unset", async () => {
    const { auth } = await import("./auth");
    expect(auth).toBeNull();
  });
});

describe("getSessionUser", () => {
  it("returns null when there is no session cookie", async () => {
    const { getSessionUser } = await import("./auth");
    const result = await getSessionUser({ headers: {} });
    expect(result).toBeNull();
  });

  it("returns null when auth is null (test mode), regardless of headers", async () => {
    const { getSessionUser } = await import("./auth");
    const result = await getSessionUser({
      headers: { cookie: "app_session=anything" },
    });
    expect(result).toBeNull();
  });
});
