/** 独立于浏览器连接的持久聊天任务、租约执行和分句结算。 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  conversations,
  generationRequests,
  girlfriends,
  messages,
  rateWindows,
  type User,
} from "../drizzle/schema";
import type { ChatTurnSnapshot } from "../shared/chatStreaming";
import { METERS } from "../shared/quotas";
import { detectSelfHarm } from "../shared/safety";
import { resolveChatProvider } from "./_core/chatProvider";
import { parseChatProviderStream } from "./_core/chatStreamProvider";
import { log, providerErrorSummary } from "./_core/log";
import { getTierLimits, isBillingEnforced, upsellHint } from "./billing";
import {
  buildChatSystemPrompt,
  buildTurnLanguageReminder,
} from "../shared/chatPrompt";
import { chatContextLimits, planChatContext } from "./chatContextBudget";
import { runtimeInteger } from "./aiTaskRuntime";
import { getChatBehaviorContext } from "./companionContext";
import { getDb, withUserTransaction, type DbTransaction } from "./database";
import {
  recordGenerationTelemetry,
  type GenerationTelemetry,
} from "./generationTelemetry";
import {
  insertGenerationMessage,
  requireGenerationConversation,
  reserveGenerationInTransaction,
  settleChatTurnInTransaction,
} from "./generations";
import { buildMemoryPromptBlock, maybeExtractMemories } from "./memory";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { getUserApiConfig } from "./repositories/apiConfig";
import { getActiveGirlfriend } from "./repositories/companions";
import { ensureAgeConfirmed } from "./routers/guards";
import { consumeTranscription } from "./transcriptions";

const MAX_OUTPUT = runtimeInteger(
  "CHAT_MAX_OUTPUT_CHARS",
  16_000,
  1000,
  32_000
);
const RESPONSE_TIMEOUT = runtimeInteger(
  "CHAT_REPLY_TIMEOUT_MS",
  120_000,
  5000,
  300_000
);
const LEASE_MS = 6_000;
const LOCAL_CONCURRENCY = runtimeInteger("CHAT_STREAM_CONCURRENCY", 4, 1, 32);
const USER_CONCURRENCY = runtimeInteger("CHAT_USER_CONCURRENCY", 3, 1, 10);
const BURST_MESSAGE_LIMIT = 32;
const activeWorkers = new Map<string, Promise<void>>();
let scanning = false;
let schedulerStarted = false;

/** HTTP 与内部调用共享同一有界输入契约。 */
export const chatTurnInputSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    conversationId: z.number().int().positive(),
    content: z.string().trim().min(1).max(8_000),
    transcriptionId: z.string().uuid().optional(),
  })
  .strict();
export type ChatTurnInput = z.infer<typeof chatTurnInputSchema>;
type Request = typeof generationRequests.$inferSelect;

/** 只允许查询仍属于当前用户且角色可用的会话。 */
async function ownConversation(userId: string, conversationId: number) {
  const db = (await getDb())!;
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(girlfriends, eq(girlfriends.id, conversations.girlfriendId))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    );
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation is unavailable",
    });
}

/** 同一 ID 只接受完全相同的有效负载，转写凭据也属于绑定内容。 */
function requireSameInput(row: Request, input: ChatTurnInput) {
  if (
    row.conversationId !== input.conversationId ||
    row.chatInput !== input.content ||
    (row.transcriptionId ?? undefined) !== input.transcriptionId
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Request ID already belongs to another message",
    });
}

/** 在接收消息事务内计入滑动窗口；幂等重试在此之前返回，不消耗频率。 */
async function consumeRate(tx: DbTransaction, userId: string, limit: number) {
  const now = Date.now();
  await tx
    .insert(rateWindows)
    .values({ userId, action: "chat", requests: [] })
    .onDuplicateKeyUpdate({ set: { userId } });
  const where = and(
    eq(rateWindows.userId, userId),
    eq(rateWindows.action, "chat")
  );
  const [row] = await tx.select().from(rateWindows).where(where).for("update");
  const requests = row.requests.filter(time => now - time < 60_000);
  if (requests.length >= limit)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many chat requests",
    });
  await tx
    .update(rateWindows)
    .set({ requests: [...requests, now], updatedAt: new Date() })
    .where(where);
}

