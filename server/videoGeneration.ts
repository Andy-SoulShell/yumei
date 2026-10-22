/** 持久视频任务：原子接收与计量、租约执行、远端任务恢复及消息结算。 */
import { TRPCError } from "@trpc/server";
import axios from "axios";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  generationRequests,
  girlfriends,
  messages,
  conversations,
  type User,
} from "../drizzle/schema";
import { type VideoInput, type VideoTask, videoTiming } from "../shared/video";
import { METERS } from "../shared/quotas";
import { getDb, withUserTransaction } from "./database";
import {
  cleanupGenerationMedia,
  insertGenerationMessage,
  refundGenerationInTransaction,
  requireGenerationConversation,
  reserveGenerationInTransaction,
} from "./generations";
import { getPublishedProductConfig } from "./repositories/productConfig";
import {
  ComfyUIVideoClient,
  ComfyUIVideoOutputError,
} from "./_core/comfyuiVideo";
import { BusinessRuleError } from "./_core/businessError";
import type { VideoRejection } from "../shared/errors";
import { isBillingEnforced } from "./billing";
import { log, providerErrorSummary } from "./_core/log";
import { storagePut, storageRead } from "./storage";
import { queueMediaDeletion } from "./mediaCleanup";
import { ensureAgeConfirmed } from "./routers/guards";
import { inspectMp4 } from "./_core/mp4Metadata";

type Request = typeof generationRequests.$inferSelect;
let scanning = false;

function rejectVideo(
  reason: VideoRejection,
  code: ConstructorParameters<typeof TRPCError>[0]["code"]
): never {
  throw new TRPCError({
    code,
    message: reason,
    cause: new BusinessRuleError({ reason: "VIDEO_REJECTED", code: reason }),
  });
}

function snapshot(row: Request) {
  const task = row.videoTask!;
  return {
    id: row.id,
    input: task.input,
    conversationId: row.conversationId,
    messageId: row.assistantMessageId,
    status: row.status,
    phase: task.phase,
    mode: task.input.mode,
    prompt: task.input.prompt,
    durationSeconds: task.output?.durationSeconds ?? task.frames / task.fps,
    width: task.output?.width ?? null,
    height: task.output?.height ?? null,
    sizeBytes: task.output?.sizeBytes ?? null,
    fps: task.fps,
    videoUrl:
      row.status === "succeeded" && row.outputKey
        ? `/files/${row.outputKey}`
        : null,
    createdAt: row.createdAt,
  };
}

/** 同一用户请求键绑定相同输入；并发重复点击只预留一次额度并创建一条消息。 */
export async function acceptVideo(user: User, input: VideoInput) {
  ensureAgeConfirmed(user);
  return withUserTransaction(user.id, async tx => {
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
      const previous = existing.videoTask?.input;
      if (
        existing.kind !== "video" ||
        !previous ||
        previous.conversationId !== input.conversationId ||
        previous.prompt !== input.prompt ||
        previous.mode !== input.mode ||
        previous.durationSeconds !== input.durationSeconds ||
        previous.referenceMessageId !== input.referenceMessageId
      )
        rejectVideo("requestConflictError", "CONFLICT");
      return snapshot(existing);
    }
    const policy = await getPublishedProductConfig(tx);
    const model = policy.models.video;
    const runtime = policy.runtime.video;
    if (!model.enabled || !model.comfyuiBaseUrl)
      rejectVideo("disabledError", "PRECONDITION_FAILED");
    if (
      input.prompt.length > runtime.maxPromptChars ||
      input.durationSeconds < runtime.minDurationSeconds ||
      input.durationSeconds > runtime.maxDurationSeconds
    )
      rejectVideo("inputError", "BAD_REQUEST");
    const pending = await tx
      .select({ id: generationRequests.id })
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.userId, user.id),
          eq(generationRequests.kind, "video"),
          eq(generationRequests.status, "pending")
        )
      );
    if (pending.length >= runtime.userConcurrency)
      rejectVideo("busyError", "TOO_MANY_REQUESTS");
    let referenceKey: string | null = null;
    if (input.mode === "reference") {
      if (input.referenceMessageId !== null) {
        const [image] = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, input.referenceMessageId),
              eq(messages.conversationId, input.conversationId)
            )
          );
        if (!image?.imageKey || !image.imageUrl)
          rejectVideo("referenceError", "BAD_REQUEST");
        referenceKey = image.imageKey;
      } else {
        const [companion] = await tx
          .select()
          .from(girlfriends)
          .where(eq(girlfriends.id, role.girlfriendId));
        referenceKey = companion.referenceImageKey;
        if (!referenceKey) rejectVideo("referenceError", "BAD_REQUEST");
      }
    }
    const workflow = model.workflows[input.mode];
    const { frames, fps } = videoTiming(workflow, input.durationSeconds);
    const id = crypto.randomUUID();
    const outputKey = `video-${user.id}-${id}.mp4`;
    await reserveGenerationInTransaction(
      tx,
      {
        userId: user.id,
        conversationId: input.conversationId,
        kind: "video",
        outputKey,
        timeoutMs: runtime.timeoutMs,
        meter:
          isBillingEnforced(policy) && runtime.dailyLimit !== null
            ? {
                name: METERS.video,
                period: "day",
                limit: runtime.dailyLimit,
                what: "videos",
              }
            : undefined,
      },
      id
    ).catch(error => {
      if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS")
        rejectVideo("quotaError", "TOO_MANY_REQUESTS");
      throw error;
    });
    const task: VideoTask = {
      input,
      workflow,
      runtime,
      baseUrl: model.comfyuiBaseUrl,
      referenceKey,
      phase: "queued",
      frames,
      fps,
    };
    const message = await insertGenerationMessage(tx, {
      conversationId: input.conversationId,
      role: "assistant",
      content: "[视频]",
      generationRequestId: id,
      generationStatus: "pending",
    });
    await tx
      .update(generationRequests)
      .set({
        clientRequestId: input.clientRequestId,
        videoTask: task,
        assistantMessageId: message.id,
      })
      .where(eq(generationRequests.id, id));
    const [row] = await tx
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, id));
    return snapshot(row);
  });
}

