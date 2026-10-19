const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Local Docker access may use any loopback spelling on the configured port. */
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
