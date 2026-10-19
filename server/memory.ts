/**
 * Long-term memory service: extraction, selection, recall, capacity.
 *
 * Extraction is fire-and-forget from the chat path — a cheap LLM pass
 * over the recent window that returns structured JSON. Failures are
 * logged and swallowed; memory is an enhancement, never a chat blocker.
 */

import axios from "axios";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { memories, messages, type Memory } from "../drizzle/schema";
import {
  DUPLICATE_THRESHOLD,
  EXTRACTION_EVERY_N_MESSAGES,
  MEMORY_CATEGORIES,
  MEMORY_MAX_LENGTH,
  bigramOverlap,
  memoryCapacity,
  memoryInjectionK,
  scoreMemory,
} from "../shared/memory";
import { getDb } from "./db";
import { log } from "./_core/log";
import type { ChatProvider } from "./_core/chatProvider";

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const EXTRACTION_MODEL = "openai/gpt-4o-mini";

const extractionResultSchema = z.object({
  memories: z
    .array(
      z.object({
        category: z.enum(MEMORY_CATEGORIES),
        content: z
          .string()
          .min(2)
          .max(MEMORY_MAX_LENGTH * 2),
        importance: z.number().min(1).max(10),
      })
    )
    .max(10),
});

export type ExtractedMemory = z.infer<
  typeof extractionResultSchema
>["memories"][number];

const EXTRACTION_PROMPT = `你是一个记忆提取器。阅读下面这段用户和 AI 伴侣的对话，提取值得长期记住的关于**用户**的信息。

规则：
- 只提取用户主动透露的、未来对话中可能有用的信息；不要提取 AI 说的话或临时闲聊。
- category 取值：fact（稳定事实：职业/城市/生日等）、preference（喜好/厌恶）、event（发生过或计划中的事）、relationship（用户与 AI 伴侣之间的约定或共同经历）。
- content 用简洁的中文第三人称陈述，例如「用户下周二有一场产品经理面试」，不超过 ${MEMORY_MAX_LENGTH} 字。
- importance 1-10：日常琐事 1-3，有用的个人信息 4-7，重大事件/核心事实 8-10。
- 没有值得记的就返回空数组。

只输出 JSON，格式：{"memories":[{"category":"...","content":"...","importance":5}]}`;

/** Exported for unit tests: parse + validate a model response body. */
export function parseExtractionResponse(raw: string): ExtractedMemory[] {
  // Models occasionally wrap JSON in fences or prose — grab the outermost object.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const result = extractionResultSchema.safeParse(parsed);
    if (!result.success) return [];
    return result.data.memories.map(m => ({
      ...m,
      content: m.content.trim().slice(0, MEMORY_MAX_LENGTH),
    }));
  } catch {
    return [];
  }
}

async function callExtractionModel(
  provider: ChatProvider,
  transcript: string
): Promise<ExtractedMemory[]> {
  const response = await axios.post(
    `${provider.baseUrl}/chat/completions`,
    {
      model: provider.name === "deepseek" ? provider.model : EXTRACTION_MODEL,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      ...(provider.name === "deepseek"
        ? { thinking: { type: "disabled" }, max_tokens: 4096 }
        : {}),
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      timeout: 30_000,
    }
  );
  const content = response.data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? parseExtractionResponse(content) : [];
}

/**
 * Store extracted candidates with similarity dedupe: near-duplicates of
 * an existing memory reinforce it (weight bump + freshness) instead of
 * inserting a new row.
 */
export async function storeExtractedMemories(
  userId: string,
  girlfriendId: number,
  candidates: ExtractedMemory[]
): Promise<{ inserted: number; reinforced: number }> {
  const db = await getDb();
  if (!db || candidates.length === 0) return { inserted: 0, reinforced: 0 };

  const existing = await db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    );

  let inserted = 0;
  let reinforced = 0;

  for (const candidate of candidates) {
    const duplicate = existing.find(
      m =>
        bigramOverlap(candidate.content, m.content) >= DUPLICATE_THRESHOLD ||
        bigramOverlap(m.content, candidate.content) >= DUPLICATE_THRESHOLD
    );
    if (duplicate) {
      await db
        .update(memories)
        .set({
          weight: Math.min(100, duplicate.weight + 5),
          lastRecalledAt: new Date(),
        })
        .where(eq(memories.id, duplicate.id));
      reinforced += 1;
      continue;
    }

    const weight = Math.min(90, Math.max(10, candidate.importance * 10));
    await db
      .insert(memories)
      .values({
        userId,
        girlfriendId,
        category: candidate.category,
        content: candidate.content,
        weight,
      })
      // Exact-content collision (unique index) → reinforce instead.
      .onDuplicateKeyUpdate({
        set: { weight: sql`LEAST(100, ${memories.weight} + 5)` },
      });
    inserted += 1;
    existing.push({
      id: -1,
      userId,
      girlfriendId,
      category: candidate.category,
      content: candidate.content,
      weight,
      pinned: false,
      sourceMessageId: null,
      lastRecalledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { inserted, reinforced };
}

/** Evict lowest-value unpinned rows beyond the level-based capacity. */
export async function enforceMemoryCapacity(
  userId: string,
  girlfriendId: number,
  intimacyLevel: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const capacity = memoryCapacity(intimacyLevel);
  const rows = await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.girlfriendId, girlfriendId),
        eq(memories.pinned, false)
      )
    )
    .orderBy(asc(memories.weight), asc(memories.createdAt));

  const total = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    );

  const excess = (total[0]?.count ?? 0) - capacity;
  if (excess <= 0) return 0;

  const toDelete = rows.slice(0, excess).map(r => r.id);
  if (toDelete.length === 0) return 0;
  await db.delete(memories).where(inArray(memories.id, toDelete));
  return toDelete.length;
}

