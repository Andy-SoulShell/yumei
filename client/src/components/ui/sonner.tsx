/** 全局短消息提示容器。 */

import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { createPortal } from "react-dom";

/** 使用实际显示模式和语义颜色的全局提示容器。 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const { t } = useI18n();

  // 键盘状态下应用根节点固定定位，提示需独立于它的层叠上下文。
  return createPortal(
    <div onPointerDown={event => event.stopPropagation()}>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        position="top-center"
        visibleToasts={1}
        duration={3000}
        closeButton
        toastOptions={{ closeButtonAriaLabel: t("common:close2") }}
        offset={{
          top: "calc(var(--keyboard-viewport-top, 0px) + max(12px, var(--safe-area-top)))",
        }}
        mobileOffset={{
          top: "calc(var(--keyboard-viewport-top, 0px) + max(12px, var(--safe-area-top)))",
          left: 16,
          right: 16,
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
          } as React.CSSProperties
        }
        {...props}
      />
    </div>,
    document.body
  );
};

export { Toaster };
