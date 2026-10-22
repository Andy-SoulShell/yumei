/** 在聊天原文中识别引用，展示层将其与本次回复分开。 */
export type ChatQuote = {
  author: string;
  text: string;
  reply: string;
};

/** 读取消息开头的作者与引用段落；普通文字或不完整标记保持原样。 */
export function parseChatQuote(content: string): ChatQuote | null {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (!lines[0]?.startsWith("> ") || !lines[1]?.startsWith("> ")) return null;
  const author = lines[0].slice(2).trim();
  let end = 1;
  while (lines[end]?.startsWith("> ")) end++;
  const text = lines
    .slice(1, end)
    .map(line => line.slice(2))
    .join("\n");
  if (!author || !text.trim()) return null;
  const reply = lines.slice(end);
  if (reply[0] === "") reply.shift();
  return {
    author,
    text,
    reply: reply.join("\n"),
  };
}

/** 沿用聊天原文保存引用，并以空行分隔用户本次回复。 */
export function formatChatQuote(
  quote: Pick<ChatQuote, "author" | "text">,
  reply: string
): string {
  const author = quote.author.replace(/[\r\n]+/g, " ").trim();
  const text = quote.text.replaceAll("\r\n", "\n").replaceAll("\n", "\n> ");
  return `> ${author}\n> ${text}\n\n${reply}`;
}
