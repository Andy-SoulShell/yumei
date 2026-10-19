/** 业务 tRPC 路由入口，组织认证、角色、聊天、图片、记忆、套餐与语音流程。 */

import { getSessionCookieOptions } from "./_core/cookies";
import {
  keyProvider,
  KEY_NAMES,
  validateProviderKey,
  type KeyName,
} from "./_core/keyProvider";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createGirlfriend,
  getActiveGirlfriend,
  getUserGirlfriends,
  updateGirlfriend,
  softDeleteGirlfriend,
  softDeleteGirlfriends,
  restoreGirlfriend,
  permanentDeleteGirlfriend,
  getTrashGirlfriends,
  cleanupExpiredTrash,
  createConversation,
  resumeConversation,
  getUserConversations,
  getConversation,
  createMessage,
  getConversationMessages,
  getRecentMessages,
  createSelfie,
  getUserSelfies,
  getGirlfriendSelfies,
  deleteSelfie,
  upsertApiConfig,
  getUserApiConfig,
  getConversationsWithLastMessage,
  createDefaultGirlfriend,
  searchConversations,
  getGirlfriendMood,
  upsertGirlfriendMood,
  getAllGirlfriendMoods,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  checkAndCreateProactiveNotification,
  getIntimacyInfo,
  addIntimacyPoints,
  setUserBirthDate,
} from "./db";
import { detectSelfHarm, SAFETY_SYSTEM_CLAUSE } from "../shared/safety";
import {
  buildMemoryPromptBlock,
  maybeExtractMemories,
  listMemories,
  deleteMemory,
  setMemoryPinned,
} from "./memory";
import { DEFAULT_GIRLFRIEND } from "../shared/defaultGirlfriend";
import { getCharacterPreset } from "../shared/characterPresets";
import { readDefaultReference, readPresetReference } from "./characterPresets";
import {
  POINTS_RULES,
  DAILY_POINTS_LIMIT,
  getLevelInfo,
  getNextLevel,
  getLevelProgress,
  getPointsToNextLevel,
} from "../shared/intimacy";
import { FREE_TIER_DEFAULT_MODEL, METERS } from "../shared/quotas";
import {
  getBillingMode,
  getCheckoutUrls,
  getSubscription,
  getTierLimits,
  isBillingEnforced,
  upsellHint,
} from "./billing";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import {
  checkRateLimit,
  consumeDailyMeter,
  consumeMonthlyMeter,
  tryConsumeDailyMeter,
  getDailyMeter,
  getMonthlyMeter,
  isOnCooldown,
  markCooldown,
} from "./_core/quota";
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  hasPushSubscription,
  sendPushToUser,
} from "./push";
import axios from "axios";
import { resolveChatProvider } from "./_core/chatProvider";
import {
  resolveImageProvider,
  generateProviderImage,
} from "./_core/imageProvider";
import { generateConversationSelfie } from "./selfieGeneration";
import { detectSelfieRequest } from "../shared/selfieRequest";
import { transcribeWithOpenAI } from "./_core/openaiWhisper";

// 明确的自拍请求和相机按钮共用同一生图流程；日常聊天词不会触发生图。

// 年龄门（18+）：产品定位成人陪伴，AI 路由在用户确认年龄前拒绝
// 服务。birthDate 在 auth.confirmAge 里做服务端 18+ 校验后写入。
/**
 * 要求用户已保存成年确认日期，缺少时抛出 AGE_CONFIRMATION_REQUIRED。
 *
 * @remarks 此处检查是否存在日期，实际年龄计算在确认接口执行。
 */
function ensureAgeConfirmed(user: { birthDate: Date | string | null }) {
  if (!user.birthDate) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "AGE_CONFIRMATION_REQUIRED",
    });
  }
}

/** 按 UTC 年月日计算截至当前日期的完整周岁。 */
function yearsSince(date: Date): number {
  const now = new Date();
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())
  ) {
    years -= 1;
  }
  return years;
}

