import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getCharacterPreset } from "../../shared/characterPresets";
import { DEFAULT_GIRLFRIEND } from "../../shared/defaultGirlfriend";
import {
  getLevelInfo,
  getLevelProgress,
  getNextLevel,
  getPointsToNextLevel,
} from "../../shared/intimacy";
import { BusinessRuleError } from "../_core/businessError";
import { log, providerErrorSummary } from "../_core/log";
import { protectedProcedure, router } from "../_core/trpc";
import { getTierLimits, isBillingEnforced } from "../billing";
import { readDefaultReference, readPresetReference } from "../characterPresets";
import { putStagedMedia } from "../managedMedia";
import { flushMediaDeletions, queueMediaDeletion } from "../mediaCleanup";
import {
  cleanupExpiredTrash,
  createDefaultGirlfriend,
  createGirlfriend,
  getActiveGirlfriend,
  getTrashGirlfriends,
  getUserGirlfriends,
  permanentDeleteGirlfriend,
  restoreGirlfriend,
  softDeleteGirlfriend,
  softDeleteGirlfriends,
  updateGirlfriend,
} from "../repositories/companions";
import { getIntimacyInfo } from "../repositories/intimacy";

export const girlfriendRouter = router({
  /** 校验当前套餐角色数量，保存选定或上传的参考图并创建角色。 */
  create: protectedProcedure
    .input(
      z
        .object({
          name: z.string().min(1).max(100),
          personality: z.string().min(1),
          appearance: z.string().min(1),
          interests: z.string().optional(),
          customPrompt: z.string().max(300).optional(),
          presetId: z
            .string()
            .refine(id => !!getCharacterPreset(id), "角色预设不存在")
            .optional(),
          referenceImageBase64: z.string().min(1).optional(),
          referenceImageMimeType: z
            .enum(["image/jpeg", "image/png", "image/gif", "image/webp"])
            .optional(),
        })
        .refine(
          input =>
            input.referenceImageBase64
              ? !!input.referenceImageMimeType
              : !input.referenceImageMimeType && !!input.presetId,
          "请选择角色预设或上传参考照片"
        )
    )
    .mutation(async ({ ctx, input }) => {
      // 档位上限：Free 1 个、Plus 3 个、Pro 不限。
      // 自托管（BILLING_PROVIDER=none）不限。
      const gfTier = await getTierLimits(ctx.user.id);
      const maximum = isBillingEnforced() ? gfTier.limits.maxGirlfriends : null;
      if (isBillingEnforced()) {
        if (gfTier.limits.maxGirlfriends !== null) {
          const existing = await getUserGirlfriends(ctx.user.id);
          if (existing.length >= gfTier.limits.maxGirlfriends) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "UPGRADE_REQUIRED",
              cause: new BusinessRuleError({ reason: "UPGRADE_REQUIRED" }),
            });
          }
        }
      }

      // 上传参考图片到存储
      const imageBuffer = input.referenceImageBase64
        ? Buffer.from(input.referenceImageBase64, "base64")
        : await readPresetReference(input.presetId!);
      const mimeType = input.referenceImageBase64
        ? input.referenceImageMimeType!
        : "image/jpeg";
      if (imageBuffer.length > 10 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "参考照片不能超过 10MB",
        });
      }
      const fileKey = `girlfriend-${ctx.user.id}-${nanoid()}.${mimeType.split("/")[1]}`;

      const { url: imageUrl } = await putStagedMedia(
        ctx.user.id,
        fileKey,
        imageBuffer,
        mimeType
      );

      // 创建女友配置
      let girlfriend;
      try {
        girlfriend = await createGirlfriend(
          {
            userId: ctx.user.id,
            name: input.name,
            personality: input.personality,
            appearance: input.appearance,
            interests: input.interests,
            customPrompt: input.customPrompt || null,
            referenceImageUrl: imageUrl,
            referenceImageKey: fileKey,
            isActive: true,
          },
          maximum
        );
      } catch (error) {
        await queueMediaDeletion(ctx.user.id, [fileKey]).catch(cleanupError =>
          log.error(
            "[media] failed upload will retry",
            providerErrorSummary(cleanupError)
          )
        );
        throw error;
      }

      return girlfriend;
    }),

  /** 读取当前用户激活且未删除的角色。 */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return await getActiveGirlfriend(ctx.user.id);
  }),

  /** 读取当前用户未删除的角色列表。 */
  list: protectedProcedure.query(async ({ ctx }) => {
    return await getUserGirlfriends(ctx.user.id);
  }),

  /** 更新当前用户所属角色的可编辑资料。 */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        personality: z.string().min(1).optional(),
        appearance: z.string().min(1).optional(),
        interests: z.string().optional(),
        customPrompt: z.string().max(300).nullable().optional(),
        isActive: z.boolean().optional(),
        avatarUrl: z.null().optional(),
        avatarKey: z.null().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateGirlfriend(id, ctx.user.id, data);
      return { success: true };
    }),

  /** 校验角色归属和文件大小，上传头像并更新角色引用。 */
  uploadAvatar: protectedProcedure
    .input(
      z.object({
        girlfriendId: z.number(),
        imageBase64: z.string(), // Base64 编码的图片
        mimeType: z.enum([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await getActiveGirlfriend(ctx.user.id, input.girlfriendId)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Companion not found",
        });
      // 验证文件大小（Base64 编码后约为原始大小的 4/3，10MB 原始文件 ≈ 13.33MB Base64）
      const maxBase64Size = (10 * 1024 * 1024 * 4) / 3; // ~13.33MB
      if (input.imageBase64.length > maxBase64Size) {
        throw new Error("图片文件过大，请选择 10MB 以内的图片");
      }

      const imageBuffer = Buffer.from(input.imageBase64, "base64");
      const ext =
        input.mimeType.split("/")[1] === "jpeg"
          ? "jpg"
          : input.mimeType.split("/")[1];
      const fileKey = `avatar-${ctx.user.id}-${input.girlfriendId}-${nanoid()}.${ext}`;

      const { url: avatarUrl } = await putStagedMedia(
        ctx.user.id,
        fileKey,
        imageBuffer,
        input.mimeType
      );

      // 更新女友记录
      try {
        await updateGirlfriend(input.girlfriendId, ctx.user.id, {
          avatarUrl,
          avatarKey: fileKey,
        });
      } catch (error) {
        await queueMediaDeletion(ctx.user.id, [fileKey]).catch(cleanupError =>
          log.error(
            "[media] failed avatar will retry",
            providerErrorSummary(cleanupError)
          )
        );
        throw error;
      }
      await flushMediaDeletions(ctx.user.id);

      return { avatarUrl, avatarKey: fileKey };
    }),

  /** 按用户归属将单个角色移入回收站。 */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await softDeleteGirlfriend(input.id, ctx.user.id);
      return { success: true };
    }),

  /** 按用户归属批量将角色移入回收站。 */
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await softDeleteGirlfriends(input.ids, ctx.user.id);
      return { success: true, count: input.ids.length };
    }),

  /** 清理过期回收站记录后返回当前用户的回收站列表。 */
  trash: protectedProcedure.query(async ({ ctx }) => {
    // 先自动清理超过 7 天的项目
    await cleanupExpiredTrash(ctx.user.id);
    return await getTrashGirlfriends(ctx.user.id);
  }),

  /** 恢复当前用户回收站中的角色，数量上限在事务内重新检查。 */
  restore: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const tier = await getTierLimits(ctx.user.id);
      await restoreGirlfriend(
        input.id,
        ctx.user.id,
        isBillingEnforced() ? tier.limits.maxGirlfriends : null
      );
      return { success: true };
    }),

  /** 按用户归属永久删除角色及关联记录，并回收无引用媒体。 */
  permanentDelete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await permanentDeleteGirlfriend(input.id, ctx.user.id);
      return { success: true };
    }),

  /** 复用已有角色，或在需要时上传内置参考图并创建默认 YUMEI。 */
  ensureDefault: protectedProcedure.mutation(async ({ ctx }) => {
    const girlfriend = await createDefaultGirlfriend(ctx.user.id, async () => {
      const reference = await putStagedMedia(
        ctx.user.id,
        `default-yumei-${ctx.user.id}-${nanoid()}.jpg`,
        await readDefaultReference(),
        "image/jpeg"
      );
      return {
        userId: ctx.user.id,
        name: DEFAULT_GIRLFRIEND.name,
        personality: DEFAULT_GIRLFRIEND.personality,
        appearance: DEFAULT_GIRLFRIEND.appearance,
        interests: DEFAULT_GIRLFRIEND.interests,
        referenceImageUrl: reference.url,
        referenceImageKey: reference.key,
        isActive: true,
      };
    });
    return girlfriend;
  }),

  // ============ 亲密度系统 ============

  /** 读取并计算角色亲密度、衰减和升级进度；底层查询可能写回衰减。 */
  getIntimacy: protectedProcedure
    .input(z.object({ girlfriendId: z.number() }))
    .query(async ({ ctx, input }) => {
      const info = await getIntimacyInfo(input.girlfriendId, ctx.user.id);
      const levelInfo = getLevelInfo(info.intimacyLevel);
      const nextLevel = getNextLevel(info.intimacyLevel);
      const progress = getLevelProgress(info.intimacyPoints);
      const pointsToNext = getPointsToNextLevel(info.intimacyPoints);

      return {
        ...info,
        levelInfo,
        nextLevel,
        progress,
        pointsToNext,
      };
    }),
});
