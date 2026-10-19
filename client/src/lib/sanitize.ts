import DOMPurify from "dompurify";

/**
 * Strip raw HTML from LLM-generated content before it reaches Streamdown
 * (issue #9).
 *
 * Why: Streamdown is configured with `rehype-raw` internally, so any HTML
 * tags embedded in an assistant message render as actual HTML. An attacker
 * who can prompt-inject the model into emitting `<img src=x onerror=...>`
 * gets stored XSS that fires every time the conversation is loaded.
 *
 * What this function does: passes the string through DOMPurify with
 * `ALLOWED_TAGS=[]` and `KEEP_CONTENT=true`, which removes every HTML
 * tag while preserving the text inside. Markdown syntax (`**bold**`,
 * `# heading`, `[link](url)`, fenced code blocks, etc.) is plain text
 * from the HTML parser's perspective and is left untouched, so Streamdown
 * still renders it as markdown.
 *
 * What still works after sanitization:
 * - All standard markdown syntax
 * - Links, images via markdown `![alt](url)` (Streamdown emits the IMG)
 * - Code blocks, math, mermaid (Streamdown's controlled extensions)
 *
 * What is removed:
 * - Raw `<script>`, `<img onerror=...>`, `<iframe>`, etc.
 * - `javascript:` URLs in raw `<a href=...>` tags (those don't survive
 *   tag stripping)
 *
 * This is defense in depth on top of any future server-side sanitization.
 */
export function sanitizeForMarkdown(input: string): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}
