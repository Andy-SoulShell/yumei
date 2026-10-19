/**
 * Log utility with PII / secret redaction (issue #11).
 *
 * This is a Phase-1a stop-gap: it wraps `console.{error,warn,log}` and
 * scrubs known-sensitive keys from any object passed to the call. Phase 5
 * (issue #31) replaces this with `pino` + a proper redaction pipeline +
 * request IDs + JSON output.
 *
 * Use `log.error / log.warn / log.info` in place of `console.error / warn / log`
 * anywhere you might log error objects, request bodies, user records, or
 * results from third-party APIs.
 */

/** Exact key names that always get masked, regardless of value type. */
const ALWAYS_REDACT_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "cookieSecret",
  "jwt",
  "JWT_SECRET",
  "JWT",
  "code", // OAuth one-time code
  "state", // OAuth state
  "accessToken",
  "refreshToken",
  "idToken",
  "access_token",
  "refresh_token",
  "id_token",
  "Authorization",
  "authorization",
  "Cookie",
  "cookie",
  "openId",
]);

/** Pattern match for any field name containing one of these substrings. */
const KEY_PATTERN = /(key|secret|token|password|credential)/i;

/** Top-level keys whose value should be email-masked. */
const EMAIL_KEYS = new Set(["email", "Email", "userEmail"]);

const MAX_DEPTH = 5;
const MAX_ARRAY = 50;
const MAX_STRING = 500;

function maskShort(): string {
  return "***";
}

function maskString(value: string): string {
  if (value.length <= 4) return maskShort();
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return maskString(value);
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  // Always reveal the first character of the local part (so operators can
  // disambiguate users in logs without exposing the full address).
  const safeLocal = local.slice(0, 1) + "***";
  return `${safeLocal}@${domain}`;
}

/**
 * Recursively redact sensitive fields. Errors are flattened to
 * `{ name, message }` (stack omitted because it can include source code
 * snippets containing secrets).
 */
export function redact(input: unknown, depth = MAX_DEPTH): unknown {
  if (depth <= 0) return "[redacted:max-depth]";
  if (input === null || input === undefined) return input;

  // Primitives.
  if (typeof input === "string") {
    return input.length > MAX_STRING
      ? input.slice(0, MAX_STRING) + "...[truncated]"
      : input;
  }
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "bigint") return input.toString();
  if (typeof input === "function" || typeof input === "symbol") return "[fn]";

  // Errors: keep name + message, drop stack and any attached props.
  if (input instanceof Error) {
    return { name: input.name, message: input.message };
  }

  // Arrays.
  if (Array.isArray(input)) {
    return input
      .slice(0, MAX_ARRAY)
      .map(v => redact(v, depth - 1))
      .concat(input.length > MAX_ARRAY ? [`...[+${input.length - MAX_ARRAY}]`] : []);
  }

  // Plain objects.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (ALWAYS_REDACT_KEYS.has(k)) {
      // Strict redaction for the most sensitive fields — no length leak.
      out[k] = "***";
    } else if (KEY_PATTERN.test(k)) {
      // Pattern-matched fields keep first/last 2 chars so an operator can
      // tell at a glance whether the value differs across log lines.
      out[k] = typeof v === "string" ? maskString(v) : "[redacted]";
    } else if (EMAIL_KEYS.has(k) && typeof v === "string") {
      out[k] = maskEmail(v);
    } else {
      out[k] = redact(v, depth - 1);
    }
  }
  return out;
}

function format(label: string, args: unknown[]): unknown[] {
  return [label, ...args.map(a => redact(a))];
}

export const log = {
  error: (label: string, ...args: unknown[]): void => {
    console.error(...format(label, args));
  },
  warn: (label: string, ...args: unknown[]): void => {
    console.warn(...format(label, args));
  },
  info: (label: string, ...args: unknown[]): void => {
    console.log(...format(label, args));
  },
};
