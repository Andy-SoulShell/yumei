import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the Better-Auth instance + session helper (Phase 1b-ii.1).
 *
 * `auth.ts` constructs the Better-Auth instance lazily based on whether
 * `DATABASE_URL` is set. In test mode (NODE_ENV=test, no DATABASE_URL),
 * the module exports `auth = null`, and `getSessionUser` short-circuits
 * to `null` without ever touching a network or DB. We exercise both
 * paths here.
 *
 * The full auth handler — magic-link issuance, callback verification,
 * cookie setting — runs against a real DB and is covered by the smoke
 * test (TODO 9 in the handoff), not by unit tests.
 */

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
