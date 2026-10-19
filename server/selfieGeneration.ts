import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  getConversation,
  getActiveGirlfriend,
  createMessage,
  createSelfie,
  getRecentMessages,
} from "./db";
import {
  resolveImageProvider,
  generateProviderImage,
} from "./_core/imageProvider";
import {
  checkRateLimit,
  consumeDailyMeter,
  consumeMonthlyMeter,
} from "./_core/quota";
import { getTierLimits, isBillingEnforced, upsellHint } from "./billing";
import { METERS } from "../shared/quotas";
import { getPose } from "../shared/selfiePoses";
import { buildSmartPrompt } from "./promptTemplates";
import { storagePut } from "./storage";

type SelfieInput = {
  conversationId: number;
  userContext: string;
  generationMode: "reference" | "text";
  poseId?: string;
};

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
  checkRateLimit(user.id, "selfie");

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
        message: `LEVEL_LOCKED: 「${pose.label}」需要亲密度 Lv.${pose.minLevel}（当前 Lv.${girlfriend.intimacyLevel || 1}）。多聊聊天升级吧～`,
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

  // 2b. 档位自拍额度：免费档按日、付费档按月。
  // BYOK fal 用户和自托管（BILLING_PROVIDER=none）跳过。
  const selfieTier = await getTierLimits(user.id);
  if (isBillingEnforced() && !imageProvider.isByok) {
    if (selfieTier.limits.dailySelfies !== null) {
      await consumeDailyMeter(
        user.id,
        METERS.selfie,
        selfieTier.limits.dailySelfies,
        "selfies",
        upsellHint(selfieTier.tier)
      );
    } else if (selfieTier.limits.monthlySelfies !== null) {
      await consumeMonthlyMeter(
        user.id,
        METERS.selfie,
        selfieTier.limits.monthlySelfies,
        "selfies",
        upsellHint(selfieTier.tier)
      );
    }
  }

  let sceneContext = input.userContext;
  if (chatContent !== undefined) {
    // Only recent visual context is supplied; the current request takes precedence.
    const recent = await getRecentMessages(input.conversationId, 4);
    const context = recent
      .filter(message => !message.imageUrl)
      .map(message => `${message.role}: ${message.content.slice(0, 200)}`)
      .join("\n");
    sceneContext = `保持参考图中的人物身份与画风。角色外貌：${girlfriend.appearance}。近期对话仅供提取地点、服装等画面细节：\n${context}\n当前拍摄要求（优先）：${input.userContext}`;
  }
  const userMessage =
    chatContent === undefined
      ? undefined
      : await createMessage({
          conversationId: input.conversationId,
          role: "user",
          content: chatContent,
        });

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

  // 4. 等待当前生图任务完成，再复用聊天和相册的存储流程。
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

    // 5. 将结果保存在应用的持久化存储中。
    const fileKey = `selfie-${user.id}-${nanoid()}.png`;
    const { url: s3Url } = await storagePut(fileKey, imageBuffer, "image/png");

    // 6. 保存自拍记录
    const selfie = await createSelfie({
      userId: user.id,
      girlfriendId: girlfriend.id,
      imageUrl: s3Url,
      imageKey: fileKey,
      prompt: imagePrompt,
      userContext: input.userContext,
      mode: promptResult.mode,
    });

    // 7. 创建消息记录（图片消息）
    const message = await createMessage({
      conversationId: input.conversationId,
      role: "assistant",
      content: `[自拍照片]`,
      imageUrl: s3Url,
      imageKey: fileKey,
      selfieMode: promptResult.mode,
    });

    return {
      selfie,
      message,
      userMessage,
      imageGeneration: "completed" as const,
    };
  } catch (error) {
    if (!userMessage) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          imageProvider.name === "comfyui" && error instanceof Error
            ? error.message
            : "Failed to generate selfie",
      });
    }
    // Persist a real failure response instead of claiming that a photo was sent.
    const message = await createMessage({
      conversationId: input.conversationId,
      role: "assistant",
      content:
        "这次自拍没有生成成功，可能是生图服务连接失败、排队超时，或生成与保存时出错。请稍后再试，也可以点击相机按钮重新生成。",
    });
    return {
      selfie: null,
      message,
      userMessage,
      imageGeneration: "failed" as const,
    };
  }
}
