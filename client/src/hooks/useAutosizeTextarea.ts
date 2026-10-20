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
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, value, enabled]);
}
