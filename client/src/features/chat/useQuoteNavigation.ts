/** 引用定位复用当前会话的分页查询，并隔离过期的异步跳转。 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Translator } from "@shared/i18n";
import { toast } from "sonner";
import { CHAT_NAVIGATE_EVENT } from "@/hooks/useChatScrollAnchor";
import { findQuoteSource, type ChatQuote } from "./chatQuote";

type Message = { id: number; content: string };
type PageResult = {
  data?: { pages: Message[][] };
  hasNextPage?: boolean;
  isError?: boolean;
};
type Options = {
  messages: Message[];
  query: {
    hasNextPage?: boolean;
    fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<PageResult>;
  };
  viewportRef: RefObject<HTMLDivElement | null>;
  scope: unknown;
  t: Translator;
};

/** 点击引用后补齐历史、居中原消息并高亮两秒；切换账号或会话即撤销旧跳转。 */
export function useQuoteNavigation(options: Options) {
  const { scope, viewportRef } = options;
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(false);
  const operation = useRef({ value: 0 });
  const highlight = useRef<{
    element: HTMLElement;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [loading, setLoading] = useState<{
    scope: unknown;
    fromId: number;
  } | null>(null);
  const clearHighlight = useCallback(() => {
    if (!highlight.current) return;
    clearTimeout(highlight.current.timer);
    highlight.current.element.removeAttribute("data-quote-highlighted");
    highlight.current = null;
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    const operations = operation.current;
    return () => {
      mounted.current = false;
      operations.value++;
      clearHighlight();
    };
  }, [scope, clearHighlight]);

  const jumpToQuote = useCallback(
    async (quote: ChatQuote, fromId = 0) => {
      if (!mounted.current || latest.current.scope !== scope) return;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const token = ++operation.current.value;
      const current = () =>
        mounted.current &&
        latest.current.scope === scope &&
        operation.current.value === token &&
        viewportRef.current === viewport;
      const frame = () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      clearHighlight();
      viewport.dispatchEvent(new Event(CHAT_NAVIGATE_EVENT));
      setLoading({ scope, fromId });
      try {
        let messages = latest.current.messages;
        let hasNext = latest.current.query.hasNextPage;
        let id = findQuoteSource(messages, quote, fromId || Infinity);
        while (id === undefined && hasNext) {
          const oldest = messages.reduce(
            (min, message) => Math.min(min, message.id),
            Infinity
          );
          // 已翻过目标 ID 时，说明原消息已不可用，不能用相同文字代替。
          if (
            quote.sourceMessageId !== undefined &&
            oldest <= quote.sourceMessageId
          )
            break;
          const top = viewport.scrollTop;
          const height = viewport.scrollHeight;
          const result = await latest.current.query.fetchNextPage({
            cancelRefetch: false,
          });
          if (!current()) return;
          if (result.isError) throw new Error("History unavailable");
          await frame();
          if (!current()) return;
          viewport.scrollTop = top + viewport.scrollHeight - height;
          messages = [
            ...(result.data?.pages.flat() ?? []),
            ...latest.current.messages,
          ];
          id = findQuoteSource(messages, quote, fromId || Infinity);
          hasNext = result.hasNextPage;
          // 同一页或空结果不再继续请求，避免失败或分页状态异常导致循环。
          if (messages.every(message => message.id >= oldest)) break;
        }
        if (!current()) return;
        if (id === undefined) {
          toast.info(latest.current.t("chat:originalUnavailable"));
          return;
        }
        let target = viewport.querySelector<HTMLElement>(
          `[data-message-id="${id}"]`
        );
        for (let attempt = 0; !target && attempt < 10; attempt++) {
          await frame();
          if (!current()) return;
          target = viewport.querySelector<HTMLElement>(
            `[data-message-id="${id}"]`
          );
        }
        if (!target) {
          toast.info(latest.current.t("chat:originalUnavailable"));
          return;
        }
        const reduced = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        const rect = target.getBoundingClientRect();
        // 分页期间为保留阅读位置可能仍停在末尾；实际跳转前再次解除跟随。
        viewport.dispatchEvent(new Event(CHAT_NAVIGATE_EVENT));
        viewport.scrollTo({
          top: Math.max(
            0,
            viewport.scrollTop +
              rect.top -
              viewport.getBoundingClientRect().top -
              Math.max(12, (viewport.clientHeight - rect.height) / 2)
          ),
          behavior: reduced ? "auto" : "smooth",
        });
        target.focus({ preventScroll: true });
        target.setAttribute("data-quote-highlighted", "true");
        const element = target;
        highlight.current = {
          element,
          timer: setTimeout(() => {
            element.removeAttribute("data-quote-highlighted");
            highlight.current = null;
          }, 2000),
        };
      } catch {
        if (current()) toast.error(latest.current.t("chat:originalLoadFailed"));
      } finally {
        if (current()) setLoading(null);
      }
    },
    [scope, viewportRef, clearHighlight]
  );

  return {
    jumpToQuote,
    jumpingFromMessageId:
      loading && loading.scope === scope ? loading.fromId : null,
  };
}