/** 上一次完整回复之后的补充全部保留；超出上下文容量时在接收前明确拒绝。 */
async function requireFollowupCapacity(
  tx: DbTransaction,
  conversationId: number,
  content: string,
  forgottenThrough: number
) {
  const [completed] = await tx
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        sql`${messages.id} > ${forgottenThrough}`,
        eq(messages.role, "assistant"),
        eq(messages.generationStatus, "succeeded"),
        sql`CHAR_LENGTH(TRIM(${messages.content})) > 0`
      )
    )
    .orderBy(desc(messages.id))
    .limit(1);
  const burst = await tx
    .select({ content: messages.content, role: messages.role })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        sql`${messages.id} > ${forgottenThrough}`,
        completed ? sql`${messages.id} > ${completed.id}` : undefined
      )
    );
  if (
    burst.reduce((sum, item) => sum + item.content.length, content.length) >
      chatContextLimits(await getPublishedProductConfig(tx)).followups ||
    burst.filter(item => item.role === "user").length >= BURST_MESSAGE_LIMIT
  )
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Follow-up context is full. Let the current reply finish or start a new conversation.",
    });
}

/** 原子接收用户消息、消费转写、预留额度并停止旧轮；不持有外部调用事务。 */
export async function submitChatTurn(
  user: User,
  rawInput: ChatTurnInput
): Promise<ChatTurnSnapshot> {
  ensureAgeConfirmed(user);
  const parsed = chatTurnInputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid chat request",
    });
  const input = parsed.data;
  const db = (await getDb())!;
  const [existing] = await db
    .select()
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.userId, user.id),
        eq(generationRequests.clientRequestId, input.clientRequestId)
      )
    );
  if (existing) {
    requireSameInput(existing, input);
    return getChatTurnSnapshot(user.id, existing.id);
  }
  await ownConversation(user.id, input.conversationId);
  const policy = await getPublishedProductConfig();
  const provider = await resolveChatProvider(user.id, policy);
  if (!provider.apiKey)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Chat provider is not configured",
    });
  const { tier, limits } = await getTierLimits(user.id, policy);
  const config = await getUserApiConfig(user.id);
  const routing = {
    provider: provider.name,
    baseUrl: provider.baseUrl,
    isByok: provider.isByok,
    model:
      provider.name === "deepseek"
        ? provider.model
        : isBillingEnforced() && limits.modelLocked && !provider.isByok
          ? policy.billing.defaultChatModel
          : config?.llmModel || policy.billing.defaultChatModel,
  };
  const id = await withUserTransaction(user.id, async tx => {
    const [duplicate] = await tx
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.userId, user.id),
          eq(generationRequests.clientRequestId, input.clientRequestId)
        )
      )
      .for("update");
    if (duplicate) {
      requireSameInput(duplicate, input);
      return duplicate.id;
    }
    const role = await requireGenerationConversation(
      tx,
      user.id,
      input.conversationId
    );
    const oldTurns = await tx
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.userId, user.id),
          eq(generationRequests.conversationId, input.conversationId),
          eq(generationRequests.status, "pending"),
          inArray(generationRequests.turnStatus, ["queued", "running"])
        )
      )
      .for("update");
    for (const old of oldTurns)
      await settleChatTurnInTransaction(tx, old, "stopped");
    await requireFollowupCapacity(
      tx,
      input.conversationId,
      input.content,
      role.memoryForgottenThroughId
    );
    const [count] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.userId, user.id),
          eq(generationRequests.status, "pending"),
          inArray(generationRequests.turnStatus, ["queued", "running"])
        )
      );
    if (Number(count.count) >= USER_CONCURRENCY)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many active conversations",
      });
    await consumeRate(tx, user.id, policy.billing.rateLimits.chat);
    if (input.transcriptionId)
      await consumeTranscription(
        tx,
        input.transcriptionId,
        user.id,
        input.content
      );
    const id = await reserveGenerationInTransaction(tx, {
      userId: user.id,
      conversationId: input.conversationId,
      kind: "chat",
      contextEpoch: role.memoryEpoch,
      transcriptionId: input.transcriptionId,
      timeoutMs: 5 * 60_000,
      meter:
        isBillingEnforced() && !provider.isByok && limits.dailyMessages !== null
          ? {
              name: METERS.chat,
              period: "day",
              limit: limits.dailyMessages,
              what: "messages",
              hint: upsellHint(tier, policy),
            }
          : undefined,
    });
    const common = {
      conversationId: input.conversationId,
      generationRequestId: id,
    };
    const userMessage = await insertGenerationMessage(tx, {
      ...common,
      role: "user",
      content: input.content,
      generationStatus: "succeeded",
    });
    const assistantMessage = await insertGenerationMessage(tx, {
      ...common,
      role: "assistant",
      content: "",
      segments: [],
      generationStatus: "pending",
    });
    await tx
      .update(generationRequests)
      .set({
        clientRequestId: input.clientRequestId,
        chatInput: input.content,
        chatRouting: routing,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        turnStatus: "queued",
        safetyNotice: detectSelfHarm(input.content),
        revision: 1,
      })
      .where(eq(generationRequests.id, id));
    return id;
  });
  if (schedulerStarted) void runChatTurns().catch(reportSchedulerError);
  return getChatTurnSnapshot(user.id, id);
}

