/** 通过 shadcn CLI 引入并适配 YUMEI 的公共交互组件。 */
import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** 交互根节点，沿用公共主题和 Radix 交互约定。 */
const Popover = PopoverPrimitive.Root;

/** 触发入口，沿用公共主题和 Radix 交互约定。 */
const PopoverTrigger = PopoverPrimitive.Trigger;

/** 浮层定位锚点，沿用公共主题和 Radix 交互约定。 */
const PopoverAnchor = PopoverPrimitive.Anchor;

/** 浮层或折叠内容，沿用公共主题和 Radix 交互约定。 */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    { className, align = "center", sideOffset = 4, onEscapeKeyDown, ...props },
    ref
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        onEscapeKeyDown={event => {
          // Radix 在捕获阶段处理 Escape，须在这里保护命令输入法组合状态。
          const target = event.target;
          if (
            event.isComposing ||
            (target instanceof Element &&
              target.closest('[data-composing="true"]'))
          ) {
            event.preventDefault();
            return;
          }
          onEscapeKeyDown?.(event);
        }}
        className={cn(
          "glass-surface z-50 w-72 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[var(--radix-popover-content-transform-origin)]",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
