/** 接收和上下文组装共用字符预算，保留全部已接受的连续补充。 */
import { runtimeInteger } from "./aiTaskRuntime";

export function chatContextLimits() {
  const total = runtimeInteger(
    "CHAT_CONTEXT_CHAR_LIMIT",
    80_000,
    64_000,
    160_000
  );
  return {
    total,
    platform: 14_000,
    followups: Math.min(48_000, total - 16_000),
    memory: 6_000,
    history: 16_000,
  };
}

type ContextMessage = { role: "user" | "assistant"; content: string };

/** 只舍弃完整的低优先级历史和资料块，不裁切JSON/分隔符或用户输入。 */
export function planChatContext(input: {
  platform: string;
  memory: string;
  summary: string;
  followups: ContextMessage[];
  previous: ContextMessage[];
}) {
  const limits = chatContextLimits();
  if (input.platform.length > limits.platform)
    throw new Error("Platform context exceeds configured reserve");
  const followupsSize = input.followups.reduce(
    (n, item) => n + item.content.length,
    0
  );
  if (followupsSize > limits.followups)
    throw new Error("Accepted follow-up context exceeds budget");
  let remaining = limits.total - input.platform.length - followupsSize;
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