/** 读取当前用户的一轮完整持久快照；不根据客户端连接重新执行生成。 */
export async function getChatTurnSnapshot(
  userId: string,
  id: string
): Promise<ChatTurnSnapshot> {
  const db = (await getDb())!;
  const [row] = await db
    .select()
    .from(generationRequests)
    .where(
      and(eq(generationRequests.id, id), eq(generationRequests.userId, userId))
    );
  if (!row?.turnStatus || !row.clientRequestId)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat turn is unavailable",
    });
  await ownConversation(userId, row.conversationId);
  const items = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.generationRequestId, id),
        eq(messages.conversationId, row.conversationId)
      )
    );
  const userMessage = items.find(
    item => item.id === row.userMessageId && item.role === "user"
  );
  const assistantMessage = items.find(
    item => item.id === row.assistantMessageId && item.role === "assistant"
  );
  if (!userMessage || !assistantMessage)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat messages are unavailable",
    });
  return {
    id: row.id,
    conversationId: row.conversationId,
    clientRequestId: row.clientRequestId,
    status: row.turnStatus,
    revision: row.revision,
    userMessage: {
      ...userMessage,
      createdAt: userMessage.createdAt.toISOString(),
    },
    assistantMessage: {
      ...assistantMessage,
      createdAt: assistantMessage.createdAt.toISOString(),
    },
    safetyNotice: row.safetyNotice,
    ...(row.turnStatus === "failed"
      ? { errorCode: "GENERATION_FAILED" as const }
      : {}),
    relationship: row.turnRelationship,
  };
}

/** 恢复会话的最近轮次，终态同样可恢复。 */
export async function getLatestChatTurn(
  userId: string,
  conversationId: number
): Promise<ChatTurnSnapshot | null> {
  await ownConversation(userId, conversationId);
  const db = (await getDb())!;
  const [row] = await db
    .select({ id: generationRequests.id })
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.userId, userId),
        eq(generationRequests.conversationId, conversationId),
        sql`${generationRequests.turnStatus} IS NOT NULL`
      )
    )
    .orderBy(
      desc(generationRequests.createdAt),
      desc(generationRequests.userMessageId)
    )
    .limit(1);
  return row ? getChatTurnSnapshot(userId, row.id) : null;
}

/** 明确的用户停止即时写入共享数据库；断开 SSE 从不调用此函数。 */
export async function stopChatTurn(
  userId: string,
  id: string
): Promise<ChatTurnSnapshot> {
  await withUserTransaction(userId, async tx => {
    const [row] = await tx
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.id, id),
          eq(generationRequests.userId, userId)
        )
      )
      .for("update");
    if (!row?.turnStatus)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Chat turn is unavailable",
      });
    if (row.status === "pending")
      await settleChatTurnInTransaction(tx, row, "stopped");
  });
  return getChatTurnSnapshot(userId, id);
}

