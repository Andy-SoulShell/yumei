import { BusinessRuleError } from "./_core/businessError";
/** 聊天与相机共用的自拍生成流程，负责归属、姿势、套餐和保存。 */

import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { METERS } from "../shared/quotas";
import { getPose } from "../shared/selfiePoses";
import {
  generateProviderImage,
  imageGenerationModel,
  resolveImageProvider,
} from "./_core/imageProvider";
import { log, providerErrorSummary } from "./_core/log";
import { checkRateLimit } from "./_core/quota";
import { getTierLimits, isBillingEnforced, upsellHint } from "./billing";
import {
  buildCompanionMediaContext,
  getChatBehaviorContext,
} from "./companionContext";
import { recordGenerationTelemetry } from "./generationTelemetry";
import {
  completeImageGeneration,
  failGeneration,
  failImageGeneration,
  reserveGeneration,
  type GenerationMeter,
} from "./generations";
import { flushMediaDeletions, queueMediaDeletion } from "./mediaCleanup";
import { buildSmartPrompt } from "./promptTemplates";
import { getActiveGirlfriend } from "./repositories/companions";
import {
  getConversation,
  getRecentMessages,
} from "./repositories/conversations";
import { storagePut } from "./storage";

/** 自拍生成参数，场景文本可与姿势片段一起参与提示词构建。 */
type SelfieInput = {
  conversationId: number;
  userContext: string;
  generationMode: "reference" | "text";
  poseId?: string;
  transcriptionId?: string;
};

/**
 * 校验用户、角色和额度后生成图片，并保存聊天消息与相册记录。
 *
 * @param chatContent - 由聊天文字触发时保存的原始用户消息；相机入口不传
 * @remarks 持久预留额度；成功时原子保存消息与相册，失败按原计量周期退款并记录明确状态。
 */
