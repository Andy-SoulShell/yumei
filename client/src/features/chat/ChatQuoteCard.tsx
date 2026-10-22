/** 引用作者与原文的轻量卡片，供输入预览和已发送消息复用。 */
import { Button } from "@/components/ui/button";
import { Quote, X } from "lucide-react";
import type { ChatQuote } from "./chatQuote";
type Props = Pick<ChatQuote, "author" | "text"> & {
  onRemove?: () => void;
  removeLabel?: string;
};
/** 用侧边线和次级文字区分引用；输入预览保留两行和独立取消入口。 */
export function ChatQuoteCard({ author, text, onRemove, removeLabel }: Props) {
  return (
    <blockquote className="chat-quote-card" data-preview={Boolean(onRemove)}>
      <div className="chat-quote-author">
        <Quote aria-hidden="true" />
        <cite title={author}>{author}</cite>
      </div>
      <p className="chat-quote-text">{text}</p>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="chat-quote-remove"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={event => {
            event.preventDefault();
            onRemove();
          }}
        >
          <X className="size-4" />
        </Button>
      )}
    </blockquote>
  );
}
