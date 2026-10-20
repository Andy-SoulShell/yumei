import { shouldExtractMemories } from "../shared/memory";
import { memoryFeatureEnabled } from "./aiTaskRuntime";
/** 持久化生成请求，原子结算消息与额度，并补偿失败和过期预留。 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  conversations,
  generationRequests,
  girlfriends,
  mediaDeletions,
  memoryExtractionJobs,
  messages,
  selfies,
  usageMeters,
  voiceTranscriptions,
  type InsertMessage,
  type InsertSelfie,
} from "../drizzle/schema";
import {
  monthUTC,
  todayUTC,
  tryConsumeMeterInTransaction,
} from "./_core/quota";
import { getDb, withUserTransaction, type DbTransaction } from "./database";
import {
  applyMessageRelationship,
  awardIntimacy,
  relationshipSummary,
} from "./relationship";
import { consumeTranscription } from "./transcriptions";

/** 一次生成需要预留的额度；不传表示 BYOK、不限量或自托管。 */
export type GenerationMeter = {
  name: string;
  period: "day" | "month";
  limit: number;
  what: string;
  hint?: string;
};

/** 在事务内再次检查会话和角色，阻止生成期间删除资源后写入孤立结果。 */
export async function requireGenerationConversation(
  tx: DbTransaction,
  userId: string,
  conversationId: number
) {
  const [row] = await tx
    .select({
      girlfriendId: girlfriends.id,
      intimacyLevel: girlfriends.intimacyLevel,
      memoryEpoch: girlfriends.memoryEpoch,
      memoryForgottenThroughId: girlfriends.memoryForgottenThroughId,
    })
    .from(conversations)
    .innerJoin(girlfriends, eq(girlfriends.id, conversations.girlfriendId))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    )
    .for("update");
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation or companion is no longer available",
    });
  return row;
}

/** 记录预留请求和原始计量周期；外部 Provider 调用在事务提交后进行。 */
export type ReserveGenerationInput = {
  userId: string;
  conversationId: number;
  kind: "chat" | "selfie" | "couple";
  meter?: GenerationMeter;
  timeoutMs?: number;
  outputKey?: string;
  temporaryKey?: string;
  transcriptionId?: string;
};

/** 在已有用户事务中预留额度，让接收消息与转写消费共享原子边界。 */
export async function reserveGenerationInTransaction(
  tx: DbTransaction,
  input: ReserveGenerationInput,
  id = crypto.randomUUID()
): Promise<string> {
  await requireGenerationConversation(tx, input.userId, input.conversationId);
  const period = input.meter
    ? input.meter.period === "day"
      ? todayUTC()
      : monthUTC()
    : null;
  if (input.meter) {
    const result = await tryConsumeMeterInTransaction(
      tx,
      input.userId,
      input.meter.name,
      input.meter.limit,
      period!
    );
    if (!result.allowed)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `${input.meter.period === "day" ? "Daily" : "Monthly"} limit reached (${input.meter.limit} ${input.meter.what}).${input.meter.hint ?? ""}`,
      });
  }
  await tx.insert(generationRequests).values({
    id,
    userId: input.userId,
    conversationId: input.conversationId,
    kind: input.kind,
    meterPeriod: period,
    meterName: input.meter?.name ?? null,
    outputKey: input.outputKey,
    temporaryKey: input.temporaryKey,
    transcriptionId: input.transcriptionId,
    expiresAt: new Date(Date.now() + (input.timeoutMs ?? 180_000)),
  });
  return id;
}

/** 外部生成的短事务额度预留入口。 */
export async function reserveGeneration(
  input: ReserveGenerationInput
): Promise<string> {
  return withUserTransaction(input.userId, tx =>
    reserveGenerationInTransaction(tx, input)
  );
}

