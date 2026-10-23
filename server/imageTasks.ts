/** 持久图片任务：原子接收、一次预留、后台执行及远端任务恢复。 */
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import axios from "axios";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";
import {
  conversations,
  generationRequests,
  girlfriends,
  type User,
} from "../drizzle/schema";
import type {
  CoupleTaskInput,
  ImageTask,
  ImageTaskInput,
  ImageTaskView,
} from "../shared/imageTasks";
import { METERS } from "../shared/quotas";
import { getPose } from "../shared/selfiePoses";
import { getLevelByPoints } from "../shared/intimacy";
import { BusinessRuleError } from "./_core/businessError";
import {
  ImageTaskProvider,
  ImageTaskOutputError,
} from "./_core/imageTaskProvider";
import {
  imageGenerationModel,
  resolveImageProvider,
} from "./_core/imageProvider";
import { log, providerErrorSummary } from "./_core/log";
import { checkRateLimit } from "./_core/quota";
import { decodeBase64Upload, enforceUpload } from "./_core/uploads";
import { getTierLimits, isBillingEnforced } from "./billing";
import { getDb, withUserTransaction, type DbTransaction } from "./database";
import {
  completeImageGeneration,
  failGeneration,
  insertGenerationMessage,
  requireGenerationConversation,
  reserveGenerationInTransaction,
  type GenerationMeter,
} from "./generations";
import { recordGenerationTelemetry } from "./generationTelemetry";
import { queueMediaDeletion } from "./mediaCleanup";
import { buildCoupleImagePrompt, buildImagePrompt } from "./promptTemplates";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { ensureAgeConfirmed } from "./routers/guards";
import { storagePut } from "./storage";
import { validateTranscription } from "./transcriptions";

type Request = typeof generationRequests.$inferSelect;
type ChatInput = { content: string; transcriptionId?: string };
let scanning = false;

function view(row: Request): ImageTaskView {
  const task = row.imageTask!;
  const failed = row.status === "failed" || row.status === "cancelled";
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.assistantMessageId,
    kind: row.kind === "couple" ? "couple" : "selfie",
    phase: task.phase,
    status:
      row.status === "succeeded"
        ? "completed"
        : failed
          ? "failed"
          : task.phase === "queued" || task.remoteQueued
            ? "queued"
            : "generating",
    scene: task.input.userContext,
    preset: task.preset ?? null,
    imageUrl:
      row.status === "succeeded" && row.outputKey
        ? `/files/${row.outputKey}`
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    coinCost: row.coinAmount,
    quota:
      !row.meterName && !row.coinAmount
        ? "unmetered"
        : row.status === "succeeded"
          ? "charged"
          : failed
            ? "refunded"
            : "reserved",
    isByok: task.isByok,
    failure: task.failure ?? null,
    retryTaskId: task.retryTaskId ?? null,
    retryUntil: task.retryUntil ?? null,
    canRetry:
      failed &&
      task.failure !== "unconfirmed" &&
      task.failure !== "context" &&
      (!row.temporaryKey || (task.retryUntil ?? 0) > Date.now()),
  };
}
async function owned(tx: DbTransaction, userId: string, id: string) {
  const [row] = await tx
    .select()
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.id, id),
        eq(generationRequests.userId, userId),
        isNotNull(generationRequests.imageTask)
      )
    );
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Image task unavailable",
    });
  await requireGenerationConversation(tx, userId, row.conversationId);
  return row;
}
async function imageMeter(userId: string, isByok: boolean, couple: boolean) {
  const tier = await getTierLimits(userId);
  if (
    isBillingEnforced(tier.configuration) &&
    !isByok &&
    couple &&
    !tier.limits.couplePhoto
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "UPGRADE_REQUIRED",
      cause: new BusinessRuleError({ reason: "UPGRADE_REQUIRED" }),
    });
  let meter: GenerationMeter | undefined;
  if (isBillingEnforced(tier.configuration) && !isByok) {
    const period = tier.limits.dailySelfies !== null ? "day" : "month";
    const limit =
      period === "day" ? tier.limits.dailySelfies : tier.limits.monthlySelfies;
    if (limit !== null)
      meter = { name: METERS.selfie, period, limit, what: "selfies" };
  }
  return meter;
}
async function persist(
  tx: DbTransaction,
  user: User,
  id: string,
  clientRequestId: string,
  task: ImageTask,
  contextEpoch: number,
  temporaryKey?: string,
  chat?: ChatInput
) {
  const policy = await getPublishedProductConfig(tx);
  const pending = await tx
    .select({ id: generationRequests.id })
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.userId, user.id),
        isNotNull(generationRequests.imageTask),
        eq(generationRequests.status, "pending")
      )
    );
  if (pending.length >= policy.runtime.image.userConcurrency)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "IMAGE_TASKS_BUSY",
      cause: new BusinessRuleError({ reason: "CONCURRENCY_LIMIT" }),
    });
  const kind = temporaryKey ? "couple" : "selfie";
  await reserveGenerationInTransaction(
    tx,
    {
      userId: user.id,
      conversationId: task.input.conversationId,
      kind,
      chargeCoins: !task.isByok,
      contextEpoch,
      transcriptionId: chat?.transcriptionId,
      outputKey: `image-${user.id}-${id}.png`,
      temporaryKey,
      timeoutMs:
        task.runtime.comfyuiTimeoutMs + task.runtime.reservationGraceMs,
      meter: await imageMeter(user.id, task.isByok, kind === "couple"),
    },
    id
  );
  const userMessage = chat
    ? await insertGenerationMessage(tx, {
        conversationId: task.input.conversationId,
        role: "user",
        content: chat.content,
        generationRequestId: id,
        generationStatus: "pending",
      })
    : undefined;
  const message = await insertGenerationMessage(tx, {
    conversationId: task.input.conversationId,
    role: "assistant",
    content: kind === "couple" ? "[合照]" : "[自拍照片]",
    generationRequestId: id,
    generationStatus: "pending",
  });
  await tx
    .update(generationRequests)
    .set({
      clientRequestId,
      imageTask: task,
      userMessageId: userMessage?.id,
      assistantMessageId: message.id,
      telemetry: {
        promptVersion: `product-config/${policy.revision}:image`,
        provider: task.provider,
        model: task.model,
        isByok: task.isByok,
        durationMs: 0,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        outcome: "failed",
      },
    })
    .where(eq(generationRequests.id, id));
  return view(
    (
      await tx
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.id, id))
    )[0]
  );
}

