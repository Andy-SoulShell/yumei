/** 长期记忆的异步提取、去重存储、容量淘汰和聊天召回。 */

import axios from "axios";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  girlfriends,
  memories,
  messages,
  type Memory,
} from "../drizzle/schema";
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
import { getDb, withUserTransaction } from "./db";
import { log } from "./_core/log";
import type { ChatProvider } from "./_core/chatProvider";

// ---------------------------------------------------------------------------
// 记忆提取。
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

/** 经结构校验后的单条模型提取结果，包含类别、正文和重要性。 */
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

/**
 * 提取模型回复中最外层 JSON，校验结构并裁剪记忆正文。
 *
 * @returns 无有效 JSON 或结构不符时返回空数组
 */
export function parseExtractionResponse(raw: string): ExtractedMemory[] {
  // 模型可能在 JSON 外添加代码围栏或说明，尝试提取最外层对象。
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

/** 通过当前聊天 Provider 提取记忆；OpenRouter 使用固定轻量模型。 */
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

/** 在用户事务内保存候选记忆，使用真实插入 ID 并逐次累加强化权重。 */
export async function storeExtractedMemories(
  userId: string,
  girlfriendId: number,
  candidates: ExtractedMemory[]
): Promise<{ inserted: number; reinforced: number }> {
  if (candidates.length === 0) return { inserted: 0, reinforced: 0 };
  return withUserTransaction(userId, async tx => {
    const [role] = await tx
      .select({ id: girlfriends.id })
      .from(girlfriends)
      .where(
        and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
      );
    if (!role) return { inserted: 0, reinforced: 0 };
    const existing = await tx
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.girlfriendId, girlfriendId)
        )
      )
      .for("update");
    let inserted = 0;
    let reinforced = 0;
    for (const candidate of candidates) {
      const duplicate = existing.find(
        m =>
          m.content === candidate.content ||
          bigramOverlap(candidate.content, m.content) >= DUPLICATE_THRESHOLD ||
          bigramOverlap(m.content, candidate.content) >= DUPLICATE_THRESHOLD
      );
      if (duplicate) {
        duplicate.weight = Math.min(100, duplicate.weight + 5);
        duplicate.lastRecalledAt = new Date();
        await tx
          .update(memories)
          .set({
            weight: duplicate.weight,
            lastRecalledAt: duplicate.lastRecalledAt,
          })
          .where(eq(memories.id, duplicate.id));
        reinforced++;
      } else {
        const [result] = await tx
          .insert(memories)
          .values({
            userId,
            girlfriendId,
            category: candidate.category,
            content: candidate.content,
            weight: Math.min(90, Math.max(10, candidate.importance * 10)),
          });
        const [row] = await tx
          .select()
          .from(memories)
          .where(eq(memories.id, Number(result.insertId)));
        existing.push(row);
        inserted++;
      }
    }
    return { inserted, reinforced };
  });
}

/**
 * 按等级容量淘汰低权重、较旧且未置顶的记忆。
 *
 * @remarks 置顶项参与总容量计数但不会被淘汰，全部置顶时可超出容量。
 */
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
 * 在助手回复完成后异步检查提取间隔，并触发提取与容量整理。
 *
 * @remarks 间隔按用户与助手消息总条数计算；失败仅写日志，不阻塞聊天响应。
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
// 记忆筛选与召回。
// ---------------------------------------------------------------------------

/**
 * 按当前消息相关性选取记忆，生成系统提示词片段。
 *
 * @returns 无记忆时返回空字符串
 * @remarks 被选记忆的召回时间异步刷新，刷新失败不会阻断回答。
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

  // 筛选已完成，异步更新时间戳，失败不影响本次召回。
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
// 记忆页面的增删改查。
// ---------------------------------------------------------------------------

/** 按置顶、权重及创建时间读取用户在指定角色下的记忆。 */
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

/** 按用户归属删除一条记忆。 */
export async function deleteMemory(userId: string, id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
}

/** 按用户归属设置或取消记忆置顶。 */
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

/**
 * 读取用户与角色最近十四天内创建的最新事件记忆。
 *
 * @remarks 当前按创建时间取最新事件，不额外按重要性筛选。
 */
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
  // 只选取最近两周的事件记忆，避免主动消息引用过旧事件。
  const ageDays =
    (Date.now() - new Date(memory.createdAt).getTime()) / 86_400_000;
  return ageDays <= 14 ? memory : null;
}