/** 锁定仍未结算的请求，避免重复提交或在超时补偿后继续保存结果。 */
async function pendingRequest(tx: DbTransaction, id: string, userId: string) {
  const [request] = await tx
    .select()
    .from(generationRequests)
    .where(
      and(eq(generationRequests.id, id), eq(generationRequests.userId, userId))
    )
    .for("update");
  if (
    !request ||
    request.status !== "pending" ||
    request.expiresAt.getTime() <= Date.now()
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Generation request is no longer pending",
    });
  return request;
}

/** 将本次预留从最初计量周期扣回；只由未结算状态转换调用一次。 */
export async function refundGenerationInTransaction(
  tx: DbTransaction,
  request: typeof generationRequests.$inferSelect
) {
  if (!request.meterName || !request.meterPeriod) return;
  await tx
    .update(usageMeters)
    .set({ count: sql`GREATEST(0, ${usageMeters.count} - 1)` })
    .where(
      and(
        eq(usageMeters.userId, request.userId),
        eq(usageMeters.meter, request.meterName),
        eq(usageMeters.period, request.meterPeriod)
      )
    );
}

/** 在结算事务中预留媒体回收任务；清理器会再次检查实际引用。 */
export async function cleanupGenerationMedia(
  tx: DbTransaction,
  request: typeof generationRequests.$inferSelect,
  failed: boolean
) {
  for (const key of [request.temporaryKey, failed ? request.outputKey : null]) {
    if (key)
      await tx
        .insert(mediaDeletions)
        .values({ key, userId: request.userId, availableAt: new Date() })
        .onDuplicateKeyUpdate({ set: { key, availableAt: new Date() } });
  }
}

/** 幂等标记失败并返还原周期预留，重复补偿不会再次扣减计量。 */
export async function failGeneration(
  id: string,
  userId: string
): Promise<void> {
  await withUserTransaction(userId, async tx => {
    const [request] = await tx
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.id, id),
          eq(generationRequests.userId, userId)
        )
      )
      .for("update");
    if (!request || request.status !== "pending") return;
    if (request.turnStatus) {
      await settleChatTurnInTransaction(tx, request, "failed");
      return;
    }
    await refundGenerationInTransaction(tx, request);
    await cleanupGenerationMedia(tx, request, true);
    await tx
      .update(generationRequests)
      .set({ status: "failed" })
      .where(eq(generationRequests.id, id));
  });
}

/** 在现有事务内保存并读取一条消息。 */
export async function insertGenerationMessage(
  tx: DbTransaction,
  data: InsertMessage
) {
  const [result] = await tx.insert(messages).values(data);
  const [message] = await tx
    .select()
    .from(messages)
    .where(eq(messages.id, Number(result.insertId)));
  await tx
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, data.conversationId));
  return message;
}

/**
 * 结算持久聊天轮次。调用方持有用户及请求锁；终态和奖励只提交一次。
 * 已持久化的可见回复保留一次额度，零输出才补偿；只有完整成功创建记忆任务。
 */
