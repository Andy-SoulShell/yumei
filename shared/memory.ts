/** 长期记忆的分类、容量限制、文本相似度与召回排序规则。 */

/** 允许提取和持久化的记忆分类标识。 */

export const MEMORY_CATEGORIES = [
  "fact", // 用户的稳定事实，例如工作、城市、生日
  "preference", // 喜好与厌恶
  "event", // 已发生或计划中的事件，例如明天面试
  "relationship", // 与角色共同经历的关系记忆
] as const;

/** 记忆分类，使用稳定英文标识与数据库对应。 */
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** 记忆分类在中文界面的展示名称。 */
export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: "关于你",
  preference: "你的喜好",
  event: "最近的事",
  relationship: "我们之间",
};

/** 常规记忆提取间隔，按成功文字对话的用户与助手消息总条数计算。 */
export const EXTRACTION_EVERY_N_MESSAGES = 10;

/** 首轮、明确要求记住信息或每五轮成功文字对话后提取，不受图片消息影响。 */
export function shouldExtractMemories(
  completedChatRounds: number,
  userMessage: string
): boolean {
  if (completedChatRounds < 1) return false;
  return (
    completedChatRounds === 1 ||
    (completedChatRounds * 2) % EXTRACTION_EVERY_N_MESSAGES === 0 ||
    /记住|記住|别忘了|別忘了|\b(?:please\s+remember|remember\s+(?:that|my|I\b))|覚えて|기억해/i.test(
      userMessage
    )
  );
}

/** 单条记忆保存的最大文本长度，按 JavaScript 字符串长度计算。 */
export const MEMORY_MAX_LENGTH = 200;

/** 根据亲密度计算记忆容量，等级限制在 1 至 10，容量为 30 至 120 条。 */
export function memoryCapacity(intimacyLevel: number): number {
  const level = Math.min(Math.max(intimacyLevel, 1), 10);
  return 20 + level * 10;
}

/** 根据亲密度计算单次最多注入的记忆条数，现有等级范围返回 5 至 9。 */
export function memoryInjectionK(intimacyLevel: number): number {
  const level = Math.min(Math.max(intimacyLevel, 1), 10);
  return Math.min(4 + Math.ceil(level / 2), 10);
}

// ---------------------------------------------------------------------------
// 相关性评分纯函数。
// ---------------------------------------------------------------------------

/** 统一大小写并去掉常见空白和标点，供文本匹配使用。 */
function normalizeForMatch(text: string): string {
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
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na.length < 2 || nb.length < 2) return 0;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let hits = 0;
  ba.forEach(g => {
    if (bb.has(g)) hits += 1;
  });
  return hits / ba.size;
}

/** 将相似记忆视为重复项的双字符重合阈值。 */
export const DUPLICATE_THRESHOLD = 0.6;

/** 按未触及时长计算新鲜度系数，结果从 1 指数衰减并趋近 0.5。 */
export function timeDecayFactor(
  lastTouchedAt: Date,
  now: Date = new Date()
): number {
  const days = Math.max(
    0,
    (now.getTime() - lastTouchedAt.getTime()) / 86_400_000
  );
  return 0.5 + 0.5 * Math.exp(-days / 14);
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
  now: Date = new Date()
): number {
  const freshness = timeDecayFactor(
    memory.lastRecalledAt ?? memory.createdAt,
    now
  );
  const base = (memory.weight / 100) * freshness;
  const overlap = Math.max(
    bigramOverlap(memory.content, userMessage),
    bigramOverlap(userMessage, memory.content)
  );
  const affinity = Math.min(2.5, 5 * overlap);
  const pin = memory.pinned ? 0.5 : 0;
  return base + affinity + pin;
}
