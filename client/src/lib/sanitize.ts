/** 供未来 Markdown 展示复用的 HTML 标签剥离工具；当前聊天正文直接作为 React 文本渲染。 */

import DOMPurify from "dompurify";

/**
 * 移除输入中的 HTML 标签和属性，保留可安全作为文本处理的内容。
 *
 * @remarks 保留 Markdown 文本不代表链接协议已被验证；调用方仍需约束最终渲染器。
 */
export function sanitizeForMarkdown(input: string): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}
