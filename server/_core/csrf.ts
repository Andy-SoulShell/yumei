/** 为业务写请求提供 Cookie 与请求头双提交令牌校验。 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response, NextFunction } from "express";
import { isSecureRequest } from "./cookies";

/** 保存 CSRF 随机令牌的非 HttpOnly Cookie 名称。 */

export const CSRF_COOKIE = "csrf_token";
/** 客户端回传 CSRF 令牌时使用的请求头名称。 */
export const CSRF_HEADER = "x-csrf-token";

const TOKEN_BYTES = 24; // 192 位随机量，base64url 编码为 32 个字符

/** 生成二十四字节随机令牌并编码为 base64url。 */
function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** 从请求 Cookie 头解析指定名称的值。 */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const parsed = parseCookieHeader(header);
  return parsed[name];
}

/** 使用恒定时间比较令牌内容，长度不同时消耗一次比较后返回 false。 */
function constantTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual 仅接受等长 Buffer；长度不同时执行一次自身比较再拒绝。
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // 消耗一次比较；这里不填充输入，也不保证不同长度请求的总耗时相同。
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * 缺少 CSRF Cookie 时写入随机令牌，再继续处理请求。
 *
 * @remarks 必须在业务写请求校验中间件之前注册。
 */
export function csrfCookieMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const existing = readCookie(req, CSRF_COOKIE);
  if (!existing) {
    res.cookie(CSRF_COOKIE, generateToken(), {
      httpOnly: false, // 前端需要读取后放入 X-CSRF-Token 请求头
      sameSite: "lax",
      secure: isSecureRequest(req),
      path: "/",
    });
  }
  next();
}

/**
 * 校验写请求中的 CSRF Cookie 与请求头是否相同，缺失或不符时返回 403。
 *
 * @remarks GET、HEAD 与 OPTIONS 放行；Better-Auth 使用独立的来源校验流程。
 */
export function csrfVerifyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
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
