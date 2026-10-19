/** 递归脱敏对象中的凭据与邮箱，再交给控制台输出。 */

/** 始终完整遮盖的敏感字段名，遮盖方式不依赖值类型。 */
const ALWAYS_REDACT_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "cookieSecret",
  "jwt",
  "JWT_SECRET",
  "JWT",
  "code", // OAuth 一次性授权码
  "state", // OAuth 状态令牌
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

/** 根据字段名识别潜在凭据的模式。 */
const KEY_PATTERN = /(key|secret|token|password|credential)/i;

/** 按邮箱规则遮盖的字段名称。 */
const EMAIL_KEYS = new Set(["email", "Email", "userEmail"]);

const MAX_DEPTH = 5;
const MAX_ARRAY = 50;
const MAX_STRING = 500;

/** 返回固定脱敏标记，隐藏短值及敏感字段的长度。 */
function maskShort(): string {
  return "***";
}

/** 保留长文本首尾各两位，其余内容以星号遮盖。 */
function maskString(value: string): string {
  if (value.length <= 4) return maskShort();
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

/** 遮盖邮箱本地部分，保留首字符及域名用于排障。 */
function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return maskString(value);
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  // 仅保留邮箱用户名首字符，供日志区分用户。
  const safeLocal = local.slice(0, 1) + "***";
  return `${safeLocal}@${domain}`;
}

/**
 * 递归遮盖敏感字段并限制对象深度、数组长度与文本长度。
 *
 * @remarks Error 仅保留名称与消息；任意普通字符串中的凭据未做模式扫描。
 */
export function redact(input: unknown, depth = MAX_DEPTH): unknown {
  if (depth <= 0) return "[redacted:max-depth]";
  if (input === null || input === undefined) return input;

  // 基础类型直接处理。
  if (typeof input === "string") {
    return input.length > MAX_STRING
      ? input.slice(0, MAX_STRING) + "...[truncated]"
      : input;
  }
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "bigint") return input.toString();
  if (typeof input === "function" || typeof input === "symbol") return "[fn]";

  // 错误对象仅保留名称和消息，不输出调用栈或附加字段。
  if (input instanceof Error) {
    return { name: input.name, message: input.message };
  }

  // 数组逐项脱敏。
  if (Array.isArray(input)) {
    return input
      .slice(0, MAX_ARRAY)
      .map(v => redact(v, depth - 1))
      .concat(
        input.length > MAX_ARRAY ? [`...[+${input.length - MAX_ARRAY}]`] : []
      );
  }

  // 普通对象逐字段处理。
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (ALWAYS_REDACT_KEYS.has(k)) {
      // 高敏感字段完全替换，不暴露长度。
      out[k] = "***";
    } else if (KEY_PATTERN.test(k)) {
      // 按名称模式命中的字段保留首尾各两字符，便于比较日志中的变化。
      out[k] = typeof v === "string" ? maskString(v) : "[redacted]";
    } else if (EMAIL_KEYS.has(k) && typeof v === "string") {
      out[k] = maskEmail(v);
    } else {
      out[k] = redact(v, depth - 1);
    }
  }
  return out;
}

/** 为脱敏日志添加级别前缀并处理参数对象。 */
function format(label: string, args: unknown[]): unknown[] {
  return [label, ...args.map(a => redact(a))];
}

/** 提供 info、warn、error 三种脱敏控制台入口。 */
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
