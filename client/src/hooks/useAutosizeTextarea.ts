/** 内容和可用宽度变化时调整高度；最大高度与滚动由 CSS 控制。 */
import { useLayoutEffect, useRef, type RefObject } from "react";

export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  enabled = true
) {
  const previousValue = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      previousValue.current = null;
      return;
    }
    const appending =
      previousValue.current !== null && value.startsWith(previousValue.current);
    previousValue.current = value;
    const resize = () => {
      element.style.height = "0px";
      element.style.height = `${element.scrollHeight}px`;
    };
    // 连续输入多数不会换行；先看是否溢出，避免每个字符都清零高度并强制布局。
    if (appending) {
      const height = element.scrollHeight;
      if (height > element.clientHeight) element.style.height = `${height}px`;
    } else resize();
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
