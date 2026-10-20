import { buildChatSystemPrompt } from "../chatPrompt";
import { TRPCError } from "@trpc/server";
import axios from "axios";
import { z } from "zod";
import { FREE_TIER_DEFAULT_MODEL, METERS } from "../../shared/quotas";
import { detectSelfHarm } from "../../shared/safety";
import { detectSelfieRequest } from "../../shared/selfieRequest";
import { resolveChatProvider } from "../_core/chatProvider";
import { log, providerErrorSummary } from "../_core/log";
import { checkRateLimit } from "../_core/quota";
import { protectedProcedure, router } from "../_core/trpc";
import { getTierLimits, isBillingEnforced, upsellHint } from "../billing";
import {
  completeTextGeneration,
  failGeneration,
  reserveGeneration,
} from "../generations";
import { buildMemoryPromptBlock, maybeExtractMemories } from "../memory";
import { getUserApiConfig } from "../repositories/apiConfig";
import { getActiveGirlfriend } from "../repositories/companions";
import {
  getConversation,
  getRecentMessages,
} from "../repositories/conversations";
import { generateConversationSelfie } from "../selfieGeneration";
import { validateTranscription } from "../transcriptions";
import { ensureAgeConfirmed } from "./guards";

export const chatRouter = router({
  /**
   * 检查成年状态与归属，按明确意图选择自拍或模型回复，并保存消息。
   *
   * @remarks 先持久化额度预留，成功后原子保存消息对；失败明确报错并幂等退回原周期额度。
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1),
        transcriptionId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 0. 年龄门 + 服务端限流。
      ensureAgeConfirmed(ctx.user);
      await checkRateLimit(ctx.user.id, "chat");
      if (input.transcriptionId)
        await validateTranscription(
          ctx.user.id,
          input.transcriptionId,
          input.content
        );

      const selfieRequest = detectSelfieRequest(input.content);
      if (selfieRequest && !detectSelfHarm(input.content)) {
        const result = await generateConversationSelfie(
          ctx.user,
          {
            conversationId: input.conversationId,
            userContext: input.content,
            transcriptionId: input.transcriptionId,
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
          relationship: result.relationship,
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
      const isByokChat = chatProvider.isByok;
      const { tier, limits } = await getTierLimits(ctx.user.id);
      // 3. 获取最近的消息历史（用于上下文）
      const recentMessages = await getRecentMessages(input.conversationId, 10);

      // 4. 获取用户全局提示词配置
      const apiConfig = await getUserApiConfig(ctx.user.id);

      // 5. 收集动态记忆，再由共用生成器组装实际提示词。
      let memoryBlock = "";

      // 长期记忆注入：按相关性取 top-k，等级越高记得越多。
      // 失败不阻塞聊天。
      try {
        memoryBlock = await buildMemoryPromptBlock(
          ctx.user.id,
          girlfriend.id,
          input.content,
          girlfriend.intimacyLevel || 1
        );
      } catch (error) {
        log.error(
          "[Chat] memory injection failed (non-blocking)",
          providerErrorSummary(error)
        );
      }

      const systemPrompt = buildChatSystemPrompt(
        girlfriend,
        apiConfig,
        memoryBlock
      );

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
        { role: "user" as const, content: input.content },
      ];

      // 7. 使用已解析的服务地址和对应密钥调用 LLM。
      const requestId = await reserveGeneration({
        userId: ctx.user.id,
        conversationId: input.conversationId,
        kind: "chat",
        transcriptionId: input.transcriptionId,
        meter:
          isBillingEnforced() && !isByokChat && limits.dailyMessages !== null
            ? {
                name: METERS.chat,
                period: "day",
                limit: limits.dailyMessages,
                what: "messages",
                hint: upsellHint(tier),
              }
            : undefined,
      });
      let saved: Awaited<ReturnType<typeof completeTextGeneration>>;
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
        const messageContent = response.data?.choices?.[0]?.message?.content;
        const aiResponse =
          typeof messageContent === "string" ? messageContent : "";
        if (!aiResponse.trim())
          throw new Error("Provider returned empty content");
        saved = await completeTextGeneration(
          requestId,
          ctx.user.id,
          input.content,
          aiResponse
        );
      } catch (error) {
        log.error("[Chat] generation failed", {
          requestId,
          ...providerErrorSummary(error),
        });
        try {
          await failGeneration(requestId, ctx.user.id);
        } catch (settlementError) {
          log.error("[Chat] compensation will retry", {
            requestId,
            ...providerErrorSummary(settlementError),
          });
        }
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "聊天生成失败，请稍后重试；失败请求不计入用量。",
        });
      }

      // 9. 异步记忆提取：每 10 条消息触发一次，不阻塞响应。
      maybeExtractMemories({ userId: ctx.user.id });

      return {
        ...saved,
        safetyNotice,
        imageGeneration: null,
      };
    }),
});
