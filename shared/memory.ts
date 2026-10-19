/**
 * Long-term memory system — shared constants and pure scoring (M2).
 *
 * Design (docs/开发计划.md M2): memories are structured rows extracted
 * from conversations by a cheap LLM pass, then injected into the chat
 * system prompt by relevance. No vector database — at the per-companion
 * capacity below, in-process scoring over all rows is plenty.
 */

export const MEMORY_CATEGORIES = [
  "fact", // stable facts about the user (job, city, birthday…)
  "preference", // likes / dislikes
  "event", // things that happened or are planned ("interview tomorrow")
  "relationship", // shared history with the companion ("our first chat…")
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: "关于你",
  preference: "你的喜好",
  event: "最近的事",
  relationship: "我们之间",
};

/** Extraction cadence: run once every N messages in a conversation. */
export const EXTRACTION_EVERY_N_MESSAGES = 10;

/** Max stored memory content length (chars). */
export const MEMORY_MAX_LENGTH = 200;

/**
 * M2-5 intimacy tie-in: higher levels remember more…
 * level 1 → 30 memories, level 10 → 120.
 */
export function memoryCapacity(intimacyLevel: number): number {
  const level = Math.min(Math.max(intimacyLevel, 1), 10);
  return 20 + level * 10;
}

/** …and recall more per message: level 1 → 5, level 10 → 9. */
export function memoryInjectionK(intimacyLevel: number): number {
  const level = Math.min(Math.max(intimacyLevel, 1), 10);
  return Math.min(4 + Math.ceil(level / 2), 10);
}

// ---------------------------------------------------------------------------
// Relevance scoring (pure, unit-tested)
// ---------------------------------------------------------------------------

function normalizeForMatch(text: string): string {
  // Strip whitespace + common ASCII/CJK punctuation. (No \p{P} escapes —
  // the client tsconfig target doesn't allow the `u` regex flag.)
  return text
    .toLowerCase()
    .replace(/[\s!-/:-@[-`{-~。，、！？；：“”‘’（）《》【】…—·～\u3000]+/g, "");
}

function bigrams(text: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    result.add(text.slice(i, i + 2));
  }
  return result;
}

/**
 * Character-bigram overlap in [0, 1]: fraction of `a`'s bigrams present
 * in `b`. Works acceptably for mixed zh/en without a tokenizer.
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

/** Two memory contents this similar are treated as duplicates. */
export const DUPLICATE_THRESHOLD = 0.6;

/**
 * Freshness factor in [0.5, 1]: exponential decay with a ~14-day
 * half-life toward the 0.5 floor. Recalling a memory refreshes it,
 * so frequently-relevant memories stay hot.
 */
export function timeDecayFactor(lastTouchedAt: Date, now: Date = new Date()): number {
  const days = Math.max(0, (now.getTime() - lastTouchedAt.getTime()) / 86_400_000);
  return 0.5 + 0.5 * Math.exp(-days / 14);
}

export type ScorableMemory = {
  content: string;
  weight: number; // 0-100
  pinned: boolean;
  lastRecalledAt: Date | null;
  createdAt: Date;
};

/**
 * Relevance = base importance × freshness + keyword affinity + pin bonus.
 * Keyword affinity dominates when the user's message clearly touches a
 * memory; otherwise high-weight fresh memories float up.
 *
 * Affinity uses the max of both overlap directions: a short message
 * ("面试好紧张") hitting one key term of a longer memory should count,
 * and base score only spans ~0.5–1.0, so the multiplier is sized to let
 * any clear keyword hit outrank an unrelated high-weight memory.
 */
export function scoreMemory(
  memory: ScorableMemory,
  userMessage: string,
  now: Date = new Date()
): number {
  const freshness = timeDecayFactor(memory.lastRecalledAt ?? memory.createdAt, now);
  const base = (memory.weight / 100) * freshness;
  const overlap = Math.max(
    bigramOverlap(memory.content, userMessage),
    bigramOverlap(userMessage, memory.content)
  );
  const affinity = Math.min(2.5, 5 * overlap);
  const pin = memory.pinned ? 0.5 : 0;
  return base + affinity + pin;
}
