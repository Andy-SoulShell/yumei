/** 样式类组合工具，合并条件类并处理 Tailwind 冲突。 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 将条件类名展开后按 Tailwind 规则合并，后出现的冲突类优先。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
