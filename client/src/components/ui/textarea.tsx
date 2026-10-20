/** 支持输入法组合保护的多行输入框。 */

import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";

/** 提供多行输入，并协调输入法组合事件与对话框状态。 */
function Textarea({
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: React.ComponentProps<"textarea">) {
  // 对话框外使用空操作上下文，框内参与输入法状态协调。
  const dialogComposition = useDialogComposition();

  // 统一处理中文等输入法的组合事件。
  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLTextAreaElement>({
    onKeyDown: e => {
      // 同时检查原生组合状态和刚结束组合的短暂窗口。
      const isComposing =
        (e.nativeEvent as any).isComposing ||
        dialogComposition.justEndedComposing();

      // 组合期间的 Enter 不触发业务回调；Shift+Enter 仍允许换行。
      if (e.key === "Enter" && !e.shiftKey && isComposing) {
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
    <textarea
      data-slot="textarea"
      className={cn(
        "surface-field border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { Textarea };
