/** 统一计算应用 Cookie 的安全属性，支持读取代理转发的协议信息。 */

import type { CookieOptions, Request } from "express";

/**
 * 根据请求协议或转发协议头判断当前请求是否使用 HTTPS。
 *
 * @remarks 代理头的可信边界由部署层保障，此函数本身不限制头来源。
 */
export function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/** 返回同源应用清理会话 Cookie 时使用的路径、安全及 SameSite 选项。 */
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,
    path: "/",
    // 前后端同源，Lax 限制跨站 POST；业务写请求另有 CSRF 令牌校验。
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