/** 仅返回当前用户仍可访问的会话中的视频，不暴露工作流、地址或凭据。 */
export async function getVideo(userId: string, id: string) {
  return withUserTransaction(userId, async tx => {
    const [row] = await tx
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.id, id),
          eq(generationRequests.userId, userId),
          eq(generationRequests.kind, "video")
        )
      );
    if (!row?.videoTask) rejectVideo("unavailableError", "NOT_FOUND");
    await requireGenerationConversation(tx, userId, row.conversationId);
    return snapshot(row);
  });
}

/** 原子结算消息、任务和额度；租约持有者发生变化时禁止迟到写入。 */
async function settle(
  row: Request,
  status: "succeeded" | "failed" | "cancelled",
  token?: string
) {
  return withUserTransaction(row.userId, async tx => {
    const [current] = await tx
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, row.id))
      .for("update");
    if (
      !current ||
      current.status !== "pending" ||
      (token && current.leaseToken !== token)
    )
      return false;
    if (status === "cancelled" && current.videoTask?.phase !== "queued")
      rejectVideo("submittedError", "CONFLICT");
    if (status === "succeeded") {
      await requireGenerationConversation(tx, row.userId, row.conversationId);
      if (current.expiresAt.getTime() <= Date.now()) return false;
    } else {
      await refundGenerationInTransaction(tx, current);
      await cleanupGenerationMedia(tx, current, true);
    }
    await tx
      .update(messages)
      .set({
        generationStatus: status === "cancelled" ? "stopped" : status,
        ...(status === "succeeded" ? { imageKey: current.outputKey } : {}),
      })
      .where(eq(messages.generationRequestId, row.id));
    await tx
      .update(generationRequests)
      .set({ status, leaseUntil: null, leaseToken: null })
      .where(eq(generationRequests.id, row.id));
    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, row.conversationId));
    return true;
  });
}

/** 仅取消尚未提交到远端的排队任务并退还预留，阻止取消后反复提交占用 GPU。 */
export async function cancelVideo(userId: string, id: string) {
  await getVideo(userId, id);
  const db = (await getDb())!;
  const [row] = await db
    .select()
    .from(generationRequests)
    .where(eq(generationRequests.id, id));
  if (row.status === "pending" && (await settle(row, "cancelled"))) {
    if (row.videoTask?.promptId)
      await new ComfyUIVideoClient(row.videoTask)
        .cancel(row.videoTask.promptId)
        .catch(() => {});
  }
  return getVideo(userId, id);
}

