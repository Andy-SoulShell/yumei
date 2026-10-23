/** 兼容 Safari 视觉视口与 Chrome 不同软键盘缩放策略。 */
import { useEffect } from "react";

export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    let layoutHeight = window.innerHeight;
    let layoutWidth = window.innerWidth;
    let keyboardOpen = false;
    let revealFrame: number | undefined;
    const revealInput = () => {
      const element = document.activeElement;
      if (
        !(element instanceof HTMLElement) ||
        !element.matches("input, textarea")
      )
        return;
      let scroller = element.parentElement;
      while (scroller) {
        if (
          /^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY) &&
          scroller.scrollHeight > scroller.clientHeight
        )
          break;
        scroller = scroller.parentElement;
      }
      if (!scroller) return;
      const bounds = scroller.getBoundingClientRect();
      const toolbar = scroller.querySelector<HTMLElement>(".page-toolbar");
      const top =
        Math.max(
          viewport.offsetTop,
          bounds.top,
          toolbar?.getBoundingClientRect().bottom ?? bounds.top
        ) + 8;
      const bottom =
        Math.min(viewport.offsetTop + viewport.height, bounds.bottom) - 8;
      const rect = element.getBoundingClientRect();
      if (!rect.height || bottom <= top) return;
      // 从当前滚动位置补偿，避免重复叠加浏览器已经完成的焦点滚动。
      if (rect.top < top || rect.height > bottom - top)
        scroller.scrollTop += rect.top - top;
      else if (rect.bottom > bottom) scroller.scrollTop += rect.bottom - bottom;
    };
    const update = (event?: Event) => {
      const element = document.activeElement;
      const editing =
        element instanceof HTMLElement &&
        ((element.matches(
          "input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])"
        ) &&
          !(
            element instanceof HTMLInputElement &&
            /^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(
              element.type
            )
          )) ||
          element.isContentEditable);
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      // 安卓旋转时可能直接报告被键盘压缩后的新高度；旧宽度提供旋转后的高度基线。
      if (layoutWidth !== window.innerWidth) {
        layoutHeight =
          touch && keyboardOpen
            ? Math.max(window.innerHeight, layoutWidth)
            : window.innerHeight;
        layoutWidth = window.innerWidth;
      }
      if ((!editing && !keyboardOpen) || window.innerHeight > layoutHeight)
        layoutHeight = window.innerHeight;
      // 布局一起缩小时只在触摸设备启用，避免桌面调整窗口误判为键盘。
      // 浏览器工具栏的小幅变化和用户捏合缩放仍交给浏览器处理。
      if (
        (editing || keyboardOpen) &&
        viewport.scale === 1 &&
        (window.innerHeight - viewport.height > 120 ||
          (touch && layoutHeight - viewport.height > 120))
      ) {
        keyboardOpen = true;
        document.documentElement.setAttribute("data-keyboard-open", "");
        style.setProperty(
          "--keyboard-viewport-height",
          `${Math.round(viewport.height)}px`
        );
        style.setProperty(
          "--keyboard-viewport-top",
          `${Math.max(0, Math.round(viewport.offsetTop))}px`
        );
        // 等根布局完成收缩后再检查焦点；用户手动平移视口时不抢回滚动位置。
        if (editing && event?.type !== "scroll") {
          if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
          revealFrame = requestAnimationFrame(revealInput);
        }
      } else {
        keyboardOpen = false;
        if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
        style.removeProperty("--keyboard-viewport-height");
        style.removeProperty("--keyboard-viewport-top");
        document.documentElement.removeAttribute("data-keyboard-open");
      }
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
      style.removeProperty("--keyboard-viewport-height");
      style.removeProperty("--keyboard-viewport-top");
      document.documentElement.removeAttribute("data-keyboard-open");
    };
  }, []);
}
