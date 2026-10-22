/** 消息操作与触屏长按手势；移动或取消触摸时不会打开菜单。 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyText } from "@/lib/copyText";
import type { Translator } from "@shared/i18n";
import { Copy, MoreHorizontal, Quote, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  children: ReactNode;
  content: string;
  author: string;
  t: Translator;
  isPlaying: boolean;
  audioLabel: string;
  onSpeak?: () => void;
  onQuote: (text: string, author: string) => void;
};

/** 通过按钮、右键或触屏长按打开同一菜单，菜单条目满足手机触控尺寸。 */
export function ChatMessageMenu({
  children,
  content,
  author,
  t,
  isPlaying,
  audioLabel,
  onSpeak,
  onQuote,
}: Props) {
  const [open, setOpen] = useState(false);
  const press = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const longPressed = useRef(false);
  const quoting = useRef(false);
  const holding = useRef(false);
  const dismissAfter = useRef(0);
  const clearPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current.timer);
    },
    []
  );
  useEffect(() => {
    if (!open) return;
    const release = () => {
      if (!holding.current) return;
      holding.current = false;
      // 触屏的合成 click 可能落在菜单外，不能把刚长按打开的菜单关闭。
      dismissAfter.current = Date.now() + 350;
    };
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    return () => {
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
    };
  }, [open]);
  const actionable = Boolean(content.trim());
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <div
        className="chat-message-body"
        onPointerDown={event => {
          clearPress();
          longPressed.current = false;
          holding.current = false;
          if (
            !actionable ||
            event.pointerType !== "touch" ||
            !event.isPrimary ||
            (event.target as HTMLElement).closest("button,a,input,textarea")
          )
            return;
          press.current = {
            x: event.clientX,
            y: event.clientY,
            timer: setTimeout(() => {
              press.current = null;
              longPressed.current = true;
              holding.current = true;
              setOpen(true);
            }, 500),
          };
        }}
        onPointerMove={event => {
          const start = press.current;
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
          )
            clearPress();
        }}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onPointerLeave={clearPress}
        onClickCapture={event => {
          if (longPressed.current) {
            longPressed.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onContextMenu={event => {
          if (!actionable || (event.target as HTMLElement).closest("button,a"))
            return;
          event.preventDefault();
          if (press.current || longPressed.current) {
            longPressed.current = true;
            holding.current = true;
          }
          clearPress();
          setOpen(true);
        }}
      >
        {children}
        {actionable && (
          <div className="chat-message-actions">
            {onSpeak && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="chat-message-action"
                onClick={onSpeak}
                aria-label={audioLabel}
                aria-pressed={isPlaying}
                title={audioLabel}
              >
                {isPlaying ? (
                  <Square className="size-3.5 fill-current" />
                ) : (
                  <Volume2 className="size-3.5" />
                )}
              </Button>
            )}
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="chat-message-action"
                aria-label={t("chat:messageActions")}
                title={t("chat:messageActions")}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </div>
        )}
      </div>
      <DropdownMenuContent
        align="start"
        collisionPadding={12}
        className="chat-message-menu"
        onInteractOutside={event => {
          if (holding.current || Date.now() < dismissAfter.current)
            event.preventDefault();
        }}
        onCloseAutoFocus={event => {
          if (quoting.current) event.preventDefault();
          quoting.current = false;
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            void copyText(content).then(
              () => toast.success(t("chat:messageCopied")),
              () => toast.error(t("chat:messageCopyFailed"))
            );
          }}
        >
          <Copy />
          {t("chat:copyMessage")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            // 先让浮层关闭，再在同一点击手势内聚焦手机输入框。
            quoting.current = true;
            setOpen(false);
            onQuote(content, author);
          }}
        >
          <Quote />
          {t("chat:quoteMessage")}
        </DropdownMenuItem>
        {onSpeak && (
          <DropdownMenuItem onSelect={onSpeak}>
            {isPlaying ? <Square /> : <Volume2 />}
            {audioLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
