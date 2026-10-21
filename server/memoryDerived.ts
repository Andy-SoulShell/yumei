import { getPublishedProductConfig } from "./repositories/productConfig";
import type { ProductConfig } from "../shared/productConfig";
/** 有来源、版本及接收方绑定的语义索引和会话摘要。 */
import axios from "axios";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  memoryCosineSimilarity,
  memorySourceDay,
  validMemoryVector,
} from "../shared/memorySemantics";
import {
  conversations,
  conversationSummaries,
  girlfriends,
  memories,
  memoryEmbeddings,
  memoryExtractionJobs,
  messages,
  notifications,
  proactiveContacts,
  type Memory,
} from "../drizzle/schema";
import { resolveChatProvider, type ChatProvider } from "./_core/chatProvider";
import { getDb, type DbTransaction, withUserTransaction } from "./database";
import { memoryFeatureEnabled, runMeteredAiTask } from "./aiTaskRuntime";
import { getUserApiConfig } from "./repositories/apiConfig";

const endpointHash = (provider: ChatProvider) =>
  createHash("sha256").update(provider.baseUrl).digest("hex");

/** 中英文完整句界共享给事实提取和摘要来源校验，英文小数不拆句。 */
export function memoryStatementRanges(source: string) {
  const ranges: { index: number; value: string }[] = [];
  let start = 0;
  for (const match of Array.from(
    source.matchAll(/[。！？!?；;\r\n]+|\.(?=\s|$)/g)
  )) {
    const end = match.index! + match[0].length;
    if (source.slice(start, end).trim())
      ranges.push({ index: start, value: source.slice(start, end) });
    start = end;
  }
  if (source.slice(start).trim())
    ranges.push({ index: start, value: source.slice(start) });
  return ranges;
}

/** 内部任务模型与当前服务一致，显式覆盖也不能混用服务命名空间。 */
export async function memoryTaskModel(
  userId: string,
  provider: ChatProvider,
  configuration?: ProductConfig
) {
  const configured = (configuration ?? (await getPublishedProductConfig()))
    .memory.extraction.models[provider.name];
  if (provider.name === "deepseek") {
    if (configured && !/^deepseek[-\w.]*$/i.test(configured))
      throw new Error("Memory model does not belong to the selected provider");
    return configured || provider.model;
  }
  return (
    configured || (await getUserApiConfig(userId))?.llmModel || provider.model
  );
}

/** 无效化与遗忘在业务事务内完成；epoch 防止已经发出的请求迟到复活。 */
export async function invalidateMemoryDerived(
  tx: DbTransaction,
  userId: string,
  girlfriendId: number,
  enabled?: boolean
) {
  const [boundary] = await tx
    .select({ id: sql<number>`COALESCE(MAX(${messages.id}), 0)` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.girlfriendId, girlfriendId)
      )
    );
  await tx
    .update(girlfriends)
    .set({
      memoryEpoch: sql`${girlfriends.memoryEpoch} + 1`,
      memoryForgottenThroughId: Number(boundary?.id ?? 0),
      ...(enabled === undefined ? {} : { memoryEnabled: enabled }),
    })
    .where(
      and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
    );
  await tx
    .delete(memoryEmbeddings)
    .where(
      and(
        eq(memoryEmbeddings.userId, userId),
        eq(memoryEmbeddings.girlfriendId, girlfriendId)
      )
    );
  await tx
    .delete(conversationSummaries)
    .where(
      and(
        eq(conversationSummaries.userId, userId),
        eq(conversationSummaries.girlfriendId, girlfriendId)
      )
    );
  await tx
    .delete(memoryExtractionJobs)
    .where(
      and(
        eq(memoryExtractionJobs.userId, userId),
        eq(memoryExtractionJobs.girlfriendId, girlfriendId)
      )
    );
  // Notifications currently have no source ID; discard this role's historical previews when source data changes.
  await tx
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.girlfriendId, girlfriendId)
      )
    );
  await tx
    .update(proactiveContacts)
    .set({ status: "cancelled", leaseToken: null, leaseUntil: null })
    .where(
      and(
        eq(proactiveContacts.userId, userId),
        eq(proactiveContacts.girlfriendId, girlfriendId),
        inArray(proactiveContacts.status, ["pending", "delivering"])
      )
    );
}

