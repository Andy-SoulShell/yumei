import { CHAT_INPUT_CAPACITY } from "../../shared/const";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { recordGenerationTelemetry } from "../generationTelemetry";
import { METERS } from "../../shared/quotas";
import { BusinessRuleError } from "../_core/businessError";
import {
  generateProviderImage,
  imageGenerationModel,
  resolveImageProvider,
} from "../_core/imageProvider";
import { keyProvider } from "../_core/keyProvider";
import { log, providerErrorSummary } from "../_core/log";
import { checkRateLimit, getDailyMeter, getMonthlyMeter } from "../_core/quota";
import { getPublishedProductConfig } from "../repositories/productConfig";
import { protectedProcedure, router } from "../_core/trpc";
import { decodeBase64Upload, enforceUpload } from "../_core/uploads";
import { getTierLimits, isBillingEnforced, upsellHint } from "../billing";
import {
  completeImageGeneration,
  failGeneration,
  reserveGeneration,
  type GenerationMeter,
} from "../generations";
import { flushMediaDeletions, queueMediaDeletion } from "../mediaCleanup";
import { getActiveGirlfriend } from "../repositories/companions";
import { getConversation } from "../repositories/conversations";
import { buildCoupleImagePrompt } from "../promptTemplates";
import {
  deleteSelfie,
  getGirlfriendSelfies,
  getUserSelfies,
} from "../repositories/photos";
import { generateConversationSelfie } from "../selfieGeneration";
import { storagePut } from "../storage";
import { ensureAgeConfirmed } from "./guards";

