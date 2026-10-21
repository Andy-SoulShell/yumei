import { BusinessRuleError } from "./_core/businessError";
/** 聊天与相机共用的自拍生成流程，负责归属、姿势、套餐和保存。 */

import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { METERS } from "../shared/quotas";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { getPose } from "../shared/selfiePoses";
import { getLevelByPoints } from "../shared/intimacy";
import {
  generateProviderImage,
  imageGenerationModel,
  resolveImageProvider,
} from "./_core/imageProvider";
import { log, providerErrorSummary } from "./_core/log";
import { checkRateLimit } from "./_core/quota";
import { getTierLimits, isBillingEnforced, upsellHint } from "./billing";
import { recordGenerationTelemetry } from "./generationTelemetry";
import {
  completeImageGeneration,
  failGeneration,
  failImageGeneration,
  reserveGeneration,
  type GenerationMeter,
} from "./generations";
import { flushMediaDeletions, queueMediaDeletion } from "./mediaCleanup";
import { buildImagePrompt } from "./promptTemplates";
import { getActiveGirlfriend } from "./repositories/companions";
import { getConversation } from "./repositories/conversations";
import { storagePut } from "./storage";

/** 图片生成参数；本次场景文本优先，姿势只用于空输入兜底。 */
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
  const policy = await getPublishedProductConfig();
  if (input.userContext.length > policy.runtime.chat.maxInputChars)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `场景描述最多 ${policy.runtime.chat.maxInputChars} 字符`,
    });
  await checkRateLimit(user.id, "selfie", policy);

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
  const currentLevel = getLevelByPoints(
    girlfriend.intimacyPoints,
    policy.intimacy.levels
  ).level;
  let pose: ReturnType<typeof getPose> | undefined;
  if (input.poseId) {
    pose = getPose(input.poseId, policy.selfies.poses);
    if (!pose) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown pose" });
    }
    if (pose.minLevel > currentLevel) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "LEVEL_LOCKED",
        cause: new BusinessRuleError({
          reason: "LEVEL_LOCKED",
          requiredLevel: pose.minLevel,
          currentLevel,
        }),
      });
    }
  }

  // 2. 用户 fal BYOK 优先，否则使用运营方配置的生图服务。
  const imageProvider = await resolveImageProvider(user.id, policy);
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

  const selfieTier = await getTierLimits(user.id, policy);
  // 3. 本次输入决定画面；无输入时才使用所选姿势，不读取旧对白或情绪。
  const promptResult = buildImagePrompt(policy, {
    userContext: input.userContext,
    generationMode: input.generationMode,
    appearance: girlfriend.appearance,
    pose,
  });
  const imagePrompt = promptResult.prompt;

  const fileKey = `selfie-${user.id}-${nanoid()}.png`;
  const meter: GenerationMeter | undefined =
    isBillingEnforced(policy) && !imageProvider.isByok
      ? selfieTier.limits.dailySelfies !== null
        ? {
            name: METERS.selfie,
            period: "day",
            limit: selfieTier.limits.dailySelfies,
            what: "selfies",
            hint: upsellHint(selfieTier.tier, policy),
          }
        : selfieTier.limits.monthlySelfies !== null
          ? {
              name: METERS.selfie,
              period: "month",
              limit: selfieTier.limits.monthlySelfies,
              what: "selfies",
              hint: upsellHint(selfieTier.tier, policy),
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
    timeoutMs:
      policy.runtime.image.comfyuiTimeoutMs +
      policy.runtime.image.reservationGraceMs,
  });
  const started = Date.now();
  let providerCompleted = false;
  try {
    const imageBuffer = await generateProviderImage(
      imageProvider,
      {
        prompt: imagePrompt,
        mode: input.generationMode,
        references: [
          {
            key: girlfriend.referenceImageKey,
            url: girlfriend.referenceImageUrl,
          },
        ],
      },
      policy
    );
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
      promptVersion: `product-config/${policy.revision}:image`,
      provider: imageProvider.name,
      model: imageGenerationModel(
        imageProvider.name,
        input.generationMode,
        1,
        policy
      ),
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