/** 前后端共享的业务路由树，资源归属与功能权限在具体过程内校验。 */
export const appRouter = router({
  system: systemRouter,
  /** 当前用户资料、成年确认与退出操作。 */
  auth: router({
    /** 返回上下文中已解析的应用用户，未登录时返回 null。 */
    me: publicProcedure.query(opts => opts.ctx.user),

    /** 校验输入日期及周岁，保存当前用户的成年确认日期。 */
    confirmAge: protectedProcedure
      .input(
        z.object({
          birthDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const birthDate = new Date(`${input.birthDate}T00:00:00Z`);
        if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please enter a valid date of birth.",
          });
        }
        if (yearsSince(birthDate) < 18) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "YUMEI is an 18+ service. You must be at least 18 years old to use it.",
          });
        }
        await setUserBirthDate(ctx.user.id, birthDate);
        return { ok: true as const };
      }),

    /**
     * 清理当前请求对应的会话 Cookie 并返回成功。
     *
     * @remarks 当前不撤销数据库会话，也未处理 HTTPS 环境的安全前缀 Cookie。
     */
    logout: publicProcedure.mutation(({ ctx }) => {
      // 此入口目前只清理固定名称的 Cookie；会话撤销和 HTTPS 前缀处理待补齐。
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie("better-auth.session_token", {
        ...cookieOptions,
        maxAge: -1,
      });
      ctx.res.clearCookie("better-auth.session_data", {
        ...cookieOptions,
        maxAge: -1,
      });
      return {
        success: true,
      } as const;
    }),
  }),

  // 陪伴角色管理。
  /** 角色资料、参考图、回收站与亲密度操作。 */
  girlfriend: router({
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
        if (isBillingEnforced()) {
          const gfTier = await getTierLimits(ctx.user.id);
          if (gfTier.limits.maxGirlfriends !== null) {
            const existing = await getUserGirlfriends(ctx.user.id);
            if (existing.length >= gfTier.limits.maxGirlfriends) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `UPGRADE_REQUIRED: Your plan allows ${gfTier.limits.maxGirlfriends} companion${gfTier.limits.maxGirlfriends > 1 ? "s" : ""}. Upgrade in Settings to create more.`,
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

        const { url: imageUrl } = await storagePut(
          fileKey,
          imageBuffer,
          mimeType
        );

        // 创建女友配置
        const girlfriend = await createGirlfriend({
          userId: ctx.user.id,
          name: input.name,
          personality: input.personality,
          appearance: input.appearance,
          interests: input.interests,
          customPrompt: input.customPrompt || null,
          referenceImageUrl: imageUrl,
          referenceImageKey: fileKey,
          isActive: true,
        });

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
          avatarUrl: z.string().nullable().optional(),
          avatarKey: z.string().nullable().optional(),
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

        const { url: avatarUrl } = await storagePut(
          fileKey,
          imageBuffer,
          input.mimeType
        );

        // 更新女友记录
        await updateGirlfriend(input.girlfriendId, ctx.user.id, {
          avatarUrl,
          avatarKey: fileKey,
        });

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

    /** 恢复当前用户回收站中的角色；当前未再次检查套餐数量。 */
    restore: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await restoreGirlfriend(input.id, ctx.user.id);
        return { success: true };
      }),

    /** 按用户归属永久删除指定角色的部分关联记录。 */
    permanentDelete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await permanentDeleteGirlfriend(input.id, ctx.user.id);
        return { success: true };
      }),

    /** 复用已有角色，或在需要时上传内置参考图并创建默认 YUMEI。 */
    ensureDefault: protectedProcedure.mutation(async ({ ctx }) => {
      const girlfriend = await createDefaultGirlfriend(
        ctx.user.id,
        async () => {
          const reference = await storagePut(
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
        }
      );
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

    /**
     * 根据客户端上报行为计算经验，检查冷却及每日计量后写入亲密度。
     *
     * @remarks 行为是否真实发生、夜间额外加分和数据库写入一致性仍需进一步加固。
     */
    addPoints: protectedProcedure
      .input(
        z.object({
          girlfriendId: z.number(),
          reason: z.enum([
            "text_message",
            "voice_message",
            "selfie",
            "daily_first",
            "edit_profile",
            "long_conversation",
            "night_chat",
          ]),
          messageLength: z.number().optional(), // 消息长度（用于加成计算）
          voiceDuration: z.number().optional(), // 语音时长（秒）
          conversationRounds: z.number().optional(), // 对话轮数
        })
      )
      .mutation(async ({ ctx, input }) => {
        const rule = POINTS_RULES[input.reason];
        if (!rule)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "无效的经验值类型",
          });

        // 服务端防刷分：冷却与每日上限过去只由前端
        // "自觉"遵守，直连 tRPC 即可绕过。现在由服务端强制，超限时静默
        // 返回 0 分（不报错——加分是聊天的副作用，不该打断主流程）。
        const skipped = (reason: string) => ({
          intimacyLevel: 0,
          intimacyPoints: 0,
          previousLevel: 0,
          leveledUp: false,
          consecutiveDays: 0,
          pointsAdded: 0,
          skipped: true,
          skipReason: reason,
        });

        if (rule.cooldownMinutes) {
          if (isOnCooldown(ctx.user.id, input.reason, rule.cooldownMinutes)) {
            return skipped("冷却中，稍后再获得经验值");
          }
        }
        if (rule.dailyLimit) {
          const perReason = await tryConsumeDailyMeter(
            ctx.user.id,
            METERS.intimacyReason(input.reason),
            rule.dailyLimit
          );
          if (!perReason.allowed) {
            return skipped("该行为今日经验值已达上限");
          }
        }

        // 计算基础经验值
        let points = rule.basePoints;

        // 加成计算
        switch (input.reason) {
          case "text_message":
            if (input.messageLength && input.messageLength > 50) {
              points += rule.bonusPoints || 0;
            }
            break;
          case "voice_message":
            if (input.voiceDuration && input.voiceDuration > 30) {
              points += rule.bonusPoints || 0;
            }
            break;
          case "long_conversation":
            if (input.conversationRounds && input.conversationRounds > 10) {
              points += rule.bonusPoints || 0;
            }
            break;
          default:
            // 其他类型使用基础经验值
            break;
        }

        // 过滤过短消息（< 5 字不计算）
        if (
          input.reason === "text_message" &&
          input.messageLength &&
          input.messageLength < 5
        ) {
          return skipped("消息过短，不计算经验值");
        }

        // 每日总经验值上限（DAILY_POINTS_LIMIT），按实际分值消耗。
        const total = await tryConsumeDailyMeter(
          ctx.user.id,
          METERS.intimacyPoints,
          DAILY_POINTS_LIMIT,
          points
        );
        if (!total.allowed) {
          return skipped("今日经验值总量已达上限");
        }
        markCooldown(ctx.user.id, input.reason);

        const result = await addIntimacyPoints(
          input.girlfriendId,
          ctx.user.id,
          points,
          input.reason
        );

        return {
          ...result,
          pointsAdded: points,
          skipped: false,
          skipReason: null,
        };
      }),
  }),

  // 会话管理。
  /** 会话创建、延续、历史读取与搜索。 */
  conversation: router({
    /** 校验角色归属后复用最近会话，首次创建通过事务内角色行锁串行化。 */
    resume: protectedProcedure
      .input(z.object({ girlfriendId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await resumeConversation(
          ctx.user.id,
          input.girlfriendId
        );
        if (!conversation)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "角色不存在或已删除",
          });
        return conversation;
      }),
    /** 校验角色归属后显式新建会话。 */
    create: protectedProcedure
      .input(
        z.object({
          girlfriendId: z.number(),
          title: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const girlfriend = await getActiveGirlfriend(
          ctx.user.id,
          input.girlfriendId
        );
        if (!girlfriend)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "角色不存在或已删除",
          });
        return await createConversation({
          userId: ctx.user.id,
          girlfriendId: girlfriend.id,
          title: input.title,
        });
      }),

    /** 读取当前用户的全部会话。 */
    list: protectedProcedure.query(async ({ ctx }) => {
      return await getUserConversations(ctx.user.id);
    }),

    /** 读取当前用户会话并补充最近消息及角色信息。 */
    listWithDetails: protectedProcedure.query(async ({ ctx }) => {
      return await getConversationsWithLastMessage(ctx.user.id);
    }),

    /** 按用户归属读取单个会话。 */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return await getConversation(input.id, ctx.user.id);
      }),

    /** 校验会话归属后读取其全部消息。 */
    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!(await getConversation(input.conversationId, ctx.user.id))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Conversation not found or not owned by current user",
          });
        }
        return await getConversationMessages(input.conversationId);
      }),

    /** 按当前用户归属返回关键词命中的会话信息。 */
    search: protectedProcedure
      .input(z.object({ keyword: z.string().min(1).max(100) }))
      .query(async ({ ctx, input }) => {
        return await searchConversations(ctx.user.id, input.keyword);
      }),
  }),

  // 聊天。
  /** 消息发送及文字触发的自拍流程。 */
  chat: router({
    /**
     * 检查成年状态与归属，按明确意图选择自拍或模型回复，并保存消息。
     *
     * @remarks 当前先扣额度；模型失败会保存固定兜底回复并返回成功，已扣额度不退，消息写入也未合并为事务。
     */
    sendMessage: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          content: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 0. 年龄门 + 服务端限流。
        ensureAgeConfirmed(ctx.user);
        checkRateLimit(ctx.user.id, "chat");

        const selfieRequest = detectSelfieRequest(input.content);
        if (selfieRequest && !detectSelfHarm(input.content)) {
          const result = await generateConversationSelfie(
            ctx.user,
            {
              conversationId: input.conversationId,
              userContext: input.content,
              generationMode: "reference",
              poseId: selfieRequest.poseId,
            },
            input.content
          );
          return {
            userMessage: result.userMessage!,
            assistantMessage: result.message,
            safetyNotice: false,
            imageGeneration: result.imageGeneration,
          };
        }

        // 0b. 提前解析 LLM 密钥：BYOK → 运营方 key。缺 key 要在
        // 任何写入/扣配额之前失败，避免半截对话和白烧额度。
        const chatProvider = await resolveChatProvider(ctx.user.id);
        if (!chatProvider.apiKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Chat is not configured yet. Set ${chatProvider.name === "deepseek" ? "OPERATOR_DEEPSEEK_KEY" : "OPERATOR_OPENROUTER_KEY"} on the server, or add your own OpenRouter key in Settings.`,
          });
        }

        // 1. 验证对话所有权（必须在写入前完成）
        // 之前的实现顺序是 createMessage → getConversation，这意味着任何登录用户
        // 传一个别人的 conversationId 也能成功 INSERT 一条 user message 进对方对话。
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

        // 2b. 档位日配额。BYOK 用户自付 API 成本，跳过
        // 用量计量；限流仍然生效。BILLING_PROVIDER=none 的
        // 自托管部署完全不计量。
        const userKeyInfo = await keyProvider.describeUserKeys(ctx.user.id);
        const isByokChat = userKeyInfo.openrouter?.isSet === true;
        const { tier, limits } = await getTierLimits(ctx.user.id);
        if (
          isBillingEnforced() &&
          !isByokChat &&
          limits.dailyMessages !== null
        ) {
          await consumeDailyMeter(
            ctx.user.id,
            METERS.chat,
            limits.dailyMessages,
            "messages",
            upsellHint(tier)
          );
        }

        // 2. 保存用户消息（所有权已校验）
        // TODO: 将用户与助手消息的最终写入组成事务；模型失败目前另存兜底回复。
        const userMessage = await createMessage({
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
        });

        // 3. 获取最近的消息历史（用于上下文）
        const recentMessages = await getRecentMessages(
          input.conversationId,
          10
        );

        // 4. 获取用户全局提示词配置
        const apiConfig = await getUserApiConfig(ctx.user.id);

        // 5. 构建分层系统提示词
        let systemPrompt = `你是${girlfriend.name}，一个虚拟女友。

性格特征：
${girlfriend.personality}

外貌特征：
${girlfriend.appearance}

${girlfriend.interests ? `兴趣爱好：\n${girlfriend.interests}` : ""}

请以${girlfriend.name}的身份与用户对话，保持角色的一致性。你的回复应该自然、友好、充满情感。`;

        // 追加全局提示词（如果有）
        if (apiConfig?.globalPrompt) {
          systemPrompt += `\n\n【全局行为规范】\n${apiConfig.globalPrompt}`;
        }

        // 追加回复语言和长度限制
        if (apiConfig?.replyLanguage && apiConfig.replyLanguage !== "中文") {
          systemPrompt += `\n\n请使用${apiConfig.replyLanguage}回复。`;
        }
        if (apiConfig?.replyLengthLimit) {
          systemPrompt += `\n回复长度控制在${apiConfig.replyLengthLimit}左右。`;
        }

        // 追加个体定制提示词（如果有）
        if (girlfriend.customPrompt) {
          systemPrompt += `\n\n【${girlfriend.name}专属指令】\n${girlfriend.customPrompt}`;
        }

        // 长期记忆注入：按相关性取 top-k，等级越高记得越多。
        // 失败不阻塞聊天。
        try {
          systemPrompt += await buildMemoryPromptBlock(
            ctx.user.id,
            girlfriend.id,
            input.content,
            girlfriend.intimacyLevel || 1
          );
        } catch (error) {
          console.error(
            "[Chat] memory injection failed (non-blocking):",
            error
          );
        }

        // 安全条款：常驻，且排在所有用户可控提示词之后，
        // 避免被全局/个体提示词覆盖。
        systemPrompt += `\n${SAFETY_SYSTEM_CLAUSE}`;

        // 自残/危机表达检测：命中时响应会带 safetyNotice，前端展示
        // 危机干预资源提示，由 shared/safety.ts 的检测结果触发。
        const safetyNotice = detectSelfHarm(input.content);

        // 6. 构建消息历史
        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...recentMessages.map(msg => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
        ];

        // 7. 使用已解析的服务地址和对应密钥调用 LLM。
        let aiResponse: string;
        try {
          const response = await axios.post(
            `${chatProvider.baseUrl}/chat/completions`,
            {
              // 免费档锁定 gpt-4o-mini（控制成本）；
              // 付费档 / BYOK / 自托管可自由选模型。
              model:
                chatProvider.name === "deepseek"
                  ? chatProvider.model
                  : isBillingEnforced() && limits.modelLocked && !isByokChat
                    ? FREE_TIER_DEFAULT_MODEL
                    : apiConfig?.llmModel || FREE_TIER_DEFAULT_MODEL,
              messages,
              ...(chatProvider.name === "deepseek"
                ? { thinking: { type: "disabled" }, max_tokens: 4096 }
                : {}),
            },
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${chatProvider.apiKey}`,
              },
              // 上游挂起不该占死 Express worker。
              timeout: 60_000,
            }
          );
          const messageContent = response.data.choices[0].message.content;
          aiResponse =
            typeof messageContent === "string"
              ? messageContent
              : JSON.stringify(messageContent);
        } catch (error) {
          console.error("[Chat] LLM API error:", error);
          aiResponse = "抱歉，我现在有点累了，稍后再聊吧~";
        }

        // 8. 保存 AI 回复
        const assistantMessage = await createMessage({
          conversationId: input.conversationId,
          role: "assistant",
          content: aiResponse,
        });

        // 9. 异步记忆提取：每 10 条消息触发一次，不阻塞响应。
        maybeExtractMemories({
          userId: ctx.user.id,
          girlfriendId: girlfriend.id,
          conversationId: input.conversationId,
          intimacyLevel: girlfriend.intimacyLevel || 1,
          provider: chatProvider,
        });

        return {
          userMessage,
          assistantMessage,
          safetyNotice,
          imageGeneration: null,
        };
      }),
  }),

  // ============ Selfie Generation ============
  /** 相机自拍、合照、相册及图片额度查询。 */
  selfie: router({
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
      .mutation(({ ctx, input }) =>
        generateConversationSelfie(ctx.user, input)
      ),

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
        checkRateLimit(ctx.user.id, "selfie");

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
            message:
              "UPGRADE_REQUIRED: Couple photos are a Pro feature. Upgrade in Settings, or add your own fal.ai key.",
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

        // 额度与普通自拍共用同一计量器。
        if (isBillingEnforced() && !byokFal) {
          if (coupleTier.limits.dailySelfies !== null) {
            await consumeDailyMeter(
              ctx.user.id,
              METERS.selfie,
              coupleTier.limits.dailySelfies,
              "selfies",
              upsellHint(coupleTier.tier)
            );
          } else if (coupleTier.limits.monthlySelfies !== null) {
            await consumeMonthlyMeter(
              ctx.user.id,
              METERS.selfie,
              coupleTier.limits.monthlySelfies,
              "selfies",
              upsellHint(coupleTier.tier)
            );
          }
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
        const { url: userPhotoUrl } = await storagePut(
          photoKey,
          photoBuffer,
          input.userPhotoMimeType
        );

        const scene = input.userContext?.trim()
          ? `, ${input.userContext.trim()}`
          : ", in a cozy warm setting";
        const prompt =
          imageProvider.name === "comfyui"
            ? `Create a natural couple photo of the people from <image1> and <image2> together, standing close and happy, looking at the camera${scene}. Use each image as an identity reference and preserve both faces.`
            : `a natural couple photo of these two people together, standing close and happy, looking at the camera${scene}. keep both faces consistent with the source images`;

        let imageBuffer: Buffer;
        try {
          imageBuffer = await generateProviderImage(imageProvider, {
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
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              imageProvider.name === "comfyui" && error instanceof Error
                ? error.message
                : "Failed to generate couple photo",
          });
        }

        const fileKey = `couple-${ctx.user.id}-${nanoid()}.png`;
        const { url: storedUrl } = await storagePut(
          fileKey,
          imageBuffer,
          "image/png"
        );

        const selfie = await createSelfie({
          userId: ctx.user.id,
          girlfriendId: girlfriend.id,
          imageUrl: storedUrl,
          imageKey: fileKey,
          prompt,
          userContext: input.userContext || "couple photo",
          mode: "direct",
        });

        const message = await createMessage({
          conversationId: input.conversationId,
          role: "assistant",
          content: `[合照]`,
          imageUrl: storedUrl,
          imageKey: fileKey,
          selfieMode: "direct",
        });

        return { selfie, message };
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
      .query(async ({ input }) => {
        return await getGirlfriendSelfies(input.girlfriendId);
      }),

    /** 按用户归属删除相册记录，当前不删除实际图片对象。 */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteSelfie(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ============ Web Push ============
  /** 浏览器推送公钥与当前用户的端点订阅管理。 */
  push: router({
    /** 返回可公开的 VAPID 公钥，未配置时为 null。 */
    publicKey: publicProcedure.query(() => ({
      key: getVapidPublicKey(),
    })),

    /** 为当前用户保存浏览器推送端点及加密字段。 */
    subscribe: protectedProcedure
      .input(
        z.object({
          endpoint: z.string().url().max(500),
          keys: z.object({ p256dh: z.string(), auth: z.string() }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await savePushSubscription(ctx.user.id, input);
        return { success: true };
      }),

    /** 仅删除当前用户拥有的指定浏览器端点。 */
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().max(500) }))
      .mutation(async ({ ctx, input }) => {
        await removePushSubscription(ctx.user.id, input.endpoint);
        return { success: true };
      }),

    /** 返回当前用户是否有订阅及推送功能是否配置。 */
    status: protectedProcedure.query(async ({ ctx }) => ({
      subscribed: await hasPushSubscription(ctx.user.id),
      configured: getVapidPublicKey() !== null,
    })),
  }),

  // ============ Billing ============
  /** 当前套餐、持久化用量与已配置的升级入口。 */
  billing: router({
    /** 读取当前用户档位、订阅快照、BYOK 标识和用量，按模式提供结账地址。 */
    getInfo: protectedProcedure.query(async ({ ctx }) => {
      const mode = getBillingMode();
      const { tier, limits } = await getTierLimits(ctx.user.id);
      const subscription = await getSubscription(ctx.user.id);
      const keys = await keyProvider.describeUserKeys(ctx.user.id);
      const byok = {
        chat: keys.openrouter?.isSet === true,
        selfie: keys.fal?.isSet === true,
      };

      const chatUsed = await getDailyMeter(ctx.user.id, METERS.chat);
      const selfieUsed =
        limits.dailySelfies !== null
          ? await getDailyMeter(ctx.user.id, METERS.selfie)
          : await getMonthlyMeter(ctx.user.id, METERS.selfie);

      return {
        mode,
        tier,
        limits,
        byok,
        usage: {
          chatToday: chatUsed,
          chatLimit: limits.dailyMessages,
          selfiesUsed: selfieUsed,
          selfieLimit: limits.dailySelfies ?? limits.monthlySelfies,
          selfiePeriod: (limits.dailySelfies !== null ? "day" : "month") as
            | "day"
            | "month",
        },
        subscription: subscription
          ? {
              plan: subscription.plan,
              status: subscription.status,
              renewsAt: subscription.renewsAt,
              endsAt: subscription.endsAt,
            }
          : null,
        checkoutUrls:
          mode === "lemonsqueezy"
            ? getCheckoutUrls()
            : { plus: null, pro: null },
      };
    }),
  }),

  // ============ Long-term Memory (M2) ============
  /** 当前用户的角色记忆列表与置顶、删除操作。 */
  memory: router({
    /** 按当前用户和角色编号读取记忆列表。 */
    list: protectedProcedure
      .input(z.object({ girlfriendId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await listMemories(ctx.user.id, input.girlfriendId);
      }),

    /** 按当前用户归属删除一条记忆。 */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteMemory(ctx.user.id, input.id);
        return { success: true };
      }),

    /** 按当前用户归属更新记忆置顶状态。 */
    setPinned: protectedProcedure
      .input(z.object({ id: z.number(), pinned: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await setMemoryPinned(ctx.user.id, input.id, input.pinned);
        return { success: true };
      }),
  }),

  // ============ API Configuration ============
  /** 用户普通偏好、加密密钥及供应商模型列表。 */
  apiConfig: router({
    /** 返回普通偏好、密钥脱敏状态和已解析 Provider 信息，不回传完整密钥。 */
    get: protectedProcedure.query(async ({ ctx }) => {
      const config = await getUserApiConfig(ctx.user.id);
      const keys = await keyProvider.describeUserKeys(ctx.user.id);
      const chatProvider = await resolveChatProvider(ctx.user.id);
      const imageProvider = await resolveImageProvider(ctx.user.id);
      return {
        // null when the user hasn't saved preferences yet — frontend
        // treats that as "use defaults".
        preferences: config ?? null,
        keys,
        chatProvider: {
          name: chatProvider.name,
          model: chatProvider.model,
          configured: !!chatProvider.apiKey,
        },
        imageProvider: {
          name: imageProvider.name,
          configured: imageProvider.configured,
          supportsTextToImage: imageProvider.name === "comfyui",
        },
      };
    }),

    /** 校验可编辑字段后保存用户普通偏好，不接收完整密钥。 */
    updatePreferences: protectedProcedure
      .input(
        z.object({
          llmModel: z.string().optional(),
          ttsProvider: z
            .enum(["browser", "elevenlabs", "fishaudio"])
            .optional(),
          elevenlabsVoiceId: z.string().optional(),
          elevenlabsVoiceName: z.string().optional(),
          fishAudioModelId: z.string().optional(),
          fishAudioModelName: z.string().optional(),
          globalPrompt: z.string().max(500).nullable().optional(),
          replyLanguage: z.string().max(50).nullable().optional(),
          replyLengthLimit: z.string().max(50).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await upsertApiConfig({
          userId: ctx.user.id,
          ...input,
        });
      }),

    /** 检查 Provider 密钥基本格式，再交由密钥 Provider 加密保存。 */
    setKey: protectedProcedure
      .input(
        z.object({
          name: z.enum(KEY_NAMES as unknown as [KeyName, ...KeyName[]]),
          value: z.string().min(8).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Validate provider-specific key format on explicit submission.
        // Failures bubble as TRPCError for the settings UI.
        try {
          await validateProviderKey(input.name, input.value);
        } catch (err: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err?.message ?? "Key validation failed",
          });
        }
        await keyProvider.setUserKey(ctx.user.id, input.name, input.value);
        return { ok: true as const };
      }),

    /** 删除指定用户密钥，后续可回退到运营方默认凭据。 */
    clearKey: protectedProcedure
      .input(
        z.object({
          name: z.enum(KEY_NAMES as unknown as [KeyName, ...KeyName[]]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await keyProvider.clearUserKey(ctx.user.id, input.name);
        return { ok: true as const };
      }),

    /** 使用服务端解析的凭据读取或构造模型列表。 */
    listModels: protectedProcedure.query(async ({ ctx }) => {
      const chatProvider = await resolveChatProvider(ctx.user.id);
      const apiKey = chatProvider.apiKey;
      if (!apiKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Chat key not configured. Set ${chatProvider.name === "deepseek" ? "OPERATOR_DEEPSEEK_KEY" : "OPERATOR_OPENROUTER_KEY"} on the server, or add your own OpenRouter key in Settings.`,
        });
      }
      if (chatProvider.name === "deepseek") {
        return {
          models: [
            {
              id: chatProvider.model,
              name: chatProvider.model,
              contextLength: 0,
              pricing: { prompt: "0", completion: "0" },
              provider: "deepseek",
            },
          ],
          total: 1,
        };
      }
      try {
        const response = await axios.get(
          "https://openrouter.ai/api/v1/models",
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        const models = response.data.data
          .filter((m: any) => {
            const arch = m.architecture;
            if (!arch) return true;
            const inputMods = arch.input_modalities || [];
            const outputMods = arch.output_modalities || [];
            return inputMods.includes("text") && outputMods.includes("text");
          })
          .map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            contextLength: m.context_length || 0,
            pricing: {
              prompt: m.pricing?.prompt || "0",
              completion: m.pricing?.completion || "0",
            },
            provider: m.id.split("/")[0] || "unknown",
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        return { models, total: models.length };
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "OpenRouter key invalid",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch model list",
        });
      }
    }),

    /** 使用已保存用户凭据或运营方凭据读取 ElevenLabs 音色列表。 */
    listElevenLabsVoices: protectedProcedure.query(async ({ ctx }) => {
      const apiKey = await keyProvider.get(
        { userId: ctx.user.id },
        "elevenlabs"
      );
      if (!apiKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ElevenLabs key not configured",
        });
      }
      try {
        const response = await axios.get(
          "https://api.elevenlabs.io/v1/voices",
          { headers: { "xi-api-key": apiKey } }
        );
        const voices = response.data.voices.map((v: any) => ({
          id: v.voice_id,
          name: v.name,
          category: v.category || "premade",
          description: v.description || "",
          previewUrl: v.preview_url || "",
          labels: v.labels || {},
        }));
        return { voices, total: voices.length };
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "ElevenLabs key invalid",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch voices",
        });
      }
    }),

    /** 使用服务端凭据读取 Fish Audio 音色列表，并支持搜索。 */
    listFishAudioModels: protectedProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const apiKey = await keyProvider.get(
          { userId: ctx.user.id },
          "fish-audio"
        );
        if (!apiKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Fish Audio key not configured",
          });
        }
        try {
          const params: any = { page_size: 100, page_number: 1 };
          if (input.search) params.title = input.search;
          const response = await axios.get("https://api.fish.audio/model", {
            headers: { Authorization: `Bearer ${apiKey}` },
            params,
          });
          const models = response.data.items.map((m: any) => ({
            id: m._id,
            name: m.title || m._id,
            description: m.description || "",
            tags: m.tags || [],
          }));
          return {
            models,
            total: response.data.total || models.length,
          };
        } catch (error: any) {
          const status = error?.response?.status;
          if (status === 401 || status === 403) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Fish Audio key invalid",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch voice models",
          });
        }
      }),
  }),

  // ============ Mood System ============
  /** 当前用户角色的心情状态与基于消息的变化规则。 */
  mood: router({
    /** 按当前用户和角色编号读取心情。 */
    get: protectedProcedure
      .input(z.object({ girlfriendId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await getGirlfriendMood(ctx.user.id, input.girlfriendId);
      }),

    /** 读取当前用户的全部角色心情。 */
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await getAllGirlfriendMoods(ctx.user.id);
    }),

    /**
     * 根据客户端上报消息与本地日期更新心情和消息计数。
     *
     * @remarks 当前未验证真实消息记录或角色是否存在，仅按当前用户写入心情表。
     */
    update: protectedProcedure
      .input(
        z.object({
          girlfriendId: z.number(),
          messageContent: z.string(),
          isUserMessage: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 获取当前心情
        const currentMood = await getGirlfriendMood(
          ctx.user.id,
          input.girlfriendId
        );

        let moodScore = currentMood?.moodScore ?? 70;
        let totalMessages = currentMood?.totalMessages ?? 0;
        let todayMessages = currentMood?.todayMessages ?? 0;

        // 检查是否是新的一天，重置今日消息数
        const now = new Date();
        const lastUpdate = currentMood?.lastMoodUpdate;
        if (lastUpdate) {
          const lastDay = new Date(lastUpdate).toDateString();
          const today = now.toDateString();
          if (lastDay !== today) {
            todayMessages = 0;
          }
        }

        // 增加消息计数
        totalMessages += 1;
        todayMessages += 1;

        // 基于聊天内容调整心情分数
        const content = input.messageContent.toLowerCase();

        // 积极情绪关键词
        const positiveKeywords = [
          "爱",
          "喜欢",
          "开心",
          "快乐",
          "幸福",
          "漂亮",
          "可爱",
          "棒",
          "好棒",
          "想你",
          "想念",
          "亲亲",
          "抱抱",
          "宝贝",
          "亲爱",
          "美丽",
          "温柔",
          "谢谢",
          "感谢",
          "太好了",
          "开心",
          "哈哈",
          "嘻嘻",
          "love",
          "happy",
          "cute",
          "beautiful",
          "miss",
          "hug",
          "kiss",
        ];

        // 消极情绪关键词
        const negativeKeywords = [
          "生气",
          "不开心",
          "难过",
          "伤心",
          "无聊",
          "烦",
          "累",
          "讨厌",
          "分手",
          "再见",
          "拜拜",
          "不想",
          "笨",
          "丑",
          "差",
          "sad",
          "angry",
          "boring",
          "hate",
          "bye",
          "ugly",
        ];

        // 计算情绪变化
        let scoreDelta = 0;

        // 用户发消息本身就是正面信号（表示在乎）
        if (input.isUserMessage) {
          scoreDelta += 2;
        }

        for (const kw of positiveKeywords) {
          if (content.includes(kw)) {
            scoreDelta += 3;
            break;
          }
        }

        for (const kw of negativeKeywords) {
          if (content.includes(kw)) {
            scoreDelta -= 5;
            break;
          }
        }

        // 今日聊天数量加成
        if (todayMessages >= 20) scoreDelta += 2;
        else if (todayMessages >= 10) scoreDelta += 1;

        // 时间衰减：如果上次聊天超过24小时，心情下降
        if (currentMood?.lastChatAt) {
          const hoursSinceLastChat =
            (now.getTime() - new Date(currentMood.lastChatAt).getTime()) /
            3600000;
          if (hoursSinceLastChat > 48) scoreDelta -= 10;
          else if (hoursSinceLastChat > 24) scoreDelta -= 5;
        }

        // 更新分数（限制在 0-100 范围）
        moodScore = Math.max(0, Math.min(100, moodScore + scoreDelta));

        // 根据分数确定心情状态
        let mood:
          | "excited"
          | "happy"
          | "content"
          | "neutral"
          | "lonely"
          | "sad";
        if (moodScore >= 90) mood = "excited";
        else if (moodScore >= 70) mood = "happy";
        else if (moodScore >= 50) mood = "content";
        else if (moodScore >= 30) mood = "neutral";
        else if (moodScore >= 15) mood = "lonely";
        else mood = "sad";

        const result = await upsertGirlfriendMood({
          userId: ctx.user.id,
          girlfriendId: input.girlfriendId,
          mood,
          moodScore,
          lastChatAt: now,
          totalMessages,
          todayMessages,
          lastMoodUpdate: now,
        });

        return result;
      }),
  }),

  // 站内通知。
  /** 站内通知的读取、已读标记与主动生成。 */
  notification: router({
    /** 读取当前用户最近的站内通知。 */
    list: protectedProcedure.query(async ({ ctx }) => {
      return await getUserNotifications(ctx.user.id);
    }),

    /** 统计当前用户未读通知数量。 */
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return await getUnreadNotificationCount(ctx.user.id);
    }),

    /** 按用户归属标记指定通知为已读。 */
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.id, ctx.user.id);
        return { success: true };
      }),

    /** 将当前用户全部通知标记为已读。 */
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),

    /** 尝试生成主动站内通知，成功后异步向已订阅端点投递。 */
    checkProactive: protectedProcedure.mutation(async ({ ctx }) => {
      const notification = await checkAndCreateProactiveNotification(
        ctx.user.id
      );
      if (notification) {
        void sendPushToUser(ctx.user.id, {
          title: notification.title,
          body: notification.content,
          url: "/",
        }).catch(() => {});
      }
      return notification;
    }),
  }),

  // ============ TTS 语音生成 ============
  /** 按用户选择的朗读供应商生成语音。 */
  tts: router({
    /** 检查请求频率、套餐与文本长度后生成语音，并保存可播放文件。 */
    generate: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(5000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 服务端限流。
        checkRateLimit(ctx.user.id, "tts");

        const apiConfig = await getUserApiConfig(ctx.user.id);
        if (!apiConfig) {
          throw new Error("未配置 API");
        }

        const provider = apiConfig.ttsProvider || "browser";

        // 档位门槛：ElevenLabs 需 Plus+，Fish Audio 需
        // Pro；对应 BYOK key 或自托管模式除外。
        if (
          isBillingEnforced() &&
          (provider === "elevenlabs" || provider === "fishaudio")
        ) {
          const ttsKeys = await keyProvider.describeUserKeys(ctx.user.id);
          const byokForProvider =
            provider === "elevenlabs"
              ? ttsKeys.elevenlabs?.isSet === true
              : ttsKeys["fish-audio"]?.isSet === true;
          if (!byokForProvider) {
            const ttsTier = await getTierLimits(ctx.user.id);
            if (!ttsTier.limits.ttsProviders.includes(provider)) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `UPGRADE_REQUIRED: ${provider === "elevenlabs" ? "ElevenLabs voices require a Plus subscription." : "Fish Audio voices require a Pro subscription."} Upgrade in Settings, or add your own key.`,
              });
            }
          }
        }

        if (provider === "elevenlabs") {
          // resolve key via KeyProvider (BYOK → operator).
          const elevenKey = await keyProvider.get(
            { userId: ctx.user.id },
            "elevenlabs"
          );
          if (!elevenKey || !apiConfig.elevenlabsVoiceId) {
            throw new Error(
              elevenKey
                ? "请先在 Settings 中选择 ElevenLabs 声音"
                : "ElevenLabs 密钥未配置（运营方未设置或您未提供 BYOK）"
            );
          }

          try {
            const response = await axios.post(
              `https://api.elevenlabs.io/v1/text-to-speech/${apiConfig.elevenlabsVoiceId}`,
              {
                text: input.text,
                model_id: "eleven_multilingual_v2",
              },
              {
                headers: {
                  "xi-api-key": elevenKey,
                  "Content-Type": "application/json",
                  Accept: "audio/mpeg",
                },
                responseType: "arraybuffer",
                timeout: 60_000,
              }
            );

            // 上传音频到 S3
            const audioBuffer = Buffer.from(response.data);
            const fileKey = `tts-${ctx.user.id}-${nanoid()}.mp3`;
            const { url } = await storagePut(
              fileKey,
              audioBuffer,
              "audio/mpeg"
            );

            return { audioUrl: url, provider: "elevenlabs" as const };
          } catch (error: any) {
            console.error("[TTS] ElevenLabs error:", error?.response?.status);
            // eslint-disable-next-line preserve-caught-error -- Upstream errors can contain provider credentials.
            throw new Error("ElevenLabs 语音生成失败");
          }
        } else if (provider === "fishaudio") {
          const fishKey = await keyProvider.get(
            { userId: ctx.user.id },
            "fish-audio"
          );
          if (!fishKey || !apiConfig.fishAudioModelId) {
            throw new Error(
              fishKey
                ? "请先在 Settings 中选择 Fish Audio 声音模型"
                : "Fish Audio 密钥未配置（运营方未设置或您未提供 BYOK）"
            );
          }

          try {
            const response = await axios.post(
              "https://api.fish.audio/v1/tts",
              {
                text: input.text,
                reference_id: apiConfig.fishAudioModelId,
                format: "mp3",
              },
              {
                headers: {
                  Authorization: `Bearer ${fishKey}`,
                  "Content-Type": "application/json",
                  model: "s1",
                },
                responseType: "arraybuffer",
                timeout: 60_000,
              }
            );

            // 上传音频到 S3
            const audioBuffer = Buffer.from(response.data);
            const fileKey = `tts-${ctx.user.id}-${nanoid()}.mp3`;
            const { url } = await storagePut(
              fileKey,
              audioBuffer,
              "audio/mpeg"
            );

            return { audioUrl: url, provider: "fishaudio" as const };
          } catch (error: any) {
            console.error("[TTS] Fish Audio error:", error?.response?.status);
            // eslint-disable-next-line preserve-caught-error -- Upstream errors can contain provider credentials.
            throw new Error("Fish Audio 语音生成失败");
          }
        } else {
          // browser 模式，前端处理
          throw new Error("浏览器语音模式无需后端处理");
        }
      }),
  }),

  // ========== 语音转写 ==========
  /** 上传录音及服务端语音转写。 */
  voice: router({
    /** 校验成年状态、套餐及上传大小后保存录音，再调用 OpenAI Whisper 转写。 */
    transcribe: protectedProcedure
      .input(
        z.object({
          audioBase64: z.string().min(1, "音频数据不能为空"),
          mimeType: z.string().default("audio/webm"),
          language: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // 0. 年龄门 + 服务端限流。
        ensureAgeConfirmed(ctx.user);
        checkRateLimit(ctx.user.id, "transcribe");

        // 0b. 档位门槛：免费档不含语音转写；
        // BYOK openai key 或自托管模式除外。
        const sttKeys = await keyProvider.describeUserKeys(ctx.user.id);
        if (isBillingEnforced() && sttKeys.openai?.isSet !== true) {
          const stt = await getTierLimits(ctx.user.id);
          if (!stt.limits.voiceTranscription) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "UPGRADE_REQUIRED: Voice transcription is a Plus feature. Upgrade in Settings, or add your own OpenAI key.",
            });
          }
        }

        // 1. Base64 解码
        const audioBuffer = Buffer.from(input.audioBase64, "base64");

        // 2. 文件大小校验（16MB 限制）
        const sizeMB = audioBuffer.length / (1024 * 1024);
        if (sizeMB > 16) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `音频文件过大（${sizeMB.toFixed(1)}MB），最大支持 16MB`,
          });
        }

        // 3. 上传到 S3
        const ext = input.mimeType.includes("webm")
          ? "webm"
          : input.mimeType.includes("mp4")
            ? "m4a"
            : input.mimeType.includes("ogg")
              ? "ogg"
              : "audio";
        const fileKey = `voice-messages/${ctx.user.id}/${Date.now()}-${nanoid(8)}.${ext}`;
        const { url: audioUrl } = await storagePut(
          fileKey,
          audioBuffer,
          input.mimeType
        );

        // 4. 解析 OpenAI Whisper 密钥：用户 BYOK → 运营方 OPERATOR_OPENAI_KEY。
        const whisperApiKey = await keyProvider.get(
          { userId: ctx.user.id },
          "openai"
        );
        if (!whisperApiKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Voice transcription is not configured yet: no OpenAI key available. Set OPERATOR_OPENAI_KEY on the server, or add your own key in Settings.",
          });
        }

        const result = await transcribeWithOpenAI(
          {
            audioUrl,
            language: input.language,
            prompt: "这是一段与 AI 女友的日常对话语音消息",
          },
          whisperApiKey
        );

        // 6. 错误处理
        if ("error" in result) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: (result as any).error,
          });
        }

        // 7. 返回转写结果
        return {
          text: (result as any).text?.trim() || "",
          language: (result as any).language || "unknown",
          duration: (result as any).duration || 0,
        };
      }),
  }),
});
/** 客户端生成类型安全查询和 mutation 所使用的路由类型。 */
export type AppRouter = typeof appRouter;