/** 每次写入都重新验证共享租约及修订，旧进程不能覆盖后来的轮次。 */
async function liveLease(
  tx: DbTransaction,
  request: Request,
  leaseToken: string,
  memoryEpoch?: number
) {
  const [row] = await tx
    .select()
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.id, request.id),
        eq(generationRequests.userId, request.userId)
      )
    )
    .for("update");
  if (
    !row ||
    row.status !== "pending" ||
    row.turnStatus !== "running" ||
    row.cancelRequested ||
    row.leaseToken !== leaseToken ||
    !row.leaseUntil ||
    row.leaseUntil.getTime() <= Date.now() ||
    row.expiresAt.getTime() <= Date.now()
  )
    throw new Error("Chat lease is no longer active");
  const role = await requireGenerationConversation(
    tx,
    request.userId,
    request.conversationId
  );
  if (memoryEpoch !== undefined && role.memoryEpoch !== memoryEpoch)
    throw new Error("Companion context changed during generation");
  return row;
}

async function appendSegment(
  request: Request,
  leaseToken: string,
  text: string,
  memoryEpoch?: number
) {
  await withUserTransaction(request.userId, async tx => {
    const row = await liveLease(tx, request, leaseToken, memoryEpoch);
    const [message] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, row.assistantMessageId!),
          eq(messages.generationRequestId, row.id)
        )
      )
      .for("update");
    if (!message || message.generationStatus !== "pending")
      throw new Error("Chat draft is unavailable");
    if (message.content.length + text.length > MAX_OUTPUT)
      throw new Error("Chat output exceeds limit");
    const segments = message.segments ?? [];
    const sequence = segments.length;
    await tx
      .update(messages)
      .set({
        content: message.content + text,
        segments: [
          ...segments,
          { id: `${row.id}:${sequence}`, sequence, content: text },
        ],
      })
      .where(
        and(
          eq(messages.id, message.id),
          eq(messages.generationRequestId, row.id)
        )
      );
    await tx
      .update(generationRequests)
      .set({ revision: row.revision + 1 })
      .where(
        and(
          eq(generationRequests.id, row.id),
          eq(generationRequests.leaseToken, leaseToken),
          eq(generationRequests.revision, row.revision),
          eq(generationRequests.status, "pending")
        )
      );
  });
}

async function finishWorker(
  request: Request,
  leaseToken: string,
  status: "succeeded" | "failed",
  memoryEpoch?: number
) {
  await withUserTransaction(request.userId, async tx => {
    const [row] = await tx
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.id, request.id),
          eq(generationRequests.userId, request.userId)
        )
      )
      .for("update");
    if (
      !row ||
      row.status !== "pending" ||
      row.turnStatus !== "running" ||
      row.leaseToken !== leaseToken
    )
      return;
    if (status === "succeeded") {
      await liveLease(tx, request, leaseToken, memoryEpoch);
      if (
        !row.leaseUntil ||
        row.leaseUntil.getTime() <= Date.now() ||
        row.expiresAt.getTime() <= Date.now() ||
        row.cancelRequested
      )
        throw new Error("Chat lease expired before settlement");
      const [message] = await tx
        .select({ content: messages.content })
        .from(messages)
        .where(
          and(
            eq(messages.id, row.assistantMessageId!),
            eq(messages.generationRequestId, row.id)
          )
        );
      if (!message?.content.trim())
        throw new Error("Chat provider returned empty content");
    }
    await settleChatTurnInTransaction(tx, row, status);
  });
}