export const selfieRouter = router({
  /** 由相机入口生成图片，复用聊天自拍的归属、姿势及计量检查。 */
  generate: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userContext: z.string().max(CHAT_INPUT_CAPACITY), // 与聊天输入框上限一致，保留完整画面要求
        generationMode: z.enum(["reference", "text"]).default("reference"),
        // 亲密度解锁的姿势 id（shared/selfiePoses.ts）
        poseId: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => generateConversationSelfie(ctx.user, input)),

  /** 校验 Pro 或 BYOK 权益后上传用户参考图并生成合照。 */
  generateCouple: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userPhotoBase64: z.string().min(1),
        userPhotoMimeType: z.string(),
        userContext: z.string().max(CHAT_INPUT_CAPACITY).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureAgeConfirmed(ctx.user);
      const policy = await getPublishedProductConfig();
      if ((input.userContext?.length ?? 0) > policy.runtime.chat.maxInputChars)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `场景描述最多 ${policy.runtime.chat.maxInputChars} 字符`,
        });
      await checkRateLimit(ctx.user.id, "selfie", policy);

      const conversation = await getConversation(
        input.conversationId,
        ctx.user.id
      );
      if (!conversation) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Conversation not found or not owned by current user",
        });
      }
      const girlfriend = await getActiveGirlfriend(
        ctx.user.id,
        conversation.girlfriendId
      );
      if (!girlfriend) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active girlfriend found",
        });
      }

      // 合照权限由当前套餐决定，用户密钥或自托管模式除外。
      const imageProvider = await resolveImageProvider(ctx.user.id, policy);
      const byokFal = imageProvider.isByok;
      const coupleTier = await getTierLimits(ctx.user.id, policy);
      if (
        isBillingEnforced(policy) &&
        !byokFal &&
        !coupleTier.limits.couplePhoto
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "UPGRADE_REQUIRED",
          cause: new BusinessRuleError({ reason: "UPGRADE_REQUIRED" }),
        });
      }

      if (!imageProvider.configured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            imageProvider.name === "comfyui"
              ? "请先配置 COMFYUI_BASE_URL"
              : "Selfie generation is not configured yet: no fal.ai key available. Set OPERATOR_FAL_KEY on the server, or add your own key in Settings.",
        });
      }

      const photoBuffer = decodeBase64Upload(input.userPhotoBase64);
      enforceUpload(
        policy.uploads.couple,
        photoBuffer,
        input.userPhotoMimeType
      );
      const ext = input.userPhotoMimeType.split("/")[1];
      const photoKey = `couple-input-${ctx.user.id}-${nanoid()}.${ext}`;

      const prompt = buildCoupleImagePrompt(policy, input.userContext);

      const fileKey = `couple-${ctx.user.id}-${nanoid()}.png`;
      const meter: GenerationMeter | undefined =
        isBillingEnforced(policy) && !byokFal
          ? coupleTier.limits.dailySelfies !== null
            ? {
                name: METERS.selfie,
                period: "day",
                limit: coupleTier.limits.dailySelfies,
                what: "selfies",
                hint: upsellHint(coupleTier.tier, coupleTier.configuration),
              }
            : coupleTier.limits.monthlySelfies !== null
              ? {
                  name: METERS.selfie,
                  period: "month",
                  limit: coupleTier.limits.monthlySelfies,
                  what: "selfies",
                  hint: upsellHint(coupleTier.tier, coupleTier.configuration),
                }
              : undefined
          : undefined;
      const requestId = await reserveGeneration({
        userId: ctx.user.id,
        conversationId: input.conversationId,
        kind: "couple",
        contextEpoch: girlfriend.memoryEpoch,
        meter,
        outputKey: fileKey,
        temporaryKey: photoKey,
        timeoutMs:
          policy.runtime.image.comfyuiTimeoutMs +
          policy.runtime.image.reservationGraceMs,
      });
      const started = Date.now();
      let providerCompleted = false;
      try {
        const { url: userPhotoUrl } = await storagePut(
          photoKey,
          photoBuffer,
          input.userPhotoMimeType
        );
        const imageBuffer = await generateProviderImage(
          imageProvider,
          {
            prompt,
            mode: "reference",
            references: [
              {
                key: girlfriend.referenceImageKey,
                url: girlfriend.referenceImageUrl,
              },
              { key: photoKey, url: userPhotoUrl },
            ],
          },
          policy
        );
        providerCompleted = true;
        const { url: storedUrl } = await storagePut(
          fileKey,
          imageBuffer,
          "image/png"
        );
        const { selfie, message, relationship } = await completeImageGeneration(
          requestId,
          ctx.user.id,
          {
            imageUrl: storedUrl,
            imageKey: fileKey,
            prompt,
            userContext: input.userContext || "couple photo",
            mode: "direct",
          },
          undefined,
          "合照"
        );
        return { selfie, message, relationship };
      } catch (error) {
        log.error("[couple] generation failed", {
          requestId,
          ...providerErrorSummary(error),
        });
        try {
          await failGeneration(requestId, ctx.user.id);
        } catch (settlementError) {
          log.error(
            "[couple] compensation will retry",
            providerErrorSummary(settlementError)
          );
        }
        await queueMediaDeletion(ctx.user.id, [photoKey, fileKey]).catch(
          cleanupError =>
            log.error(
              "[couple] late output cleanup will retry",
              providerErrorSummary(cleanupError)
            )
        );
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "合照生成失败，请稍后重试；失败请求不计入用量。",
        });
      } finally {
        await recordGenerationTelemetry(requestId, ctx.user.id, {
          promptVersion: `product-config/${policy.revision}:image`,
          provider: imageProvider.name,
          model: imageGenerationModel(
            imageProvider.name,
            "reference",
            2,
            policy
          ),
          isByok: imageProvider.isByok,
          durationMs: Date.now() - started,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          outcome: providerCompleted ? "succeeded" : "failed",
        });
        await flushMediaDeletions(ctx.user.id).catch(error =>
          log.error(
            "[couple] media cleanup will retry",
            providerErrorSummary(error)
          )
        );
      }
    }),

  /** 读取当前用户的剩余图片额度与 Provider 能力，供相机入口显示。 */
  quota: protectedProcedure.query(async ({ ctx }) => {
    const policy = await getPublishedProductConfig();
    const keys = await keyProvider.describeUserKeys(ctx.user.id);
    if (!isBillingEnforced(policy) || keys.fal?.isSet === true) {
      return {
        unlimited: true as const,
        used: 0,
        limit: 0,
        remaining: null,
        period: null,
      };
    }
    const { limits } = await getTierLimits(ctx.user.id, policy);
    if (limits.dailySelfies === null && limits.monthlySelfies === null)
      return {
        unlimited: true as const,
        used: 0,
        limit: 0,
        remaining: null,
        period: null,
      };
    if (limits.dailySelfies !== null) {
      const used = await getDailyMeter(ctx.user.id, METERS.selfie);
      return {
        unlimited: false as const,
        used,
        limit: limits.dailySelfies,
        remaining: Math.max(0, limits.dailySelfies - used),
        period: "day" as const,
      };
    }
    const limit = limits.monthlySelfies ?? 0;
    const used = await getMonthlyMeter(ctx.user.id, METERS.selfie);
    return {
      unlimited: false as const,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      period: "month" as const,
    };
  }),

  /** 读取当前用户的相册记录。 */
  list: protectedProcedure.query(async ({ ctx }) => {
    return await getUserSelfies(ctx.user.id);
  }),

  /** 先校验角色归属，再读取该角色的相册记录。 */
  listByGirlfriend: protectedProcedure
    .input(z.object({ girlfriendId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await getGirlfriendSelfies(input.girlfriendId, ctx.user.id);
    }),

  /** 按用户归属删除相册记录，并回收已无其他引用的媒体。 */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSelfie(input.id, ctx.user.id);
      return { success: true };
    }),
});
