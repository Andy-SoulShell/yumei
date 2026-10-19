/** 根据公开站点地址计算认证可信来源，本地调试可显式允许回环地址别名。 */

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * 返回配置的站点来源，必要时扩展同端口的本机回环别名。
 *
 * @param allowLocalAliases - 仅在本地日志登录模式下显式开启
 */
export function getTrustedAuthOrigins(
  publicUrl: string,
  allowLocalAliases = false
): string[] {
  const url = new URL(publicUrl);
  const origins = new Set([url.origin]);
  if (allowLocalAliases && LOOPBACK_HOSTS.includes(url.hostname)) {
    for (const hostname of LOOPBACK_HOSTS) {
      url.hostname = hostname;
      origins.add(url.origin);
    }
  }
  return Array.from(origins);
}