/** 外部调用不持锁；正文先落库，再由任意实例的 SSE 观察持久版本。 */
async function executeChatTurn(request: Request, leaseToken: string) {
  const controller = new AbortController();
  const started = Date.now();
  let telemetry: GenerationTelemetry | null = null;
  let truncated = false;
  let memoryEpoch: number | undefined;
  let pending = "",
    oldestPendingAt = 0,
    received = 0,
    flushingError: unknown;
  let flushChain = Promise.resolve();
  let polling = false,
    lastHeartbeat = started;
  const queueFlush = (all = false) => {
    while (pending) {
      const boundary = pending.search(/[。！？!?\n]|\.(?=\s|$)/);
      let length =
        boundary >= 0
          ? Math.min(boundary + 1, 160)
          : pending.length >= 160
            ? 160
            : all
              ? pending.length
              : 0;
      if (!length) break;
      const code = pending.charCodeAt(length - 1);
      if (code >= 0xd800 && code <= 0xdbff && length < pending.length) length--;
      const piece = pending.slice(0, length);
      pending = pending.slice(length);
      oldestPendingAt = pending ? Date.now() : 0;
      flushChain = flushChain
        .then(() => {
          if (flushingError) return;
          return appendSegment(request, leaseToken, piece, memoryEpoch);
        })
        .catch(error => {
          flushingError = error;
          controller.abort();
        });
    }
  };
  const flushTimer = setInterval(() => {
    if (pending && Date.now() - oldestPendingAt >= 600) queueFlush(true);
  }, 50);
  const pollTimer = setInterval(() => {
    if (polling) return;
    polling = true;
    void (async () => {
      const db = (await getDb())!;
      const [row] = await db
        .select({
          status: generationRequests.status,
          turnStatus: generationRequests.turnStatus,
          leaseToken: generationRequests.leaseToken,
          cancel: generationRequests.cancelRequested,
        })
        .from(generationRequests)
        .where(eq(generationRequests.id, request.id));
      if (
        !row ||
        row.status !== "pending" ||
        row.turnStatus !== "running" ||
        row.leaseToken !== leaseToken ||
        row.cancel ||
        Date.now() - started >= RESPONSE_TIMEOUT
      ) {
        controller.abort();
        return;
      }
      if (Date.now() - lastHeartbeat >= 2_000) {
        await withUserTransaction(request.userId, async tx => {
          const live = await liveLease(tx, request, leaseToken, memoryEpoch);
          await tx
            .update(generationRequests)
            .set({ leaseUntil: new Date(Date.now() + LEASE_MS) })
            .where(
              and(
                eq(generationRequests.id, request.id),
                eq(generationRequests.leaseToken, leaseToken),
                eq(generationRequests.revision, live.revision),
                eq(generationRequests.status, "pending")
              )
            );
        });
        lastHeartbeat = Date.now();
      }
    })()
      .catch(() => controller.abort())
      .finally(() => {
        polling = false;
      });
  }, 250);
  const timeout = setTimeout(() => controller.abort(), RESPONSE_TIMEOUT);
  try {
    const provider = await resolveChatProvider(request.userId);
    if (!provider.apiKey) throw new Error("Chat provider is not configured");
    const routing = request.chatRouting;
    if (
      !routing ||
      routing.provider !== provider.name ||
      routing.isByok !== provider.isByok ||
      routing.baseUrl !== provider.baseUrl
    )
      throw new Error("Accepted chat routing is no longer available");
    const config = await getUserApiConfig(request.userId);
    const model = routing.model;
    const policy = await getPublishedProductConfig();
    telemetry = {
      promptVersion: `product-config/${policy.revision}:chat`,
      provider: provider.name,
      model,
      isByok: provider.isByok,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      outcome: "failed",
    };
    const db = (await getDb())!;
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, request.conversationId),
          eq(conversations.userId, request.userId)
        )
      );
    if (!conversation) throw new Error("Conversation is unavailable");
    const girlfriend = await getActiveGirlfriend(
      request.userId,
      conversation.girlfriendId
    );
    if (!girlfriend) throw new Error("Companion is unavailable");
    if (
      request.contextEpoch !== null &&
      request.contextEpoch !== girlfriend.memoryEpoch
    )
      throw new Error("Accepted companion context changed");
    if (
      !request.userMessageId ||
      request.userMessageId <= girlfriend.memoryForgottenThroughId
    )
      throw new Error("Accepted input was cleared from companion context");
    memoryEpoch = girlfriend.memoryEpoch;
    let behaviorContext = {};
    try {
      behaviorContext = await getChatBehaviorContext(
        request.userId,
        girlfriend.id,
        request.chatInput!
      );
    } catch (error) {
      log.warn(
        "[chat-stream] behavior unavailable",
        providerErrorSummary(error)
      );
    }
    const platformPrompt = buildChatSystemPrompt(policy, girlfriend, config, {
      ...behaviorContext,
      memoryEnabled: policy.memory.enabled && girlfriend.memoryEnabled,
    });
    let memoryBlock = "";
    try {
      memoryBlock = await buildMemoryPromptBlock(
        request.userId,
        girlfriend.id,
        request.chatInput!,
        girlfriend.intimacyLevel || 1,
        {
          conversationId: request.conversationId,
          maxChars: chatContextLimits(policy).memory,
          configuration: policy,
        }
      );
    } catch (error) {
      log.warn("[chat-stream] memory unavailable", providerErrorSummary(error));
    }
    const [completed] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, request.conversationId),
          sql`${messages.id} > ${girlfriend.memoryForgottenThroughId}`,
          eq(messages.role, "assistant"),
          eq(messages.generationStatus, "succeeded"),
          sql`${messages.id} < ${request.userMessageId!}`,
          sql`CHAR_LENGTH(TRIM(${messages.content})) > 0`
        )
      )
      .orderBy(desc(messages.id))
      .limit(1);
    const followups = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, request.conversationId),
          sql`${messages.id} > ${girlfriend.memoryForgottenThroughId}`,
          lte(messages.id, request.userMessageId!),
          completed ? sql`${messages.id} > ${completed.id}` : undefined,
          or(
            eq(messages.role, "user"),
            sql`CHAR_LENGTH(TRIM(${messages.content})) > 0`
          )
        )
      )
      .orderBy(messages.id);
    const previous = completed
      ? await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, request.conversationId),
              sql`${messages.id} > ${girlfriend.memoryForgottenThroughId}`,
              lte(messages.id, completed.id),
              or(
                eq(messages.role, "user"),
                sql`CHAR_LENGTH(TRIM(${messages.content})) > 0`
              )
            )
          )
          .orderBy(desc(messages.id))
          .limit(10)
      : [];
    const turnLanguage =
      provider.name === "deepseek"
        ? buildTurnLanguageReminder(policy, config?.replyLanguage)
        : "";
    const { systemPrompt, history } = planChatContext(policy, {
      platform: platformPrompt,
      memory: memoryBlock,
      summary: "",
      previous: previous.reverse(),
      followups,
      additionalSystemPrompt: turnLanguage,
    });
    const providerMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [
      { role: "system", content: systemPrompt },
      ...history.map(item => ({ role: item.role, content: item.content })),
    ];
    if (turnLanguage && providerMessages.at(-1)?.role === "user")
      providerMessages.splice(-1, 0, { role: "system", content: turnLanguage });
    // All accepted follow-up messages are already canonical history, including the current user message.
    await withUserTransaction(request.userId, tx =>
      liveLease(tx, request, leaseToken, memoryEpoch)
    );
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        messages: providerMessages,
        ...(provider.name === "deepseek"
          ? { thinking: { type: "disabled" } }
          : {}),
        max_tokens: 4096,
      }),
    });
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.includes("text/event-stream")
    )
      throw new Error("Chat provider did not return an event stream");
    for await (const event of parseChatProviderStream(response.body)) {
      if (event.usage)
        telemetry = {
          ...telemetry,
          inputTokens: event.usage.inputTokens ?? telemetry.inputTokens,
          outputTokens: event.usage.outputTokens ?? telemetry.outputTokens,
          costUsd: event.usage.costUsd ?? telemetry.costUsd,
        };
      if (event.stopReason === "length") truncated = true;
      if (controller.signal.aborted) throw new Error("Chat generation stopped");
      if (event.text) {
        received += event.text.length;
        if (received > MAX_OUTPUT) throw new Error("Chat output exceeds limit");
        if (!pending) oldestPendingAt = Date.now();
        pending += event.text;
        queueFlush();
      }
      if (flushingError) throw flushingError;
    }
    telemetry.outcome = "succeeded";
    if (truncated) throw new Error("Chat provider reached its output limit");
    queueFlush(true);
    await flushChain;
    if (flushingError) throw flushingError;
    if (!received) throw new Error("Chat provider returned empty content");
    await finishWorker(request, leaseToken, "succeeded", memoryEpoch);
    maybeExtractMemories({ userId: request.userId });
  } catch (error) {
    // Preserve received text even for provider errors; shared cancellation can reject the late write.
    queueFlush(true);
    await flushChain;
    try {
      await finishWorker(request, leaseToken, "failed");
    } catch (settlementError) {
      log.warn("[chat-stream] settlement will retry", {
        requestId: request.id,
        ...providerErrorSummary(settlementError),
      });
    }
    log.warn("[chat-stream] generation ended", {
      requestId: request.id,
      ...providerErrorSummary(error),
    });
  } finally {
    clearInterval(flushTimer);
    clearInterval(pollTimer);
    clearTimeout(timeout);
    controller.abort();
    if (telemetry)
      await recordGenerationTelemetry(request.id, request.userId, {
        ...telemetry,
        durationMs: Date.now() - started,
      });
  }
}