/** 请求键与输入摘要绑定；重复请求先返回原任务，不重复限流、上传或扣额度。 */
export async function acceptImageTask(
  user: User,
  input: ImageTaskInput | CoupleTaskInput,
  chat?: ChatInput
) {
  ensureAgeConfirmed(user);
  const couple = "userPhotoBase64" in input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...input, clientRequestId: undefined, chat }))
    .digest("hex");
  const id = crypto.randomUUID();
  let uploadedKey: string | undefined;
  try {
    return await withUserTransaction(user.id, async tx => {
      const role = await requireGenerationConversation(
        tx,
        user.id,
        input.conversationId
      );
      const [existing] = await tx
        .select()
        .from(generationRequests)
        .where(
          and(
            eq(generationRequests.userId, user.id),
            eq(generationRequests.clientRequestId, input.clientRequestId)
          )
        );
      if (existing) {
        if (existing.imageTask?.fingerprint !== fingerprint)
          throw new TRPCError({
            code: "CONFLICT",
            message: "IMAGE_REQUEST_CONFLICT",
          });
        return view(existing);
      }
      const policy = await getPublishedProductConfig(tx);
      if (input.userContext.length > policy.runtime.chat.maxInputChars)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Image scene too long",
        });
      await checkRateLimit(user.id, "selfie", policy);
      const provider = await resolveImageProvider(user.id, policy);
      if (!provider.configured)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Image provider unavailable",
        });
      const mode = couple ? "reference" : input.generationMode;
      if (mode === "text" && provider.name !== "comfyui")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Text to image unavailable",
        });
      const [companion] = await tx
        .select()
        .from(girlfriends)
        .where(eq(girlfriends.id, role.girlfriendId));
      const pose =
        !couple && input.poseId
          ? getPose(input.poseId, policy.selfies.poses)
          : undefined;
      if (!couple && input.poseId && !pose)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown pose" });
      const level = getLevelByPoints(
        role.intimacyPoints,
        policy.intimacy.levels
      ).level;
      if (pose && pose.minLevel > level)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "LEVEL_LOCKED",
          cause: new BusinessRuleError({
            reason: "LEVEL_LOCKED",
            requiredLevel: pose.minLevel,
            currentLevel: level,
          }),
        });
      if (chat?.transcriptionId)
        await validateTranscription(
          user.id,
          chat.transcriptionId,
          chat.content
        );
      const refs = [
        { key: companion.referenceImageKey, url: companion.referenceImageUrl },
      ];
      if (couple) {
        // 固定键的写入可安全重做；事务拒绝时交给媒体清理器，不留下上传孤儿。
        const buffer = decodeBase64Upload(input.userPhotoBase64);
        enforceUpload(policy.uploads.couple, buffer, input.userPhotoMimeType);
        uploadedKey = `couple-input-${user.id}-${id}.${input.userPhotoMimeType.split("/")[1]}`;
        const { url } = await storagePut(
          uploadedKey,
          buffer,
          input.userPhotoMimeType
        );
        refs.push({ key: uploadedKey, url });
      }
      const prompt = couple
        ? {
            prompt: buildCoupleImagePrompt(policy, input.userContext),
            mode: "direct" as const,
          }
        : buildImagePrompt(policy, {
            userContext: input.userContext,
            generationMode: mode,
            appearance: companion.appearance,
            pose,
          });
      const task: ImageTask = {
        fingerprint,
        input: {
          conversationId: input.conversationId,
          userContext: input.userContext,
          generationMode: mode,
          ...(!couple && input.poseId ? { poseId: input.poseId } : {}),
        },
        prompt: prompt.prompt,
        promptMode: prompt.mode,
        preset: pose ? { label: pose.label, emoji: pose.emoji } : undefined,
        chatContent: chat?.content,
        provider: provider.name,
        isByok: provider.isByok,
        model: imageGenerationModel(provider.name, mode, refs.length, policy),
        baseUrl:
          provider.name === "comfyui"
            ? policy.models.image.comfyuiBaseUrl!.replace(/\/+$/, "")
            : null,
        workflow: policy.models.image.workflows[mode],
        runtime: policy.runtime.image,
        maxReferenceBytes: Math.max(
          policy.uploads.reference.maxBytes,
          policy.uploads.couple.maxBytes,
          policy.uploads.official.maxBytes
        ),
        references: refs,
        phase: "queued",
      };
      return persist(
        tx,
        user,
        id,
        input.clientRequestId,
        task,
        role.memoryEpoch,
        uploadedKey,
        chat
      );
    });
  } catch (error) {
    if (uploadedKey)
      await queueMediaDeletion(user.id, [uploadedKey]).catch(() => {});
    throw error;
  }
}