/**
 * Fire-and-forget extraction trigger, called after each assistant reply.
 * Runs once every EXTRACTION_EVERY_N_MESSAGES messages per conversation.
 */
export function maybeExtractMemories(params: {
  userId: string;
  girlfriendId: number;
  conversationId: number;
  intimacyLevel: number;
  provider: ChatProvider;
}): void {
  void (async () => {
    try {
      const db = await getDb();
      if (!db) return;

      const countRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(messages)
        .where(eq(messages.conversationId, params.conversationId));
      const messageCount = countRows[0]?.count ?? 0;
      if (
        messageCount === 0 ||
        messageCount % EXTRACTION_EVERY_N_MESSAGES !== 0
      ) {
        return;
      }

      const window = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, params.conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(EXTRACTION_EVERY_N_MESSAGES * 2);

      const transcript = window
        .reverse()
        .map(m => `${m.role === "user" ? "用户" : "AI"}：${m.content}`)
        .join("\n");

      const candidates = await callExtractionModel(params.provider, transcript);
      if (candidates.length === 0) return;

      await storeExtractedMemories(
        params.userId,
        params.girlfriendId,
        candidates
      );
      await enforceMemoryCapacity(
        params.userId,
        params.girlfriendId,
        params.intimacyLevel
      );
    } catch (error) {
      log.error("[memory] extraction failed (non-blocking)", error);
    }
  })();
}

// ---------------------------------------------------------------------------
// Selection / recall
// ---------------------------------------------------------------------------

/**
 * Pick the top-k relevant memories for this message and format them as a
 * system-prompt block. Recalled rows get lastRecalledAt refreshed.
 * Returns "" when there's nothing to inject.
 */
export async function buildMemoryPromptBlock(
  userId: string,
  girlfriendId: number,
  userMessage: string,
  intimacyLevel: number
): Promise<string> {
  const db = await getDb();
  if (!db) return "";

  const rows = await db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    );
  if (rows.length === 0) return "";

  const k = memoryInjectionK(intimacyLevel);
  const now = new Date();
  const top = rows
    .map(m => ({ memory: m, score: scoreMemory(m, userMessage, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(s => s.memory);

  if (top.length === 0) return "";

  // Refresh recall timestamps (fire-and-forget; selection already done).
  void db
    .update(memories)
    .set({ lastRecalledAt: now })
    .where(
      inArray(
        memories.id,
        top.map(m => m.id)
      )
    )
    .catch(() => {});

  const lines = top.map(m => `- ${m.content}`);
  return `\n\n【你记得的关于用户的事】\n${lines.join("\n")}\n自然地运用这些记忆（比如主动关心之前提过的事），但不要机械地罗列或逐条复述。`;
}

// ---------------------------------------------------------------------------
// CRUD for the memories page
// ---------------------------------------------------------------------------

export async function listMemories(
  userId: string,
  girlfriendId: number
): Promise<Memory[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    )
    .orderBy(
      desc(memories.pinned),
      desc(memories.weight),
      desc(memories.createdAt)
    );
}

export async function deleteMemory(userId: string, id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
}

export async function setMemoryPinned(
  userId: string,
  id: number,
  pinned: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(memories)
    .set({ pinned })
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
}

/** Most recent high-value "event" memory — used by proactive messages. */
export async function getFreshEventMemory(
  userId: string,
  girlfriendId: number
): Promise<Memory | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.girlfriendId, girlfriendId),
        eq(memories.category, "event")
      )
    )
    .orderBy(desc(memories.createdAt))
    .limit(1);
  const memory = rows[0];
  if (!memory) return null;
  // Only reference events from the last two weeks — older ones feel off.
  const ageDays =
    (Date.now() - new Date(memory.createdAt).getTime()) / 86_400_000;
  return ageDays <= 14 ? memory : null;
}
