/** 按公开站点、本机名称和局域网网卡计算开发与生产的访问白名单。 */

import { hostname, networkInterfaces } from "node:os";

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

/** 本地访问允许的精确主机名和网卡地址，供 Vite 与认证共用。 */
export function getLocalAccessHosts(): string[] {
  const machine = hostname().toLowerCase();
  const hosts = new Set(LOOPBACK_HOSTS);
  hosts.add(machine);
  if (machine.endsWith(".local")) hosts.add(machine.slice(0, -6));
  else if (!machine.includes(".")) hosts.add(`${machine}.local`);
  for (const network of Object.values(networkInterfaces())) {
    for (const address of network ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      const [first, second] = address.address.split(".").map(Number);
      if (
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)
      )
        hosts.add(address.address);
    }
  }
  for (const host of (process.env.VITE_EXTRA_ALLOWED_HOST ?? "").split(",")) {
    const value = host.trim().toLowerCase();
    if (!value) continue;
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)) {
      throw new Error(
        "VITE_EXTRA_ALLOWED_HOST must contain hostnames without a protocol, port or wildcard."
      );
    }
    hosts.add(value);
  }
  if (process.env.BETTER_AUTH_URL)
    hosts.add(new URL(process.env.BETTER_AUTH_URL).hostname);
  return Array.from(hosts);
}

/**
 * 本地模式按已知访问主机生成邮件地址；公网模式保留固定站点与来源限制。
 * @remarks 不信任任意 Host 或代理头；不同主机的 Cookie 仍各自独立。
 */
export function getAuthOriginOptions(publicUrl: string, localAccess: boolean) {
  if (!localAccess)
    return {
      baseURL: publicUrl,
      trustedOrigins: getTrustedAuthOrigins(publicUrl),
    };
  const publicAddress = new URL(publicUrl);
  const origins = new Set(getTrustedAuthOrigins(publicUrl, true));
  for (const host of getLocalAccessHosts()) {
    const local = new URL(publicAddress.origin);
    local.hostname = host;
    local.port = publicAddress.port || process.env.PORT || "3000";
    origins.add(local.origin);
  }
  return {
    baseURL: {
      allowedHosts: Array.from(origins, origin => new URL(origin).host),
      fallback: publicAddress.origin,
      protocol:
        publicAddress.protocol === "https:"
          ? ("https" as const)
          : ("http" as const),
    },
    trustedOrigins: Array.from(origins),
  };
}