export async function getImageTask(userId: string, id: string) {
  return withUserTransaction(userId, async tx =>
    view(await owned(tx, userId, id))
  );
}
export async function findImageTask(userId: string, clientRequestId: string) {
  return withUserTransaction(userId, async tx => {
    const [row] = await tx
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.userId, userId),
          eq(generationRequests.clientRequestId, clientRequestId),
          isNotNull(generationRequests.imageTask)
        )
      );
    if (!row) return null;
    await requireGenerationConversation(tx, userId, row.conversationId);
    return view(row);
  });
}
/** 有界游标分页，不把完整提示词、参考图或远端地址送到浏览器。 */
export async function listImageTasks(
  userId: string,
  input: {
    conversationId?: number;
    cursor?: { createdAt: Date; id: string };
    limit?: number;
    filter?: "all" | "active" | "completed" | "failed";
  }
) {
  const db = (await getDb())!;
  const limit = input.limit ?? 30;
  const rows = await db
    .select({ request: generationRequests, companionName: girlfriends.name })
    .from(generationRequests)
    .innerJoin(
      conversations,
      eq(conversations.id, generationRequests.conversationId)
    )
    .innerJoin(girlfriends, eq(girlfriends.id, conversations.girlfriendId))
    .where(
      and(
        eq(generationRequests.userId, userId),
        eq(conversations.userId, userId),
        eq(girlfriends.userId, userId),
        isNotNull(generationRequests.imageTask),
        input.conversationId
          ? eq(generationRequests.conversationId, input.conversationId)
          : undefined,
        input.filter && input.filter !== "all"
          ? eq(
              generationRequests.status,
              input.filter === "active"
                ? "pending"
                : input.filter === "completed"
                  ? "succeeded"
                  : "failed"
            )
          : undefined,
        input.cursor
          ? or(
              lt(generationRequests.createdAt, input.cursor.createdAt),
              and(
                eq(generationRequests.createdAt, input.cursor.createdAt),
                lt(generationRequests.id, input.cursor.id)
              )
            )
          : undefined,
        isNull(girlfriends.deletedAt)
      )
    )
    .orderBy(desc(generationRequests.createdAt), desc(generationRequests.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1)?.request;
  return {
    items: page.map(row => ({
      ...view(row.request),
      companionName: row.companionName,
    })),
    nextCursor:
      rows.length > limit && last
        ? { createdAt: last.createdAt, id: last.id }
        : undefined,
  };
}
/** 失败任务只创建一个后继；重复点击和刷新后重试都返回这个后继。 */
export async function retryImageTask(user: User, id: string) {
  ensureAgeConfirmed(user);
  return withUserTransaction(user.id, async tx => {
    const row = await owned(tx, user.id, id);
    const source = row.imageTask!;
    if (source.retryTaskId)
      return view(await owned(tx, user.id, source.retryTaskId));
    if (row.status !== "failed") return view(row);
    if (!view(row).canRetry)
      throw new TRPCError({
        code: "CONFLICT",
        message: "IMAGE_RETRY_UNAVAILABLE",
      });
    const role = await requireGenerationConversation(
      tx,
      user.id,
      row.conversationId
    );
    if (role.memoryEpoch !== row.contextEpoch)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Image context changed",
      });
    await ImageTaskProvider.forTask(user.id, source);
    await checkRateLimit(user.id, "selfie");
    const nextId = crypto.randomUUID();
    const recoverTimedOut = source.failure === "timeout" && !!source.remoteId;
    const task: ImageTask = {
      ...source,
      phase: recoverTimedOut ? "running" : "queued",
      remoteId: recoverTimedOut ? source.remoteId : undefined,
      statusUrl: recoverTimedOut ? source.statusUrl : undefined,
      responseUrl: recoverTimedOut ? source.responseUrl : undefined,
      submittedAt: recoverTimedOut ? source.submittedAt : undefined,
      remoteQueued: recoverTimedOut ? source.remoteQueued : undefined,
      failure: undefined,
      retryTaskId: undefined,
      retryUntil: undefined,
      chatContent: undefined,
    };
    const result = await persist(
      tx,
      user,
      nextId,
      nextId,
      task,
      role.memoryEpoch,
      row.temporaryKey ?? undefined
    );
    await tx
      .update(generationRequests)
      .set({ imageTask: { ...source, retryTaskId: nextId } })
      .where(eq(generationRequests.id, id));
    return result;
  });
}

