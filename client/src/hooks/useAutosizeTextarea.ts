/** 内容和可用宽度变化时调整高度；最大高度与滚动由 CSS 控制。 */
import { useLayoutEffect, type RefObject } from "react";

export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  enabled = true
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const resize = () => {
      element.style.height = "0px";
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    let width = element.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      // 不在 ResizeObserver 回调内改被观察元素的高度，避免 WebKit 的循环通知。
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, value, enabled]);
}