/** 每次外部调用前后都核对服务和凭据来源，不隐式改用另一接收方。 */
export async function sameMemoryRouting(
  userId: string,
  expected: ChatProvider
) {
  const current = await resolveChatProvider(userId);
  return (
    !!current.apiKey &&
    current.name === expected.name &&
    current.baseUrl === expected.baseUrl &&
    current.isByok === expected.isByok
  );
}

/** DeepSeek 未提供此处所需 embedding 能力，显式模型仅在当前 OpenRouter 内使用。 */
export function memorySemanticConfiguration(
  provider: ChatProvider,
  config: ProductConfig
) {
  const model = config.memory.semantic.model;
  return {
    supported: provider.name === "openrouter",
    configured: provider.name === "openrouter" && !!model,
    provider: provider.name,
    model,
  };
}

async function activeRole(
  userId: string,
  girlfriendId: number,
  policy?: ProductConfig
) {
  const db = (await getDb())!;
  const [role] = await db
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, girlfriendId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    );
  return role?.memoryEnabled && (await memoryFeatureEnabled(policy))
    ? role
    : null;
}

async function embed(
  userId: string,
  girlfriendId: number,
  provider: ChatProvider,
  model: string,
  input: string[],
  kind: "memory_index" | "memory_query",
  memoryEpoch: number,
  policy: Awaited<ReturnType<typeof getPublishedProductConfig>>
) {
  if (!(await sameMemoryRouting(userId, provider)))
    throw new Error("Memory routing changed");
  const raw = await runMeteredAiTask(
    {
      userId,
      girlfriendId,
      memoryEpoch,
      kind,
      provider: provider.name,
      model,
      isByok: provider.isByok,
      promptVersion: `product-config/${policy.revision}:vector`,
    },
    async signal => {
      const response = await axios.post(
        `${provider.baseUrl}/embeddings`,
        { model, input },
        {
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
        }
      );
      return { value: response.data, usage: response.data?.usage };
    },
    policy
  );
  const payload = z
    .object({
      data: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          embedding: z.array(z.number()),
        })
      ),
    })
    .parse(raw);
  if (payload.data.length !== input.length)
    throw new Error("Invalid embedding count");
  const vectors = input.map(
    (_text, index) => payload.data.find(item => item.index === index)?.embedding
  );
  if (
    vectors.some(vector => !validMemoryVector(vector)) ||
    new Set(vectors.map(vector => vector!.length)).size !== 1
  )
    throw new Error("Invalid memory embedding vectors");
  if (!(await sameMemoryRouting(userId, provider)))
    throw new Error("Memory routing changed");
  return vectors as number[][];
}

/** 批量创建当前版本索引；调用期间的编辑、遗忘、暂停都使提交失效。 */
export async function indexMemoryVersions(
  userId: string,
  girlfriendId: number,
  provider?: ChatProvider,
  configuration?: Awaited<ReturnType<typeof getPublishedProductConfig>>
) {
  const policy = configuration ?? (await getPublishedProductConfig());
  const role = await activeRole(userId, girlfriendId, policy);
  if (!role) return;
  provider ??= await resolveChatProvider(userId, policy);
  const config = memorySemanticConfiguration(provider, policy);
  if (!provider.apiKey || !config.configured || !config.model) return;
  const db = (await getDb())!;
  const rows = await db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    );
  const indexed = await db
    .select()
    .from(memoryEmbeddings)
    .where(
      and(
        eq(memoryEmbeddings.userId, userId),
        eq(memoryEmbeddings.girlfriendId, girlfriendId)
      )
    );
  const pending = rows
    .filter(
      memory =>
        !indexed.some(
          index =>
            index.memoryId === memory.id &&
            index.contentVersion === memory.contentVersion &&
            index.memoryEpoch === role.memoryEpoch &&
            index.provider === provider!.name &&
            index.baseUrl === endpointHash(provider!) &&
            index.isByok === provider!.isByok &&
            index.model === config.model
        )
    )
    .slice(0, policy.memory.semantic.batchSize);
  if (!pending.length) return;
  const vectors = await embed(
    userId,
    girlfriendId,
    provider,
    config.model,
    pending.map(memory => memory.content),
    "memory_index",
    role.memoryEpoch,
    policy
  );
  await withUserTransaction(userId, async tx => {
    const [current] = await tx
      .select()
      .from(girlfriends)
      .where(
        and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
      )
      .for("update");
    if (
      !current?.memoryEnabled ||
      current.deletedAt ||
      current.memoryEpoch !== role.memoryEpoch ||
      !(await memoryFeatureEnabled()) ||
      (await getPublishedProductConfig()).revision !== policy.revision
    )
      return;
    const latest = await tx
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.girlfriendId, girlfriendId)
        )
      )
      .for("update");
    for (let index = 0; index < pending.length; index++) {
      const memory = pending[index];
      if (
        !latest.some(
          item =>
            item.id === memory.id &&
            item.contentVersion === memory.contentVersion &&
            item.content === memory.content
        )
      )
        continue;
      const value = {
        memoryId: memory.id,
        userId,
        girlfriendId,
        contentVersion: memory.contentVersion,
        memoryEpoch: role.memoryEpoch,
        provider: provider!.name,
        baseUrl: endpointHash(provider!),
        model: config.model!,
        isByok: provider!.isByok,
        dimensions: vectors[index].length,
        vector: vectors[index],
      };
      await tx
        .insert(memoryEmbeddings)
        .values(value)
        .onDuplicateKeyUpdate({ set: value });
    }
  });
}