async function runStep(row: Request, token: string) {
  const db = (await getDb())!;
  const task = structuredClone(row.imageTask!);
  const leaseMs =
    Math.max(
      task.runtime.comfyuiRequestTimeoutMs,
      task.runtime.downloadTimeoutMs
    ) *
      3 +
    30000;
  const where = and(
    eq(generationRequests.id, row.id),
    eq(generationRequests.status, "pending"),
    eq(generationRequests.leaseToken, token)
  );
  const heartbeat = setInterval(
    () => {
      void db
        .update(generationRequests)
        .set({ leaseUntil: new Date(Date.now() + leaseMs) })
        .where(where)
        .catch(error =>
          log.error(
            "[image-task] heartbeat failed",
            providerErrorSummary(error)
          )
        );
    },
    Math.floor(leaseMs / 3)
  );
  heartbeat.unref();
  const save = async () =>
    (
      await db.update(generationRequests).set({ imageTask: task }).where(where)
    )[0].affectedRows > 0;
  const fail = async (reason: ImageTask["failure"]) =>
    failGeneration(row.id, row.userId, {
      leaseToken: token,
      imageFailure: reason,
    });
  let submissionStarted = false;
  let contextChanged = false;
  try {
    if (
      row.expiresAt.getTime() <= Date.now() ||
      Date.now() - row.createdAt.getTime() >= task.runtime.comfyuiTimeoutMs
    ) {
      await fail(task.phase === "submitting" ? "unconfirmed" : "timeout");
      return;
    }
    await withUserTransaction(row.userId, async tx => {
      const role = await requireGenerationConversation(
        tx,
        row.userId,
        row.conversationId
      );
      if (role.memoryEpoch !== row.contextEpoch) {
        contextChanged = true;
        throw new ImageTaskOutputError("Image context changed");
      }
    });
    const provider = await ImageTaskProvider.forTask(row.userId, task);
    if (task.phase === "queued") {
      const refs = await provider.prepare(row.id);
      task.phase = "submitting";
      task.submittedAt = Date.now();
      if (!(await save())) return;
      submissionStarted = true;
      const remote = await provider.submit(row.id, refs);
      Object.assign(task, remote, { phase: "running", remoteQueued: true });
      await save();
      return;
    }
    if (task.phase === "submitting") {
      const remoteId = await provider.recover(row.id);
      if (remoteId) {
        task.remoteId = remoteId;
        task.phase = "running";
        await save();
      }
      // fal 不支持按本地请求键查询；响应不明时保持核对状态，绝不再次提交。
      return;
    }
    const result = await provider.result();
    task.remoteQueued = result.queued;
    if (!result.output) {
      await save();
      return;
    }
    task.phase = "saving";
    if (!(await save())) return;
    const output = await provider.download(result.output);
    const outputKey = row.outputKey!.replace(
      /\.[^.]+$/,
      output.mimeType === "image/jpeg"
        ? ".jpg"
        : output.mimeType === "image/gif"
          ? ".gif"
          : output.mimeType === "image/webp"
            ? ".webp"
            : ".png"
    );
    if (outputKey !== row.outputKey) {
      const [updated] = await db
        .update(generationRequests)
        .set({ outputKey })
        .where(where);
      if (!updated.affectedRows) return;
      row.outputKey = outputKey;
    }
    const { url } = await storagePut(
      row.outputKey!,
      output.buffer,
      output.mimeType
    );
    try {
      await completeImageGeneration(
        row.id,
        row.userId,
        {
          imageUrl: url,
          imageKey: row.outputKey!,
          prompt: task.prompt,
          userContext: task.input.userContext,
          mode: task.promptMode,
        },
        task.chatContent,
        row.kind === "couple" ? "合照" : "自拍照片",
        token
      );
    } catch (error) {
      await queueMediaDeletion(row.userId, [row.outputKey!]);
      throw error;
    }
  } catch (error) {
    log.error("[image-task] step failed", {
      requestId: row.id,
      ...providerErrorSummary(error),
    });
    const transient =
      axios.isAxiosError(error) &&
      (!error.response ||
        error.response.status >= 500 ||
        error.response.status === 429);
    const rejectedSubmission =
      axios.isAxiosError(error) &&
      error.response &&
      error.response.status >= 400 &&
      error.response.status < 500 &&
      error.response.status !== 429;
    // 已知远端编号后仅重查/重存；提交响应不明时由 submitting 阶段恢复。
    if (
      !transient &&
      (!submissionStarted || rejectedSubmission) &&
      !(
        task.phase === "saving" &&
        !(error instanceof TRPCError) &&
        !(error instanceof ImageTaskOutputError)
      )
    )
      await fail(
        contextChanged ||
          (error instanceof TRPCError &&
            ["NOT_FOUND", "FORBIDDEN"].includes(error.code))
          ? "context"
          : task.phase === "submitting" &&
              !(
                axios.isAxiosError(error) &&
                error.response &&
                error.response.status >= 400 &&
                error.response.status < 500
              )
            ? "unconfirmed"
            : "provider"
      );
  } finally {
    clearInterval(heartbeat);
    await db
      .update(generationRequests)
      .set({
        leaseToken: null,
        leaseUntil: new Date(Date.now() + task.runtime.comfyuiPollMs),
      })
      .where(where);
    const [current] = await db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, row.id));
    if (current && current.status !== "pending" && current.telemetry)
      await recordGenerationTelemetry(row.id, row.userId, {
        ...current.telemetry,
        durationMs: Date.now() - row.createdAt.getTime(),
        outcome: current.status === "succeeded" ? "succeeded" : "failed",
      });
  }
}

