/** 通过 shadcn CLI 引入并适配 YUMEI 的公共交互组件。 */
"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

/** 互斥选项组，沿用公共主题和 Radix 交互约定。 */
const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  );
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

/** 可选择条目，沿用公共主题和 Radix 交互约定。 */
const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary shadow focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-3.5 w-3.5 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

/** 富内容单选项，保留 Radix 的方向键、焦点与表单语义。 */
function RadioGroupChoice({
  className,
  variant = "card",
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item> & {
  /** card 适合主题及角色卡片，segment 适合一排互斥选项。 */
  variant?: "card" | "segment";
}) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-choice"
      className={cn(
        "min-w-0 rounded-xl text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        variant === "card"
          ? "bg-muted/40 hover:bg-accent data-[state=checked]:bg-primary/10"
          : "inline-flex h-9 items-center justify-center gap-2 bg-secondary/70 px-3 text-sm font-medium hover:bg-accent data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    />
  );
}

export { RadioGroup, RadioGroupItem, RadioGroupChoice };
