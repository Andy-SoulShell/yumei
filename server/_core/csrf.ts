import { randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response, NextFunction } from "express";
import { isSecureRequest } from "./cookies";

/**
 * CSRF protection — double-submit token (issue #8).
 *
 * Strategy:
 *   1. `csrfCookieMiddleware` runs on every request. If the request has no
 *      `csrf_token` cookie, it generates a fresh random token and sets it
 *      via Set-Cookie. The cookie is non-HttpOnly so client-side JS can
 *      read it; that's by design — it has to echo the value in a header.
 *   2. `csrfVerifyMiddleware` runs in front of `/api/trpc/*` and other
 *      state-changing routes. On POST it requires:
 *        - the request to carry the `csrf_token` cookie, AND
 *        - the request to carry an `X-CSRF-Token` header equal to the
 *          cookie's value (constant-time compared).
 *      A cross-site attacker cannot read the cookie due to same-origin
 *      policy on `document.cookie`, so they cannot forge the header.
 *
 * The very first request from a fresh client must be a top-level GET
 * (typically `/`) — that returns the cookie. Subsequent tRPC POSTs
 * succeed. Direct cross-site POSTs without the page-load handshake
 * are rejected with HTTP 403.
 *
 * The OAuth callback (`/api/oauth/callback`) is a GET initiated by the
 * external IdP redirect, so it bypasses this check naturally.
 */

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

const TOKEN_BYTES = 24; // 192-bit; base64url => 32 chars

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const parsed = parseCookieHeader(header);
  return parsed[name];
}

function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers. Pad to the same length
  // before comparison so callers with different-length inputs always lose
  // in constant time relative to each input length.
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Burn cycles equivalent to a real comparison so timing doesn't leak length.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Sets a `csrf_token` cookie on the response if the request didn't carry
 * one. Always calls `next()`. Must run BEFORE `csrfVerifyMiddleware`.
 */
export function csrfCookieMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const existing = readCookie(req, CSRF_COOKIE);
  if (!existing) {
    res.cookie(CSRF_COOKIE, generateToken(), {
      httpOnly: false, // JS must read it to echo in the X-CSRF-Token header
      sameSite: "lax",
      secure: isSecureRequest(req),
      path: "/",
    });
  }
  next();
}

/**
 * Verifies that the CSRF cookie and header are both present and equal.
 * Only enforced on state-changing methods (POST / PUT / PATCH / DELETE).
 * GET / HEAD / OPTIONS pass through.
 */
export function csrfVerifyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  const cookieToken = readCookie(req, CSRF_COOKIE);
  const headerRaw = req.headers[CSRF_HEADER];
  const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

  if (!cookieToken || !headerToken) {
    res.status(403).json({
      error: "CSRF token missing",
      hint: "Reload the page so the client picks up a fresh CSRF cookie.",
    });
    return;
  }

  if (!constantTimeEqual(cookieToken, headerToken)) {
    res.status(403).json({ error: "CSRF token mismatch" });
    return;
  }

  next();
}