/** 实际余弦检索路径，返回后再次按 epoch/内容版本过滤，删除中的向量不会回流。 */
export async function semanticMemoryScores(
  userId: string,
  girlfriendId: number,
  query: string,
  configuration?: Awaited<ReturnType<typeof getPublishedProductConfig>>
): Promise<Map<number, number>> {
  const policy = configuration ?? (await getPublishedProductConfig());
  const role = await activeRole(userId, girlfriendId, policy);
  if (!role) return new Map();
  const provider = await resolveChatProvider(userId, policy);
  const config = memorySemanticConfiguration(provider, policy);
  if (!provider.apiKey || !config.configured || !config.model) return new Map();
  const db = (await getDb())!;
  const indexed = await db
    .select()
    .from(memoryEmbeddings)
    .where(
      and(
        eq(memoryEmbeddings.userId, userId),
        eq(memoryEmbeddings.girlfriendId, girlfriendId),
        eq(memoryEmbeddings.memoryEpoch, role.memoryEpoch),
        eq(memoryEmbeddings.provider, provider.name),
        eq(memoryEmbeddings.baseUrl, endpointHash(provider)),
        eq(memoryEmbeddings.model, config.model),
        eq(memoryEmbeddings.isByok, provider.isByok)
      )
    );
  if (!indexed.length) return new Map();
  const [vector] = await embed(
    userId,
    girlfriendId,
    provider,
    config.model,
    [query],
    "memory_query",
    role.memoryEpoch,
    policy
  );
  const current = await activeRole(userId, girlfriendId, policy);
  if (!current || current.memoryEpoch !== role.memoryEpoch) return new Map();
  const latest = await db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    );
  const scores = new Map<number, number>();
  for (const row of indexed) {
    if (
      row.dimensions !== vector.length ||
      row.vector.length !== vector.length ||
      !validMemoryVector(row.vector) ||
      !latest.some(
        memory =>
          memory.id === row.memoryId &&
          memory.contentVersion === row.contentVersion
      )
    )
      continue;
    const similarity = memoryCosineSimilarity(vector, row.vector);
    if (similarity !== null) scores.set(row.memoryId, similarity);
  }
  return scores;
}

const summarySchema = (config: ProductConfig["memory"]) =>
  z.object({
    memoryIds: z.array(z.number().int()).max(config.summary.factLimit),
    topics: z
      .array(
        z.object({
          sourceMessageId: z.number().int(),
          speaker: z.enum(["user", "assistant"]),
          quote: z.string().min(1).max(config.summary.maxQuoteLength),
          open: z.boolean(),
        })
      )
      .max(config.summary.maxTopics),
  });