/** 租约到期后由任意进程接手；领取后再次读取最新任务状态。 */
export async function scanImageTasks(userIds?: string[]) {
  if (scanning) return;
  scanning = true;
  try {
    const db = (await getDb())!;
    const runtime = (await getPublishedProductConfig()).runtime.image;
    const available = or(
      isNull(generationRequests.leaseUntil),
      lte(generationRequests.leaseUntil, new Date())
    );
    const rows = await db
      .select()
      .from(generationRequests)
      .where(
        and(
          isNotNull(generationRequests.imageTask),
          eq(generationRequests.status, "pending"),
          userIds ? inArray(generationRequests.userId, userIds) : undefined,
          available
        )
      )
      .orderBy(generationRequests.updatedAt)
      .limit(runtime.batchSize);
    await Promise.all(
      rows.slice(0, runtime.localConcurrency).map(async row => {
        const token = crypto.randomUUID();
        const [claimed] = await db
          .update(generationRequests)
          .set({ leaseToken: token, leaseUntil: new Date(Date.now() + 600000) })
          .where(
            and(
              eq(generationRequests.id, row.id),
              eq(generationRequests.status, "pending"),
              available
            )
          );
        if (!claimed.affectedRows) return;
        const [current] = await db
          .select()
          .from(generationRequests)
          .where(
            and(
              eq(generationRequests.id, row.id),
              eq(generationRequests.leaseToken, token)
            )
          );
        if (current) await runStep(current, token);
      })
    );
  } finally {
    scanning = false;
  }
}
export function startImageTaskScheduler() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let delay = 1000;
    try {
      delay = (await getPublishedProductConfig()).runtime.image.schedulerMs;
      await scanImageTasks();
    } catch (error) {
      log.error("[image-task] scheduler failed", providerErrorSummary(error));
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), delay);
      timer.unref();
    }
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