/** 执行一个可恢复步骤；提交阶段先落库，响应丢失后只找回任务，不重复提交。 */
async function runStep(row: Request, token: string) {
  const db = (await getDb())!;
  const task = structuredClone(row.videoTask!);
  const client = new ComfyUIVideoClient(task);
  const where = and(
    eq(generationRequests.id, row.id),
    eq(generationRequests.status, "pending"),
    eq(generationRequests.leaseToken, token)
  );
  const heartbeat = setInterval(
    () => {
      void db
        .update(generationRequests)
        .set({ leaseUntil: new Date(Date.now() + task.runtime.leaseMs) })
        .where(where)
        .catch(error =>
          log.error("[video] heartbeat failed", providerErrorSummary(error))
        );
    },
    Math.floor(task.runtime.leaseMs / 3)
  );
  heartbeat.unref();
  const save = async () => {
    const [result] = await db
      .update(generationRequests)
      .set({ videoTask: task })
      .where(where);
    return result.affectedRows > 0;
  };
  try {
    if (row.expiresAt.getTime() <= Date.now()) {
      await settle(row, "failed", token);
      if (task.promptId) await client.cancel(task.promptId).catch(() => {});
      return;
    }
    // 在网络调用之前复核角色和会话；查询结果不作为跨请求的授权凭据。
    await getVideo(row.userId, row.id);
    if (task.phase === "queued") {
      let reference: string | undefined;
      if (task.referenceKey) {
        const data = await storageRead(task.referenceKey);
        const policy = await getPublishedProductConfig();
        if (data.length > policy.uploads.reference.maxBytes)
          throw new Error("视频首帧超过容量限制");
        reference = await client.upload(data, row.id);
      }
      task.phase = "submitting";
      task.submittedAt = Date.now();
      if (!(await save())) return;
      const promptId = await client.submit(row.id, reference);
      task.promptId = promptId;
      task.phase = "running";
      if (!(await save())) await client.cancel(promptId).catch(() => {});
      return;
    }
    if (task.phase === "submitting") {
      const promptId = await client.recover(row.id);
      if (promptId) {
        task.promptId = promptId;
        task.phase = "running";
        await save();
      } else if (
        Date.now() - (task.submittedAt ?? row.createdAt.getTime()) >
        task.runtime.requestTimeoutMs * 2
      ) {
        await settle(row, "failed", token);
      }
      return;
    }
    if (!task.promptId) throw new Error("视频任务缺少远端编号");
    const file = await client.result(task.promptId);
    if (!file) return;
    task.phase = "saving";
    if (!(await save())) return;
    const buffer = await client.download(file);
    task.output = inspectMp4(buffer);
    if (!(await save())) return;
    await storagePut(row.outputKey!, buffer, "video/mp4");
    if (!(await settle(row, "succeeded", token))) {
      const [current] = await db
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.id, row.id));
      if (
        !current ||
        current.status === "failed" ||
        current.status === "cancelled"
      )
        await queueMediaDeletion(row.userId, [row.outputKey!]);
    }
  } catch (error) {
    log.error("[video] step failed", {
      requestId: row.id,
      ...providerErrorSummary(error),
    });
    // 网络故障继续查询同一个远端任务；提交响应不明时也不创建第二个任务。
    const transient =
      axios.isAxiosError(error) &&
      (!error.response ||
        error.response.status >= 500 ||
        error.response.status === 429);
    if (
      !transient &&
      !(
        task.phase === "saving" &&
        !(error instanceof TRPCError) &&
        !(error instanceof ComfyUIVideoOutputError)
      )
    )
      await settle(row, "failed", token);
  } finally {
    clearInterval(heartbeat);
    await db
      .update(generationRequests)
      .set({
        leaseToken: null,
        leaseUntil: new Date(Date.now() + task.runtime.pollMs),
      })
      .where(where);
  }
}

/** 从数据库领取到期步骤；进程退出后租约过期即可继续查询原有远端任务。 */
export async function scanVideoTasks(userIds?: string[]) {
  if (scanning) return;
  scanning = true;
  try {
    const db = (await getDb())!;
    const runtime = (await getPublishedProductConfig()).runtime.video;
    const available = or(
      isNull(generationRequests.leaseUntil),
      lte(generationRequests.leaseUntil, new Date())
    );
    const rows = await db
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.kind, "video"),
          eq(generationRequests.status, "pending"),
          userIds ? inArray(generationRequests.userId, userIds) : undefined,
          available
        )
      )
      .orderBy(generationRequests.updatedAt)
      .limit(runtime.batchSize);
    await Promise.all(
      rows.slice(0, runtime.localConcurrency).map(async row => {
        if (!row.videoTask) return;
        const token = crypto.randomUUID();
        const [claimed] = await db
          .update(generationRequests)
          .set({
            leaseToken: token,
            leaseUntil: new Date(Date.now() + row.videoTask.runtime.leaseMs),
          })
          .where(
            and(
              eq(generationRequests.id, row.id),
              eq(generationRequests.status, "pending"),
              available
            )
          );
        if (claimed.affectedRows) {
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
        }
      })
    );
  } finally {
    scanning = false;
  }
}

/** 启动动态配置调度器；停止后不再领取任务，执行中的步骤由租约保护。 */
export function startVideoScheduler() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let delay = 5000;
    try {
      delay = (await getPublishedProductConfig()).runtime.video.schedulerMs;
      await scanVideoTasks();
    } catch (error) {
      log.error("[video] scheduler failed", providerErrorSummary(error));
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
