import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { METERS } from "../../shared/quotas";
import { BusinessRuleError } from "../_core/businessError";
import {
  generateProviderImage,
  resolveImageProvider,
} from "../_core/imageProvider";
import { keyProvider } from "../_core/keyProvider";
import { log, providerErrorSummary } from "../_core/log";
import { checkRateLimit, getDailyMeter, getMonthlyMeter } from "../_core/quota";
import { protectedProcedure, router } from "../_core/trpc";
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
        userContext: z.string(), // 用户的上下文描述，如 "wearing a red dress"
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
        userContext: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureAgeConfirmed(ctx.user);
      await checkRateLimit(ctx.user.id, "selfie");

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

      // 档位门：Pro 专属（BYOK fal 或自托管除外）。
      const imageProvider = await resolveImageProvider(ctx.user.id);
      const byokFal = imageProvider.isByok;
      const coupleTier = await getTierLimits(ctx.user.id);
      if (isBillingEnforced() && !byokFal && coupleTier.tier !== "pro") {
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

      // 校验并上传用户照片（10MB 上限，与头像一致）。
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(input.userPhotoMimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unsupported photo format (use JPG/PNG/WebP)",
        });
      }
      const photoBuffer = Buffer.from(input.userPhotoBase64, "base64");
      if (photoBuffer.length > 10 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Photo exceeds 10MB",
        });
      }
      const ext = input.userPhotoMimeType.split("/")[1];
      const photoKey = `couple-input-${ctx.user.id}-${nanoid()}.${ext}`;

      const scene = input.userContext?.trim()
        ? `, ${input.userContext.trim()}`
        : ", in a cozy warm setting";
      const prompt =
        imageProvider.name === "comfyui"
          ? `Create a natural couple photo of the people from <image1> and <image2> together, standing close and happy, looking at the camera${scene}. Use each image as an identity reference and preserve both faces.`
          : `a natural couple photo of these two people together, standing close and happy, looking at the camera${scene}. keep both faces consistent with the source images`;

      const fileKey = `couple-${ctx.user.id}-${nanoid()}.png`;
      const meter: GenerationMeter | undefined =
        isBillingEnforced() && !byokFal
          ? coupleTier.limits.dailySelfies !== null
            ? {
                name: METERS.selfie,
                period: "day",
                limit: coupleTier.limits.dailySelfies,
                what: "selfies",
                hint: upsellHint(coupleTier.tier),
              }
            : coupleTier.limits.monthlySelfies !== null
              ? {
                  name: METERS.selfie,
                  period: "month",
                  limit: coupleTier.limits.monthlySelfies,
                  what: "selfies",
                  hint: upsellHint(coupleTier.tier),
                }
              : undefined
          : undefined;
      const requestId = await reserveGeneration({
        userId: ctx.user.id,
        conversationId: input.conversationId,
        kind: "couple",
        meter,
        outputKey: fileKey,
        temporaryKey: photoKey,
        timeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS || 600_000) + 180_000,
      });
      try {
        const { url: userPhotoUrl } = await storagePut(
          photoKey,
          photoBuffer,
          input.userPhotoMimeType
        );
        const imageBuffer = await generateProviderImage(imageProvider, {
          prompt,
          mode: "reference",
          references: [
            {
              key: girlfriend.referenceImageKey,
              url: girlfriend.referenceImageUrl,
            },
            { key: photoKey, url: userPhotoUrl },
          ],
        });
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
    const keys = await keyProvider.describeUserKeys(ctx.user.id);
    if (!isBillingEnforced() || keys.fal?.isSet === true) {
      return {
        unlimited: true as const,
        used: 0,
        limit: 0,
        remaining: null,
        period: null,
      };
    }
    const { limits } = await getTierLimits(ctx.user.id);
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