function reportSchedulerError(error: unknown) {
  log.warn("[chat-stream] scheduler retry", providerErrorSummary(error));
}

/** 领取排队任务并结束失效租约；运行中的失效任务不重放供应商请求。 */
export async function runChatTurns(userIds?: readonly string[]): Promise<void> {
  if (userIds?.length === 0) return;
  if (scanning) return;
  scanning = true;
  const launched: Promise<void>[] = [];
  try {
    const db = (await getDb())!;
    const expired = await db
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.status, "pending"),
          userIds
            ? inArray(generationRequests.userId, [...userIds])
            : undefined,
          inArray(generationRequests.turnStatus, ["queued", "running"]),
          or(
            lte(generationRequests.expiresAt, new Date()),
            and(
              eq(generationRequests.turnStatus, "running"),
              or(
                isNull(generationRequests.leaseUntil),
                lte(generationRequests.leaseUntil, new Date())
              )
            )
          )
        )
      )
      .limit(50);
    for (const request of expired)
      await withUserTransaction(request.userId, async tx => {
        const [current] = await tx
          .select()
          .from(generationRequests)
          .where(eq(generationRequests.id, request.id))
          .for("update");
        if (
          current?.status === "pending" &&
          (current.expiresAt.getTime() <= Date.now() ||
            (current.turnStatus === "running" &&
              (!current.leaseUntil ||
                current.leaseUntil.getTime() <= Date.now())))
        )
          await settleChatTurnInTransaction(tx, current, "failed");
      }).catch(reportSchedulerError);
    const queued = await db
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.status, "pending"),
          userIds
            ? inArray(generationRequests.userId, [...userIds])
            : undefined,
          eq(generationRequests.turnStatus, "queued")
        )
      )
      .orderBy(generationRequests.createdAt)
      .limit(50);
    for (const request of queued) {
      if (activeWorkers.size >= LOCAL_CONCURRENCY) break;
      if (activeWorkers.has(request.id)) continue;
      const token = crypto.randomUUID();
      const claimed = await withUserTransaction(request.userId, async tx => {
        const [current] = await tx
          .select()
          .from(generationRequests)
          .where(eq(generationRequests.id, request.id))
          .for("update");
        if (
          !current ||
          current.status !== "pending" ||
          current.turnStatus !== "queued" ||
          current.expiresAt.getTime() <= Date.now()
        )
          return false;
        try {
          await requireGenerationConversation(
            tx,
            request.userId,
            request.conversationId
          );
        } catch (error) {
          if (!(error instanceof TRPCError) || error.code !== "NOT_FOUND")
            throw error;
          // Deletion after acceptance is a terminal per-task failure, not a failure of the shared queue.
          await settleChatTurnInTransaction(tx, current, "failed", false);
          return false;
        }
        await tx
          .update(generationRequests)
          .set({
            turnStatus: "running",
            leaseToken: token,
            leaseUntil: new Date(Date.now() + LEASE_MS),
            expiresAt: new Date(Date.now() + RESPONSE_TIMEOUT + 1_000),
            revision: current.revision + 1,
          })
          .where(
            and(
              eq(generationRequests.id, request.id),
              eq(generationRequests.revision, current.revision),
              eq(generationRequests.turnStatus, "queued")
            )
          );
        return true;
      }).catch(error => {
        reportSchedulerError(error);
        return false;
      });
      if (!claimed) continue;
      const worker = executeChatTurn(request, token)
        .catch(reportSchedulerError)
        .finally(() => activeWorkers.delete(request.id));
      activeWorkers.set(request.id, worker);
      launched.push(worker);
    }
  } finally {
    scanning = false;
  }
  await Promise.all(launched);
}

/** 启动后自动恢复排队任务；关闭调度不会把浏览器断开解释为用户停止。 */
export function startChatTurnScheduler(): () => void {
  schedulerStarted = true;
  const timer = setInterval(() => {
    void runChatTurns().catch(reportSchedulerError);
  }, 250);
  timer.unref();
  void runChatTurns().catch(reportSchedulerError);
  return () => {
    schedulerStarted = false;
    clearInterval(timer);
  };
}
