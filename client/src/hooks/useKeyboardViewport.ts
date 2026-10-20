/** iOS 等只缩小视觉视口的浏览器中，让输入区跟随软键盘上沿。 */
import { useEffect } from "react";

export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    const update = () => {
      const element = document.activeElement;
      const editing =
        element instanceof HTMLElement &&
        (element.matches(
          "input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])"
        ) ||
          element.isContentEditable);
      // 不把浏览器工具栏或用户捏合缩放误判为软键盘。
      if (
        editing &&
        viewport.scale === 1 &&
        window.innerHeight - viewport.height > 120
      ) {
        style.setProperty(
          "--keyboard-viewport-height",
          `${Math.round(viewport.height)}px`
        );
      } else {
        style.removeProperty("--keyboard-viewport-height");
      }
    };
    viewport.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      style.removeProperty("--keyboard-viewport-height");
    };
  }, []);
}
