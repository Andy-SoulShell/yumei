import { useI18n } from "@/lib/i18n";
/** 普通对话框与输入法组合状态协调。 */

import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import * as React from "react";

// 在对话框子组件之间共享输入法组合状态。
const DialogCompositionContext = React.createContext<{
  isComposing: () => boolean;
  setComposing: (composing: boolean) => void;
  justEndedComposing: () => boolean;
  markCompositionEnd: () => void;
}>({
  isComposing: () => false,
  setComposing: () => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

/** 读取最近对话框的输入法组合状态协调接口。 */
export const useDialogComposition = () =>
  React.useContext(DialogCompositionContext);

/** 提供输入法状态上下文的普通对话框根节点。 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const composingRef = React.useRef(false);
  const justEndedRef = React.useRef(false);
  const endTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextValue = React.useMemo(
    () => ({
      isComposing: () => composingRef.current,
      setComposing: (composing: boolean) => {
        composingRef.current = composing;
      },
      justEndedComposing: () => justEndedRef.current,
      markCompositionEnd: () => {
        justEndedRef.current = true;
        if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
        }
        endTimerRef.current = setTimeout(() => {
          justEndedRef.current = false;
        }, 150);
      },
    }),
    []
  );

  return (
    <DialogCompositionContext.Provider value={contextValue}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogCompositionContext.Provider>
  );
}

/** 触发普通对话框的交互入口。 */
function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/** 将普通对话框内容渲染到浮层容器。 */
function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

/** 触发普通对话框关闭的交互入口。 */
function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

/** 普通对话框背景遮罩及开关动画。 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/20 dark:bg-black/45",
        className
      )}
      {...props}
    />
  );
}

DialogOverlay.displayName = "DialogOverlay";

/** 组合弹窗主体、关闭按钮和输入法 Escape 保护。 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const { t } = useI18n();
  const { isComposing } = useDialogComposition();
  const openerRef = React.useRef<HTMLElement | null>(null);

  const handleEscapeKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      // 同时检查原生事件与上下文状态，兼容 Safari 组合事件时序。
      const isCurrentlyComposing = (e as any).isComposing || isComposing();

      // 输入法组合期间阻止 Escape 关闭弹窗。
      if (isCurrentlyComposing) {
        e.preventDefault();
        return;
      }

      // 其余情况继续传递调用方的 Escape 回调。
      onEscapeKeyDown?.(e);
    },
    [isComposing, onEscapeKeyDown]
  );

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "floating-surface bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        onEscapeKeyDown={handleEscapeKeyDown}
        onOpenAutoFocus={event => {
          const active = document.activeElement;
          openerRef.current =
            active instanceof HTMLElement && active !== document.body
              ? active
              : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={event => {
          onCloseAutoFocus?.(event);
          const opener = openerRef.current;
          if (
            !event.defaultPrevented &&
            opener?.isConnected &&
            !opener.matches(":disabled")
          ) {
            event.preventDefault();
            opener.focus({ preventScroll: true });
          }
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus-visible:ring-ring absolute top-2 right-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">{t("common:close2")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/** 普通对话框的标题与说明布局。 */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

/** 普通对话框底部操作布局。 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

/** 提供可访问名称的普通对话框标题。 */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

/** 普通对话框的辅助说明文本。 */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
