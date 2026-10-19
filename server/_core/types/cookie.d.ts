/** 为当前 Cookie 解析调用补充本地类型声明，实际解析行为由依赖实现。 */

declare module "cookie" {
  /** 将 Cookie 请求头解析为名称和值的映射。 */
  export function parse(
    str: string,
    options?: Record<string, unknown>
  ): Record<string, string>;
}
