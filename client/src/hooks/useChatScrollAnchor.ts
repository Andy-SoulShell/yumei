/** 调整窗口、软键盘或图片高度时，保留用户在最新消息或历史记录中的阅读位置。 */
import { useLayoutEffect, type RefObject } from "react";

export function useChatScrollAnchor(
  viewportRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  conversationId?: number | null
) {
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;
    const atBottom = () =>
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 48;
    // 初次进入或切换会话时先展示最新内容，之后才跟随用户的阅读意图。
    viewport.scrollTop = viewport.scrollHeight;
    let pinned = true;
    let width = viewport.clientWidth;
    let height = viewport.clientHeight;
    let scrollHeight = viewport.scrollHeight;
    const onScroll = () => {
      // 布局导致的滚动可能先于 ResizeObserver 到达，不把它当成用户向上翻历史。
      if (
        width === viewport.clientWidth &&
        height === viewport.clientHeight &&
        scrollHeight === viewport.scrollHeight
      )
        pinned = atBottom();
    };
    const observer = new ResizeObserver(() => {
      if (pinned) viewport.scrollTop = viewport.scrollHeight;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      scrollHeight = viewport.scrollHeight;
    });
    viewport.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [viewportRef, contentRef, conversationId]);
}
