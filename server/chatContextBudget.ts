/** 接收和上下文组装共用字符预算，保留全部已接受的连续补充。 */
import type { ProductConfig } from "../shared/productConfig";

/** 本轮接收和上下文规划共同使用发布的字符预算。 */
export function chatContextLimits(config: ProductConfig) {
  return { ...config.prompts.context, memory: config.memory.recall.maxChars };
}

type ContextMessage = { role: "user" | "assistant"; content: string };

/** 只舍弃完整的低优先级历史和资料块，不裁切JSON/分隔符或用户输入。 */
export function planChatContext(
  config: ProductConfig,
  input: {
    platform: string;
    memory: string;
    summary: string;
    followups: ContextMessage[];
    previous: ContextMessage[];
    additionalSystemPrompt?: string;
  }
) {
  const limits = chatContextLimits(config);
  const platformSize =
    input.platform.length + (input.additionalSystemPrompt?.length ?? 0);
  if (platformSize > limits.platform)
    throw new Error("Platform context exceeds configured reserve");
  const followupsSize = input.followups.reduce(
    (n, item) => n + item.content.length,
    0
  );
  if (followupsSize > limits.followups)
    throw new Error("Accepted follow-up context exceeds budget");
  let remaining = limits.total - platformSize - followupsSize;
  let systemPrompt = input.platform;
  for (const block of [input.memory, input.summary]) {
    if (block.length <= Math.min(remaining, limits.memory)) {
      systemPrompt += block;
      remaining -= block.length;
    }
  }
  let historyBudget = Math.min(remaining, limits.history);
  const previous: ContextMessage[] = [];
  for (const item of [...input.previous].reverse()) {
    if (item.content.length > historyBudget) continue;
    previous.unshift(item);
    historyBudget -= item.content.length;
  }
  return { systemPrompt, history: [...previous, ...input.followups] };
}