export async function settleChatTurnInTransaction(
  tx: DbTransaction,
  request: typeof generationRequests.$inferSelect,
  status: "succeeded" | "stopped" | "failed",
  reward = true
) {
  if (request.status !== "pending" || !request.turnStatus) return;
  const rows = await tx
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.generationRequestId, request.id),
        eq(messages.conversationId, request.conversationId)
      )
    )
    .for("update");
  const userMessage = rows.find(
    row => row.id === request.userMessageId && row.role === "user"
  );
  const assistantMessage = rows.find(
    row => row.id === request.assistantMessageId && row.role === "assistant"
  );
  const hasOutput = !!assistantMessage?.content.trim();
  if (!hasOutput) await refundGenerationInTransaction(tx, request);
  let relationship = request.turnRelationship;
  if (hasOutput && userMessage && reward) {
    const [role] = await tx
      .select({
        girlfriendId: girlfriends.id,
        intimacyLevel: girlfriends.intimacyLevel,
        memoryEnabled: girlfriends.memoryEnabled,
        memoryEpoch: girlfriends.memoryEpoch,
        memoryForgottenThroughId: girlfriends.memoryForgottenThroughId,
      })
      .from(conversations)
      .innerJoin(girlfriends, eq(girlfriends.id, conversations.girlfriendId))
      .where(
        and(
          eq(conversations.id, request.conversationId),
          eq(conversations.userId, request.userId),
          eq(girlfriends.userId, request.userId),
          isNull(girlfriends.deletedAt)
        )
      )
      .for("update");
    if (role) {
      await applyMessageRelationship(
        tx,
        request.userId,
        role.girlfriendId,
        userMessage
      );
      await applyMessageRelationship(
        tx,
        request.userId,
        role.girlfriendId,
        assistantMessage!
      );
      if (request.transcriptionId) {
        const [transcription] = await tx
          .select()
          .from(voiceTranscriptions)
          .where(
            and(
              eq(voiceTranscriptions.id, request.transcriptionId),
              eq(voiceTranscriptions.userId, request.userId),
              eq(voiceTranscriptions.consumed, true)
            )
          );
        if (transcription)
          await awardIntimacy(
            tx,
            role.girlfriendId,
            request.userId,
            5 + (transcription.durationMs > 30_000 ? 3 : 0),
            "voice_message"
          );
      }
      relationship = await relationshipSummary(
        tx,
        role.girlfriendId,
        role.intimacyLevel
      );
      if (status === "succeeded") {
        const [rounds] = await tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(generationRequests)
          .where(
            and(
              eq(generationRequests.conversationId, request.conversationId),
              eq(generationRequests.kind, "chat"),
              eq(generationRequests.status, "succeeded")
            )
          );
        if (
          role.memoryEnabled &&
          memoryFeatureEnabled() &&
          userMessage.id > role.memoryForgottenThroughId &&
          shouldExtractMemories(Number(rounds.count) + 1, userMessage.content)
        )
          await tx.insert(memoryExtractionJobs).values({
            id: request.id,
            userId: request.userId,
            girlfriendId: role.girlfriendId,
            conversationId: request.conversationId,
            lastMessageId: assistantMessage!.id,
            intimacyLevel: relationship.intimacyLevel,
            memoryEpoch: role.memoryEpoch,
          });
      }
    }
  }
  if (assistantMessage)
    await tx
      .update(messages)
      .set({ generationStatus: status })
      .where(
        and(
          eq(messages.id, assistantMessage.id),
          eq(messages.generationRequestId, request.id)
        )
      );
  await tx
    .update(generationRequests)
    .set({
      status: status === "stopped" ? "cancelled" : status,
      turnStatus: status,
      cancelRequested: status === "stopped",
      leaseToken: null,
      leaseUntil: null,
      revision: request.revision + 1,
      turnRelationship: relationship,
    })
    .where(
      and(
        eq(generationRequests.id, request.id),
        eq(generationRequests.status, "pending"),
        eq(generationRequests.revision, request.revision)
      )
    );
}