/** 摘要仅选取仍有效事实和完整已完成原话；模型不能自由写入无来源结论。 */
export async function generateMemorySummary(
  userId: string,
  girlfriendId: number,
  conversationId: number,
  throughMessageId: number,
  provider?: ChatProvider,
  configuration?: Awaited<ReturnType<typeof getPublishedProductConfig>>
) {
  const policy = configuration ?? (await getPublishedProductConfig());
  const role = await activeRole(userId, girlfriendId, policy);
  if (!role || !policy.memory.summary.enabled) return;
  provider ??= await resolveChatProvider(userId, policy);
  if (!provider.apiKey || !(await sameMemoryRouting(userId, provider))) return;
  const db = (await getDb())!;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
        eq(conversations.girlfriendId, girlfriendId)
      )
    );
  if (!conversation) return;
  const facts = await db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    )
    .orderBy(desc(memories.weight))
    .limit(policy.memory.summary.factLimit);
  const window = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        lte(messages.id, throughMessageId),
        sql`${messages.id} > ${role.memoryForgottenThroughId}`,
        eq(messages.generationStatus, "succeeded"),
        isNull(messages.imageUrl)
      )
    )
    .orderBy(desc(messages.id))
    .limit(policy.memory.summary.sourceMessageLimit);
  if (!facts.length && !window.length) return;
  const model = await memoryTaskModel(userId, provider, policy);
  const raw = await runMeteredAiTask(
    {
      userId,
      girlfriendId,
      kind: "summary",
      memoryEpoch: role.memoryEpoch,
      provider: provider.name,
      model,
      isByok: provider.isByok,
      promptVersion: `product-config/${policy.revision}:summary`,
    },
    async signal => {
      const response = await axios.post(
        `${provider!.baseUrl}/chat/completions`,
        {
          model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: policy.prompts.summary,
            },
            {
              role: "user",
              content: JSON.stringify({
                facts: facts.map(memory => ({
                  id: memory.id,
                  content: memory.content,
                })),
                messages: window.reverse().map(message => ({
                  id: message.id,
                  speaker: message.role,
                  content: message.content,
                })),
              }),
            },
          ],
          ...(provider!.name === "deepseek"
            ? { thinking: { type: "disabled" } }
            : {}),
          max_tokens: policy.memory.summary.maxTokens,
        },
        {
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider!.apiKey}`,
          },
        }
      );
      return { value: response.data, usage: response.data?.usage };
    },
    policy
  );
  const text = raw?.choices?.[0]?.message?.content;
  const parsed = summarySchema(policy.memory).parse(
    JSON.parse(typeof text === "string" ? text : "")
  );
  const selected = facts.filter(memory => parsed.memoryIds.includes(memory.id));
  const topics = parsed.topics.filter(topic =>
    window.some(
      message =>
        message.id === topic.sourceMessageId &&
        message.role === topic.speaker &&
        memoryStatementRanges(message.content).some(
          sentence => sentence.value.trim() === topic.quote.trim()
        )
    )
  );
  if (!(await sameMemoryRouting(userId, provider))) return;
  await withUserTransaction(userId, async tx => {
    const [current] = await tx
      .select()
      .from(girlfriends)
      .where(
        and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
      )
      .for("update");
    if (
      !current?.memoryEnabled ||
      current.deletedAt ||
      current.memoryEpoch !== role.memoryEpoch ||
      !(await memoryFeatureEnabled()) ||
      (await getPublishedProductConfig()).revision !== policy.revision
    )
      return;
    const latest = await tx
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.girlfriendId, girlfriendId)
        )
      )
      .for("update");
    if (
      selected.some(
        memory =>
          !latest.some(
            item =>
              item.id === memory.id &&
              item.contentVersion === memory.contentVersion
          )
      )
    )
      return;
    const [previous] = await tx
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .for("update");
    if (previous && previous.throughMessageId > throughMessageId) return;
    const content = selected
      .map(memory => `用户事实：${memory.content}`)
      .concat(
        topics.map(
          topic =>
            `${topic.speaker === "user" ? "用户原话" : "角色曾建议"}${topic.open ? "（待继续）" : ""}：${topic.quote}`
        )
      )
      .join("\n");
    const value = {
      userId,
      girlfriendId,
      conversationId,
      configurationRevision: policy.revision,
      memoryEpoch: role.memoryEpoch,
      throughMessageId,
      content,
      sources: selected.map(memory => ({
        memoryId: memory.id,
        contentVersion: memory.contentVersion,
        sourceMessageId: memory.sourceMessageId,
      })),
      topics,
    };
    await tx
      .insert(conversationSummaries)
      .values(value)
      .onDuplicateKeyUpdate({ set: value });
  });
}

/** 读取后核对全部来源，摘要不能越过遗忘边界或把旧内容版本重新送回上下文。 */
export async function readMemorySummary(
  userId: string,
  girlfriendId: number,
  conversationId?: number,
  configuration?: Awaited<ReturnType<typeof getPublishedProductConfig>>
) {
  const policy = configuration ?? (await getPublishedProductConfig());
  const role = await activeRole(userId, girlfriendId, policy);
  if (!role || !policy.memory.summary.enabled) return null;
  const db = (await getDb())!;
  const [summary] = await db
    .select()
    .from(conversationSummaries)
    .where(
      and(
        eq(conversationSummaries.userId, userId),
        eq(conversationSummaries.girlfriendId, girlfriendId),
        eq(conversationSummaries.memoryEpoch, role.memoryEpoch),
        eq(conversationSummaries.configurationRevision, policy.revision),
        conversationId === undefined
          ? undefined
          : eq(conversationSummaries.conversationId, conversationId)
      )
    )
    .orderBy(desc(conversationSummaries.throughMessageId))
    .limit(1);
  if (!summary) return null;
  const facts = await db
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    );
  if (
    summary.sources.some(
      source =>
        !facts.some(
          memory =>
            memory.id === source.memoryId &&
            memory.contentVersion === source.contentVersion &&
            memory.sourceMessageId === source.sourceMessageId
        )
    )
  )
    return null;
  if (summary.topics.length) {
    const sources = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, summary.conversationId),
          inArray(
            messages.id,
            summary.topics.map(topic => topic.sourceMessageId)
          ),
          sql`${messages.id} > ${role.memoryForgottenThroughId}`,
          eq(messages.generationStatus, "succeeded"),
          isNull(messages.imageUrl)
        )
      );
    if (
      summary.topics.some(
        topic =>
          !sources.some(
            source =>
              source.id === topic.sourceMessageId &&
              source.role === topic.speaker &&
              memoryStatementRanges(source.content).some(
                sentence => sentence.value.trim() === topic.quote.trim()
              )
          )
      )
    )
      return null;
  }
  return summary;
}

/** 索引与摘要失败独立降级，不改变已经确认保存的事实。 */
export async function refreshMemoryDerived(
  userId: string,
  girlfriendId: number,
  conversationId: number,
  throughMessageId: number,
  configuration?: Awaited<ReturnType<typeof getPublishedProductConfig>>
) {
  const policy = configuration ?? (await getPublishedProductConfig());
  const provider = await resolveChatProvider(userId, policy);
  await indexMemoryVersions(userId, girlfriendId, provider, policy).catch(
    () => {}
  );
  await generateMemorySummary(
    userId,
    girlfriendId,
    conversationId,
    throughMessageId,
    provider,
    policy
  ).catch(() => {});
}

/** 以带时间锚点的结构注入事实，过期事件不会仍被描述为未来计划。 */
export function memoryContextRecord(
  memory: Memory,
  today: string,
  prompts: ProductConfig["prompts"]
) {
  return {
    id: memory.id,
    content: memory.content,
    sourceType: memory.sourceType,
    ...(memory.category === "event"
      ? {
          eventDay: memory.eventDay,
          eventStatus: memory.eventStatus,
          sourceTimeZone: memory.sourceTimeZone,
          temporal:
            memory.eventStatus === "unknown" ||
            memory.eventStatus === "cancelled" ||
            memory.eventStatus === "completed"
              ? prompts.memoryTemporal.unknown
              : !memory.eventDay
                ? prompts.memoryTemporal.undated
                : memory.eventDay < today
                  ? prompts.memoryTemporal.past
                  : prompts.memoryTemporal.dated,
        }
      : {}),
  };
}

/** IANA 时区的自然日；不依赖执行服务器的本地时区。 */
export function memoryLocalDay(date: Date, timeZone: string) {
  const day = memorySourceDay(date, timeZone);
  if (!day) throw new Error("Memory source date or time zone is invalid");
  return day;
}
