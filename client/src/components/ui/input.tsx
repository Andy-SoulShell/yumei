/** 支持输入法组合保护的单行输入框。 */

import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";

/** 封装统一输入样式，并协调输入法确认键与弹窗关闭事件。 */
function Input({
  className,
  type,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: React.ComponentProps<"input">) {
  // 对话框外使用空操作上下文，框内参与输入法状态协调。
  const dialogComposition = useDialogComposition();

  // 统一处理中文等输入法的组合事件。
  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLInputElement>({
    onKeyDown: e => {
      // 同时检查原生组合状态和刚结束组合的短暂窗口。
      const isComposing =
        (e.nativeEvent as any).isComposing ||
        dialogComposition.justEndedComposing();

      // 组合期间或刚结束时的 Enter 不触发业务提交。
      if (e.key === "Enter" && isComposing) {
        return;
      }

      // 正常按键交给调用方。
      onKeyDown?.(e);
    },
    onCompositionStart: e => {
      dialogComposition.setComposing(true);
      onCompositionStart?.(e);
    },
    onCompositionEnd: e => {
      // 标记组合刚结束，保护用于确认候选词的 Enter。
      dialogComposition.markCompositionEnd();
      // 延迟清除状态，兼容 Safari 先触发 compositionEnd 再触发 Escape 的时序。
      setTimeout(() => {
        dialogComposition.setComposing(false);
      }, 100);
      onCompositionEnd?.(e);
    },
  });

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { Input };