export async function generateConversationSelfie(
  user: { id: string; birthDate: unknown },
  input: SelfieInput,
  chatContent?: string
) {
  // 0a. 年龄门 + 服务端限流。
  if (!user.birthDate)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "AGE_CONFIRMATION_REQUIRED",
    });
  await checkRateLimit(user.id, "selfie");

  // 0b. 验证对话所有权。selfie.generate 此前会无条件
  // INSERT 一条 assistant message 到 input.conversationId，攻击者可借此
  // 把"自拍消息"写进任意对话。
  const conversation = await getConversation(input.conversationId, user.id);
  if (!conversation) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conversation not found or not owned by current user",
    });
  }

  // 1. 获取女友配置
  const girlfriend = await getActiveGirlfriend(
    user.id,
    conversation.girlfriendId
  );
  if (!girlfriend) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No active girlfriend found",
    });
  }

  // 1b. 姿势等级门：解锁进度由亲密度决定，服务端强制。
  let pose: ReturnType<typeof getPose> | undefined;
  if (input.poseId) {
    pose = getPose(input.poseId);
    if (!pose) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown pose" });
    }
    if (pose.minLevel > (girlfriend.intimacyLevel || 1)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "LEVEL_LOCKED",
        cause: new BusinessRuleError({
          reason: "LEVEL_LOCKED",
          requiredLevel: pose.minLevel,
          currentLevel: girlfriend.intimacyLevel || 1,
        }),
      });
    }
  }

  // 2. 用户 fal BYOK 优先，否则使用运营方配置的生图服务。
  const imageProvider = await resolveImageProvider(user.id);
  if (!imageProvider.configured) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        imageProvider.name === "comfyui"
          ? "请先配置 COMFYUI_BASE_URL"
          : "Selfie generation is not configured yet: no fal.ai key available. Set OPERATOR_FAL_KEY on the server, or add your own key in Settings.",
    });
  }
  if (input.generationMode === "text" && imageProvider.name !== "comfyui") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "当前生图服务不支持文生图，请切换到参考图模式",
    });
  }

  const selfieTier = await getTierLimits(user.id);
  const recent = await getRecentMessages(input.conversationId, 4);
  let behaviorContext;
  try {
    behaviorContext = await getChatBehaviorContext(
      user.id,
      girlfriend.id,
      input.userContext
    );
  } catch {
    /* 图片仍可使用已校验角色资料，状态读取失败不额外调用其它服务。 */
  }
  const sceneContext = buildCompanionMediaContext(
    girlfriend,
    behaviorContext,
    recent.filter(
      message =>
        !message.imageUrl &&
        message.id > (girlfriend.memoryForgottenThroughId ?? 0)
    ),
    input.userContext
  );
  // 3. 使用 自拍提示词模板生成提示词
  const combinedContext = pose
    ? sceneContext.trim()
      ? `${pose.promptFragment}, ${sceneContext.trim()}`
      : pose.promptFragment
    : sceneContext;
  const promptResult = buildSmartPrompt({
    userContext: combinedContext,
    mode: pose && pose.mode !== "auto" ? pose.mode : "auto",
  });

  const imagePrompt =
    input.generationMode === "text"
      ? `生成一张角色照片。角色外貌：${girlfriend.appearance}。场景与姿势：${combinedContext || "自然微笑，随手自拍"}。自然光线，画面清晰。`
      : promptResult.prompt;

  const fileKey = `selfie-${user.id}-${nanoid()}.png`;
  const meter: GenerationMeter | undefined =
    isBillingEnforced() && !imageProvider.isByok
      ? selfieTier.limits.dailySelfies !== null
        ? {
            name: METERS.selfie,
            period: "day",
            limit: selfieTier.limits.dailySelfies,
            what: "selfies",
            hint: upsellHint(selfieTier.tier),
          }
        : selfieTier.limits.monthlySelfies !== null
          ? {
              name: METERS.selfie,
              period: "month",
              limit: selfieTier.limits.monthlySelfies,
              what: "selfies",
              hint: upsellHint(selfieTier.tier),
            }
          : undefined
      : undefined;
  const requestId = await reserveGeneration({
    userId: user.id,
    conversationId: input.conversationId,
    kind: "selfie",
    contextEpoch: girlfriend.memoryEpoch,
    transcriptionId: input.transcriptionId,
    meter,
    outputKey: fileKey,
    timeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS || 600_000) + 180_000,
  });
  const started = Date.now();
  let providerCompleted = false;
  try {
    const imageBuffer = await generateProviderImage(imageProvider, {
      prompt: imagePrompt,
      mode: input.generationMode,
      references: [
        {
          key: girlfriend.referenceImageKey,
          url: girlfriend.referenceImageUrl,
        },
      ],
    });
    providerCompleted = true;
    const { url } = await storagePut(fileKey, imageBuffer, "image/png");
    return await completeImageGeneration(
      requestId,
      user.id,
      {
        imageUrl: url,
        imageKey: fileKey,
        prompt: imagePrompt,
        userContext: input.userContext,
        mode: promptResult.mode,
      },
      chatContent
    );
  } catch (error) {
    log.error("[selfie] generation failed", {
      requestId,
      ...providerErrorSummary(error),
    });
    await queueMediaDeletion(user.id, [fileKey]).catch(cleanupError =>
      log.error(
        "[selfie] late output cleanup will retry",
        providerErrorSummary(cleanupError)
      )
    );
    if (chatContent !== undefined) {
      try {
        return await failImageGeneration(requestId, user.id, chatContent);
      } catch (settlementError) {
        log.error(
          "[selfie] failed reply unavailable",
          providerErrorSummary(settlementError)
        );
      }
    }
    try {
      await failGeneration(requestId, user.id);
    } catch (settlementError) {
      log.error(
        "[selfie] compensation will retry",
        providerErrorSummary(settlementError)
      );
    }
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "自拍生成失败，请稍后重试；失败请求不计入用量。",
    });
  } finally {
    await recordGenerationTelemetry(requestId, user.id, {
      promptVersion: "companion-media/1",
      provider: imageProvider.name,
      model: imageGenerationModel(imageProvider.name, input.generationMode, 1),
      isByok: imageProvider.isByok,
      durationMs: Date.now() - started,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      outcome: providerCompleted ? "succeeded" : "failed",
    });
    await flushMediaDeletions(user.id).catch(error =>
      log.error(
        "[selfie] media cleanup will retry",
        providerErrorSummary(error)
      )
    );
  }
}
