import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  csrfCookieMiddleware,
  csrfVerifyMiddleware,
  CSRF_COOKIE,
  CSRF_HEADER,
} from "./csrf";

/**
 * Tests for issue #8: CSRF protection (double-submit token).
 *
 * Each test fabricates a minimal Express-shaped req/res and asserts the
 * middleware behavior (cookie setting, allow/deny on POST, GET pass-through).
 */

type FakeReq = {
  method: string;
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
};

type FakeRes = {
  cookies: Array<{ name: string; value: string; opts: any }>;
  statusCode: number;
  body: any;
  cookie: (name: string, value: string, opts?: any) => void;
  status: (code: number) => FakeRes;
  json: (body: any) => FakeRes;
};

function makeReq(overrides: Partial<FakeReq> = {}): FakeReq {
  return {
    method: "GET",
    protocol: "http",
    headers: {},
    ...overrides,
  };
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    cookies: [],
    statusCode: 200,
    body: undefined,
    cookie(name, value, opts) {
      this.cookies.push({ name, value, opts });
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

describe("csrfCookieMiddleware (issue #8)", () => {
  it("sets a fresh csrf_token cookie when one is missing", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    csrfCookieMiddleware(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].name).toBe(CSRF_COOKIE);
    expect(res.cookies[0].value).toMatch(/^[A-Za-z0-9_-]{32,}$/); // base64url
    expect(res.cookies[0].opts.httpOnly).toBe(false);
    expect(res.cookies[0].opts.sameSite).toBe("lax");
  });

  it("does NOT set a cookie when the request already carries one", () => {
    const req = makeReq({
      headers: { cookie: `${CSRF_COOKIE}=existing-token` },
    });
    const res = makeRes();
    const next = vi.fn();

    csrfCookieMiddleware(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.cookies).toHaveLength(0);
  });

  it("generates unique tokens across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const res = makeRes();
      csrfCookieMiddleware(makeReq() as any, res as any, vi.fn());
      seen.add(res.cookies[0].value);
    }
    expect(seen.size).toBe(50);
  });
});

describe("csrfVerifyMiddleware (issue #8)", () => {
  it("passes GET / HEAD / OPTIONS through without checks", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const req = makeReq({ method });
      const res = makeRes();
      const next = vi.fn();
      csrfVerifyMiddleware(req as any, res as any, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(200);
    }
  });

  it("rejects POST with no cookie", () => {
    const req = makeReq({ method: "POST" });
    const res = makeRes();
    const next = vi.fn();
    csrfVerifyMiddleware(req as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/CSRF token missing/);
  });

  it("rejects POST with cookie but no header", () => {
    const req = makeReq({
      method: "POST",
      headers: { cookie: `${CSRF_COOKIE}=abc123` },
    });
    const res = makeRes();
    const next = vi.fn();
    csrfVerifyMiddleware(req as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("rejects POST with cookie and header that don't match", () => {
    const req = makeReq({
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE}=abc123`,
        [CSRF_HEADER]: "different-value",
      },
    });
    const res = makeRes();
    const next = vi.fn();
    csrfVerifyMiddleware(req as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/CSRF token mismatch/);
  });

  it("accepts POST when cookie equals header", () => {
    const token = "valid-csrf-token-base64url";
    const req = makeReq({
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE}=${token}`,
        [CSRF_HEADER]: token,
      },
    });
    const res = makeRes();
    const next = vi.fn();
    csrfVerifyMiddleware(req as any, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("does not leak length info on different-length tokens", () => {
    // Smoke check: the constant-time path doesn't throw on length mismatch
    // and consistently returns 403.
    const req = makeReq({
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE}=short`,
        [CSRF_HEADER]: "much-longer-token-value",
      },
    });
    const res = makeRes();
    csrfVerifyMiddleware(req as any, res as any, vi.fn());
    expect(res.statusCode).toBe(403);
  });

  it("rejects PUT, PATCH, DELETE without CSRF too", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const req = makeReq({ method });
      const res = makeRes();
      csrfVerifyMiddleware(req as any, res as any, vi.fn());
      expect(res.statusCode).toBe(403);
    }
  });
});
