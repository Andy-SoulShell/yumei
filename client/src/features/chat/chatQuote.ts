/** 在聊天原文中识别引用，展示层将其与本次回复分开。 */
export type ChatQuote = {
  author: string;
  text: string;
  reply: string;
  sourceMessageId?: number;
};

/** 读取消息开头的作者与引用段落；普通文字或不完整标记保持原样。 */
export function parseChatQuote(content: string): ChatQuote | null {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (!lines[0]?.startsWith("> ") || !lines[1]?.startsWith("> ")) return null;
  const header = lines[0].slice(2).trim();
  const link = /^\[((?:\\.|[^\]\\])*)\]\(#message-([1-9]\d*)\)$/.exec(header);
  const sourceMessageId = link ? Number(link[2]) : undefined;
  const linked =
    sourceMessageId !== undefined && Number.isSafeInteger(sourceMessageId);
  const author = linked ? link![1].replace(/\\([\\\]])/g, "$1") : header;
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
    ...(linked ? { sourceMessageId } : {}),
  };
}

/** 沿用聊天原文保存引用，并以空行分隔用户本次回复。 */
export function formatChatQuote(
  quote: Pick<ChatQuote, "author" | "text" | "sourceMessageId">,
  reply: string
): string {
  const author = quote.author.replace(/[\r\n]+/g, " ").trim();
  const text = quote.text.replaceAll("\r\n", "\n").replaceAll("\n", "\n> ");
  const id = quote.sourceMessageId;
  const header =
    id !== undefined && Number.isSafeInteger(id) && id > 0
      ? `[${author.replace(/[\\\]]/g, "\\$&")}](#message-${id})`
      : author;
  return `> ${header}\n> ${text}\n\n${reply}`;
}

/** 新引用按 ID 精确定位；旧引用按原文寻找引用前最近的一条消息。 */
export function findQuoteSource(
  messages: readonly { id: number; content: string }[],
  quote: Pick<ChatQuote, "text" | "sourceMessageId">,
  beforeId = Infinity
): number | undefined {
  if (quote.sourceMessageId !== undefined)
    return messages.find(
      message => message.id === quote.sourceMessageId && message.id < beforeId
    )?.id;
  return messages.reduce<number | undefined>((found, message) => {
    const text = parseChatQuote(message.content)?.reply || message.content;
    return message.id < beforeId &&
      text.trim() === quote.text.trim() &&
      (found === undefined || message.id > found)
      ? message.id
      : found;
  }, undefined);
}
