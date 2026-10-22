/** 引用作者与原文的轻量卡片，供输入预览和已发送消息复用。 */
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Loader2, Quote, X } from "lucide-react";
import type { ChatQuote } from "./chatQuote";

type Props = Pick<ChatQuote, "author" | "text"> & {
  onRemove?: () => void;
  removeLabel?: string;
  onNavigate?: () => void;
  navigateLabel?: string;
  loading?: boolean;
};

/** 用侧边线和次级文字区分引用；输入预览保留两行和独立取消入口。 */
export function ChatQuoteCard({
  author,
  text,
  onRemove,
  removeLabel,
  onNavigate,
  navigateLabel,
  loading,
}: Props) {
  const content = (
    <>
      <span className="chat-quote-author">
        <Quote aria-hidden="true" />
        <cite title={author}>{author}</cite>
        {onNavigate &&
          (loading ? (
            <Loader2
              className="chat-quote-jump-icon animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ArrowUpRight className="chat-quote-jump-icon" aria-hidden="true" />
          ))}
      </span>
      <span className="chat-quote-text">{text}</span>
    </>
  );
  return (
    <blockquote className="chat-quote-card" data-preview={Boolean(onRemove)}>
      {onNavigate ? (
        <Button
          type="button"
          variant="plain"
          size="none"
          className="chat-quote-jump"
          aria-label={navigateLabel}
          title={navigateLabel}
          aria-busy={loading || undefined}
          disabled={loading}
          onClick={onNavigate}
        >
          {content}
        </Button>
      ) : (
        content
      )}
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
