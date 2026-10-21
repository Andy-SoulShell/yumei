/** 长期记忆的分类、容量限制、文本相似度与召回排序规则。 */

import type { MemoryConfig } from "./aiConfig";
export type { MemoryCategory } from "./aiConfig";

/** 明确保存或更正请求才加速提取，疑问和拒绝保存不作为指令。 */
function hasExplicitMemoryRequest(message: string): boolean {
  return message.split(/(?<=[。！？!?;；\r\n])|\.(?=\s|$)/).some(part => {
    const text = part.trim();
    if (
      /(?:不要|別(?!忘)|别(?!忘)|不必|不用).{0,12}(?:记住|記住|记录|紀錄|记忆|記憶)|\b(?:do not|don't|never|not to)\b.{0,24}\b(?:remember|update|correct|revise|change|store)\b|覚え(?:ないで|なくて)|(?:記憶|覚えている内容).{0,16}(?:しないで|しなくて|ないで)|기억.{0,20}(?:하지\s*마|하지\s*말|하지\s*않)/i.test(
        text
      ) ||
      /[?？]\s*$/.test(text) ||
      /^\s*(?:do|does|did)\s+you\s+remember\b/i.test(text)
    )
      return false;
    return (
      /(?:^|[，,:：])\s*(?:(?:请|請)(?:你)?\s*)?(?:(?:麻烦|麻煩|拜托|拜託)(?:你)?\s*)?(?:帮我|幫我|你(?:要|得))?\s*(?:记住|記住)/.test(
        text
      ) ||
      /别忘了|別忘了|(?:更新|更正|纠正|糾正|修改|修正)(?:一下)?(?:你的?|你对我(?:的)?)?(?:记忆|記憶|记录|紀錄)|(?:把|将|將).{0,20}(?:记忆|記憶).{0,8}(?:更新|更正|修改|修正)|\b(?:please\s+remember|remember\s+(?:that|my|I\b))|\b(?:update|correct|revise|change)\s+(?:(?:your|the|my)\s+)?(?:memory|memories|what\s+you\s+remember)\b|覚えて|覚え直して|(?:記憶|覚えている内容)(?:を|の).{0,8}(?:更新|訂正|修正)して|기억해|기억(?:을|를)?.{0,8}(?:수정|정정|업데이트|갱신)해/i.test(
        text
      )
    );
  });
}

/** 首轮、明确保存/更正请求或每五轮成功文字对话后提取，不受图片消息影响。 */
export function shouldExtractMemories(
  completedChatRounds: number,
  userMessage: string,
  config: MemoryConfig
): boolean {
  if (!config.enabled || completedChatRounds < 1) return false;
  return (
    (config.extraction.firstRound && completedChatRounds === 1) ||
    completedChatRounds % config.extraction.everyRounds === 0 ||
    (config.extraction.explicitRequests &&
      hasExplicitMemoryRequest(userMessage))
  );
}

/** 根据发布的等级门槛选择记忆容量与日常召回数量。 */
export function memoryLevelRule(intimacyLevel: number, config: MemoryConfig) {
  return (
    [...config.levelRules]
      .reverse()
      .find(rule => rule.minLevel <= intimacyLevel) ?? config.levelRules[0]
  );
}
/** 读取当前等级的发布容量，置顶记忆不参与自动淘汰。 */
export function memoryCapacity(
  intimacyLevel: number,
  config: MemoryConfig
): number {
  return memoryLevelRule(intimacyLevel, config).capacity;
}
/** 明确回忆请求可使用整个容量，其余使用等级配置中的日常数量。 */
export function memoryInjectionK(
  intimacyLevel: number,
  userMessage: string,
  config: MemoryConfig
): number {
  if (
    config.recall.explicitUsesCapacity &&
    /记得|记不记得|記得|提过|提過|约定|約定|暗号|暗號|我.{0,20}(?:什么|哪|多少|叫)|\b(?:remember|recall|my\s+\w+)\b|覚え|私の|기억|내가/i.test(
      userMessage
    )
  )
    return memoryCapacity(intimacyLevel, config);
  return memoryLevelRule(intimacyLevel, config).recallCount;
}

// ---------------------------------------------------------------------------
// 相关性评分纯函数。
// ---------------------------------------------------------------------------

/** 统一大小写并去掉常见空白和标点，供文本匹配使用。 */
export function normalizeMemoryText(text: string): string {
  // 去除空白与常见中英文标点，供去重和关键词比较使用。
  return text
    .toLowerCase()
    .replace(/[\s!-/:-@[-`{-~。，、！？；：“”‘’（）《》【】…—·～\u3000]+/g, "");
}

/** 将相邻两个字符组成的片段去重，用于中英文混合文本匹配。 */
function bigrams(text: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    result.add(text.slice(i, i + 2));
  }
  return result;
}

/**
 * 计算 a 的双字符片段在 b 中出现的比例，返回 0 至 1。
 *
 * @remarks 结果具有方向性；任一规范化文本不足两个字符时返回 0。
 */
export function bigramOverlap(a: string, b: string): number {
  const na = normalizeMemoryText(a);
  const nb = normalizeMemoryText(b);
  if (na.length < 2 || nb.length < 2) return 0;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let hits = 0;
  ba.forEach(g => {
    if (bb.has(g)) hits += 1;
  });
  return hits / ba.size;
}

/** 按未触及时长计算新鲜度系数，结果从 1 指数衰减并趋近 0.5。 */
export function timeDecayFactor(
  lastTouchedAt: Date,
  config: MemoryConfig,
  now: Date = new Date()
): number {
  const days = Math.max(
    0,
    (now.getTime() - lastTouchedAt.getTime()) / 86_400_000
  );
  return (
    config.ranking.freshnessFloor +
    (1 - config.ranking.freshnessFloor) *
      Math.exp(-days / config.ranking.decayDays)
  );
}

/** 记忆排序所需的最小字段集合，权重范围为 0 至 100。 */
export type ScorableMemory = {
  content: string;
  weight: number; // 0-100
  pinned: boolean;
  lastRecalledAt: Date | null;
  createdAt: Date;
};

/** 结合重要性、新鲜度、文本重合度与置顶状态计算召回分数。 */
export function scoreMemory(
  memory: ScorableMemory,
  userMessage: string,
  config: MemoryConfig,
  now: Date = new Date()
): number {
  const freshness = timeDecayFactor(
    memory.lastRecalledAt ?? memory.createdAt,
    config,
    now
  );
  const base = (memory.weight / 100) * freshness;
  const overlap = Math.max(
    bigramOverlap(memory.content, userMessage),
    bigramOverlap(userMessage, memory.content)
  );
  const affinity = Math.min(
    config.ranking.affinityMax,
    config.ranking.affinityMultiplier * overlap
  );
  const pin = memory.pinned ? config.ranking.pinnedBonus : 0;
  return base + affinity + pin;
}
