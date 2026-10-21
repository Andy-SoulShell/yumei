/** 兼容 Safari 视觉视口与 Chrome 不同软键盘缩放策略。 */
import { useEffect } from "react";

export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    let layoutHeight = window.innerHeight;
    let layoutWidth = window.innerWidth;
    let awaitingRestore = false;
    const update = () => {
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
      // 横竖屏使用各自的布局基线；失焦到键盘关闭之间保留基线，允许连续切换输入框。
      if (layoutWidth !== window.innerWidth) {
        layoutWidth = window.innerWidth;
        layoutHeight = window.innerHeight;
        awaitingRestore = false;
      }
      if (window.innerHeight >= layoutHeight) awaitingRestore = false;
      if ((!editing && !awaitingRestore) || window.innerHeight > layoutHeight)
        layoutHeight = window.innerHeight;
      // 布局一起缩小时只在触摸设备启用，避免桌面调整窗口误判为键盘。
      // 浏览器工具栏的小幅变化和用户捏合缩放仍交给浏览器处理。
      if (
        editing &&
        viewport.scale === 1 &&
        (window.innerHeight - viewport.height > 120 ||
          (window.matchMedia?.("(pointer: coarse)").matches &&
            layoutHeight - viewport.height > 120))
      ) {
        awaitingRestore = true;
        document.documentElement.setAttribute("data-keyboard-open", "");
        style.setProperty(
          "--keyboard-viewport-height",
          `${Math.round(viewport.height)}px`
        );
        style.setProperty(
          "--keyboard-viewport-top",
          `${Math.max(0, Math.round(viewport.offsetTop))}px`
        );
      } else {
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
      style.removeProperty("--keyboard-viewport-height");
      style.removeProperty("--keyboard-viewport-top");
      document.documentElement.removeAttribute("data-keyboard-open");
    };
  }, []);
}