/** 同时保存图片消息、相册和可选用户消息，防止生成结果只写入一半。 */
export async function completeImageGeneration(
  id: string,
  userId: string,
  image: Omit<InsertSelfie, "userId" | "girlfriendId" | "messageId">,
  chatContent?: string,
  label = "自拍照片"
) {
  return withUserTransaction(userId, async tx => {
    const request = await pendingRequest(tx, id, userId);
    const role = await requireGenerationConversation(
      tx,
      userId,
      request.conversationId
    );
    const transcription =
      request.transcriptionId && chatContent !== undefined
        ? await consumeTranscription(
            tx,
            request.transcriptionId,
            userId,
            chatContent
          )
        : null;
    const common = {
      conversationId: request.conversationId,
      generationRequestId: id,
      generationStatus: "succeeded" as const,
    };
    const userMessage =
      chatContent === undefined
        ? undefined
        : await insertGenerationMessage(tx, {
            ...common,
            role: "user",
            content: chatContent,
          });
    const message = await insertGenerationMessage(tx, {
      ...common,
      role: "assistant",
      content: `[${label}]`,
      imageUrl: image.imageUrl,
      imageKey: image.imageKey,
      selfieMode: image.mode,
    });
    const [result] = await tx.insert(selfies).values({
      ...image,
      userId,
      girlfriendId: role.girlfriendId,
      messageId: message.id,
    });
    const [selfie] = await tx
      .select()
      .from(selfies)
      .where(eq(selfies.id, Number(result.insertId)));
    if (userMessage)
      await applyMessageRelationship(
        tx,
        userId,
        role.girlfriendId,
        userMessage
      );
    await applyMessageRelationship(tx, userId, role.girlfriendId, message);
    await awardIntimacy(tx, role.girlfriendId, userId, 10, "selfie");
    if (transcription)
      await awardIntimacy(
        tx,
        role.girlfriendId,
        userId,
        5 + (transcription.durationMs > 30_000 ? 3 : 0),
        "voice_message"
      );
    const relationship = await relationshipSummary(
      tx,
      role.girlfriendId,
      role.intimacyLevel
    );
    await cleanupGenerationMedia(tx, request, false);
    await tx
      .update(generationRequests)
      .set({ status: "succeeded" })
      .where(eq(generationRequests.id, id));
    return {
      selfie,
      message,
      userMessage,
      imageGeneration: "completed" as const,
      relationship,
    };
  });
}

/** 聊天自拍失败时保存明确失败状态和说明，同时在同一事务退回额度。 */
export async function failImageGeneration(
  id: string,
  userId: string,
  content: string
) {
  return withUserTransaction(userId, async tx => {
    const request = await pendingRequest(tx, id, userId);
    await requireGenerationConversation(tx, userId, request.conversationId);
    const common = {
      conversationId: request.conversationId,
      generationRequestId: id,
      generationStatus: "failed" as const,
    };
    const userMessage = await insertGenerationMessage(tx, {
      ...common,
      role: "user",
      content,
    });
    const message = await insertGenerationMessage(tx, {
      ...common,
      role: "assistant",
      content:
        "这次自拍没有生成成功，本次未扣额度。请稍后再试，也可以点击相机按钮重新生成。",
    });
    await refundGenerationInTransaction(tx, request);
    await cleanupGenerationMedia(tx, request, true);
    await tx
      .update(generationRequests)
      .set({ status: "failed" })
      .where(eq(generationRequests.id, id));
    return {
      selfie: null,
      message,
      userMessage,
      imageGeneration: "failed" as const,
      relationship: null,
    };
  });
}

/** 回收进程退出或连接中断留下的过期预留，结算仍然幂等。 */
export async function expireGenerations(userId?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const requests = await db
    .select()
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.status, "pending"),
        userId ? eq(generationRequests.userId, userId) : undefined,
        lte(generationRequests.expiresAt, new Date())
      )
    )
    .limit(50);
  for (const request of requests)
    await failGeneration(request.id, request.userId);
}

/** 删除会话时在同一事务退还未完成预留并清理全部生成元数据。 */
export async function cancelConversationGenerations(
  tx: DbTransaction,
  conversationIds: number[]
): Promise<void> {
  if (!conversationIds.length) return;
  const requests = await tx
    .select()
    .from(generationRequests)
    .where(inArray(generationRequests.conversationId, conversationIds))
    .for("update");
  for (const request of requests) {
    if (request.status === "pending") {
      if (request.turnStatus)
        await settleChatTurnInTransaction(tx, request, "stopped", false);
      else await refundGenerationInTransaction(tx, request);
    }
    await cleanupGenerationMedia(tx, request, request.status !== "succeeded");
  }
  await tx
    .delete(generationRequests)
    .where(inArray(generationRequests.conversationId, conversationIds));
}
