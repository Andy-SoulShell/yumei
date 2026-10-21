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
    let scrollingUp = false;
    let touchY: number | undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY || event.ctrlKey) return;
      scrollingUp = event.deltaY < 0;
      if (scrollingUp) pinned = false;
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY =
        event.touches.length === 1 ? event.touches[0].clientY : undefined;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) touchY = undefined;
      if (touchY === undefined) return;
      const nextY = event.touches[0].clientY;
      // 轻触按钮时的手指抖动不算上翻；达到拖动距离后才解除末尾跟随。
      if (Math.abs(nextY - touchY) < 8) return;
      scrollingUp = nextY > touchY;
      if (scrollingUp) pinned = false;
      touchY = nextY;
    };
    const onTouchEnd = () => {
      touchY = undefined;
    };
    const onScroll = () => {
      // 布局导致的滚动可能先于 ResizeObserver 到达，不把它当成用户向上翻历史。
      if (
        width === viewport.clientWidth &&
        height === viewport.clientHeight &&
        scrollHeight === viewport.scrollHeight
      )
        pinned =
          atBottom() &&
          (!scrollingUp ||
            viewport.scrollHeight -
              viewport.clientHeight -
              viewport.scrollTop <=
              1);
    };
    const observer = new ResizeObserver(() => {
      // 避免没有实际位移的写入中止 WebKit 的原生惯性滚动。
      if (
        pinned &&
        Math.abs(
          viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
        ) > 1
      )
        viewport.scrollTop = viewport.scrollHeight;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      scrollHeight = viewport.scrollHeight;
    });
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [viewportRef, contentRef, conversationId]);
}
