/** 通过 shadcn CLI 引入并适配 YUMEI 的公共交互组件。 */
import { Collapsible as CollapsiblePrimitive } from "radix-ui";

/** 交互根节点，沿用公共主题和 Radix 交互约定。 */
const Collapsible = CollapsiblePrimitive.Root;

/** 触发入口，沿用公共主题和 Radix 交互约定。 */
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

/** 浮层或折叠内容，沿用公共主题和 Radix 交互约定。 */
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
