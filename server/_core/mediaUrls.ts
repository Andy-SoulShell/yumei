/** 在接口响应边界将本站媒体链接转成同源路径，使历史文件可跨本机访问地址使用。 */
import { ENV } from "./env";
import { getAuthOriginOptions } from "./authOrigins";

const mediaHosts = new Set(
  getAuthOriginOptions(ENV.publicUrl, true).trustedOrigins.map(
    origin => new URL(origin).host
  )
);
const mediaFields = new Set([
  "url",
  "imageUrl",
  "avatarUrl",
  "referenceImageUrl",
  "audioUrl",
  "girlfriendImage",
]);

/** 仅转换本站文件路由，保留外部 CDN、预签名链接和其他服务地址。 */
function toSameOriginMediaUrl(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.pathname.startsWith("/files/") && mediaHosts.has(url.host))
      return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // 无法解析的历史字符串按原样返回，不影响同一响应中的其他资料。
  }
  return value;
}

/**
 * 转换嵌套列表与普通对象中的媒体字段，保留聊天正文、日期及其他业务值。
 * @remarks 只处理返回副本，不改数据库记录或供外部图片服务读取的内部绝对地址。
 */
export function normalizeMediaResponse<T>(data: T): T {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [
        key,
        mediaFields.has(key) && typeof field === "string"
          ? toSameOriginMediaUrl(field)
          : visit(field),
      ])
    );
  }
  return visit(data) as T;
}
