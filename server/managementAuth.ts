/** 单密码管理认证，使用独立数据库会话，不创建用户或赋予用户权限。 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { parse } from "cookie";
import { eq, and, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { managementSessions, rateWindows } from "../drizzle/schema";
import { getDb } from "./database";
import { ENV } from "./_core/env";
import { isSecureRequest } from "./_core/cookies";
const COOKIE = "yumei_management";
const SESSION_MS = 12 * 3600000;
const WINDOW_MS = 15 * 60000;
const MAX_ATTEMPTS = 5;
export type Administrator = { id: "management" };
function password() {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.length >= 8 && value.length <= 512 ? value : null;
}
function fingerprint(value: string) {
  return createHmac("sha256", ENV.cookieSecret).update(value).digest("hex");
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function token(req: Request) {
  const value = parse(req.headers?.cookie ?? "")[COOKIE];
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
/** 缺少密码时关闭管理入口；过期和更换密码后的会话均不能访问。 */
export async function readAdministrator(
  req: Request
): Promise<Administrator | null> {
  const value = token(req),
    secret = password();
  if (!value || !secret) return null;
  const db = (await getDb())!;
  const [session] = await db
    .select()
    .from(managementSessions)
    .where(eq(managementSessions.id, digest(value)));
  return session &&
    session.expiresAt.getTime() > Date.now() &&
    session.credentialFingerprint === fingerprint(secret)
    ? { id: "management" }
    : null;
}
export function managementConfigured() {
  return !!password();
}
/** 共享滑动窗口先持久计入尝试，再比较密码，跨实例不能绕过尝试次数。 */
async function consumeAttempt(req: Request) {
  const db = (await getDb())!;
  const userId =
    "admin-login:" + digest(req.ip || req.socket?.remoteAddress || "unknown");
  await db.transaction(async tx => {
    await tx
      .insert(rateWindows)
      .values({
        userId,
        action: "management",
        requests: [],
        updatedAt: new Date(),
      })
      .onDuplicateKeyUpdate({ set: { userId } });
    const [row] = await tx
      .select()
      .from(rateWindows)
      .where(eq(rateWindows.userId, userId))
      .for("update");
    const now = Date.now(),
      recent = row.requests.filter(time => now - time < WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "尝试次数过多，请 15 分钟后再试",
      });
    await tx
      .update(rateWindows)
      .set({ requests: [...recent, now], updatedAt: new Date() })
      .where(eq(rateWindows.userId, userId));
  });
}
/** 仅成功登录签发 HttpOnly Cookie；令牌和密码均不返回给前端脚本。 */
export async function loginManagement(
  req: Request,
  res: Response,
  input: string
) {
  res.setHeader("Cache-Control", "no-store");
  const secret = password();
  if (!secret)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "请在服务端配置至少 8 位的 ADMIN_PASSWORD",
    });
  await consumeAttempt(req);
  if (
    !timingSafeEqual(
      Buffer.from(fingerprint(input), "hex"),
      Buffer.from(fingerprint(secret), "hex")
    )
  )
    throw new TRPCError({ code: "UNAUTHORIZED", message: "管理密码不正确" });
  const value = randomBytes(32).toString("base64url"),
    db = (await getDb())!;
  const old = token(req);
  if (old)
    await db
      .delete(managementSessions)
      .where(eq(managementSessions.id, digest(old)));
  await db.insert(managementSessions).values({
    id: digest(value),
    credentialFingerprint: fingerprint(secret),
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  res.cookie(COOKIE, value, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MS,
  });
  return { authenticated: true as const };
}
/** 删除服务端会话后清除 Cookie，复制的旧令牌也不能继续使用。 */
export async function logoutManagement(req: Request, res: Response) {
  const value = token(req);
  if (value)
    await (await getDb())!
      .delete(managementSessions)
      .where(eq(managementSessions.id, digest(value)));
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "strict",
    path: "/",
  });
  return { authenticated: false as const };
}

/** 清理过期管理会话及认证专用窗口，不受业务限流窗口保留时间影响。 */
export async function cleanupManagementAuthentication() {
  const db = (await getDb())!;
  await db
    .delete(managementSessions)
    .where(lte(managementSessions.expiresAt, new Date()));
  await db
    .delete(rateWindows)
    .where(
      and(
        eq(rateWindows.action, "management"),
        lte(rateWindows.updatedAt, new Date(Date.now() - WINDOW_MS))
      )
    );
}
