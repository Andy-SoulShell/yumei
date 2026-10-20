/** 认证入口与安全的站内回跳地址。 */
import { safeReturnTo } from "./navigation";

export const AUTH_PATHS = {
  login: "/login",
  register: "/register",
  forgot: "/forgot-password",
  reset: "/reset-password",
  verify: "/verify-email",
  magic: "/magic-link",
} as const;
export type AuthMode = keyof typeof AUTH_PATHS;

/** 根据当前地址识别认证页面，普通业务页面返回 undefined。 */
export function authModeForPath(path: string): AuthMode | undefined {
  return (Object.keys(AUTH_PATHS) as AuthMode[]).find(
    mode => AUTH_PATHS[mode] === path
  );
}

/** 构造认证入口，仅允许白名单内的站内回跳。 */
export function authUrl(mode: AuthMode, returnTo: string) {
  return `${AUTH_PATHS[mode]}?next=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

/** 邮件返回当前访问来源；服务端仍会检查来源是否受信任。 */
export function authCallbackUrl(mode: "reset" | "verify", returnTo: string) {
  return new URL(authUrl(mode, returnTo), window.location.origin).href;
}
