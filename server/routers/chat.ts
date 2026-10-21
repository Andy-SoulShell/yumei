import { CHAT_INPUT_CAPACITY } from "../../shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { detectSelfHarm } from "../../shared/safety";
import { getPublishedProductConfig } from "../repositories/productConfig";
import { detectSelfieRequest } from "../../shared/selfieRequest";
import { checkRateLimit } from "../_core/quota";
import { protectedProcedure, router } from "../_core/trpc";
import { generateConversationSelfie } from "../selfieGeneration";
import { validateTranscription } from "../transcriptions";
import { ensureAgeConfirmed } from "./guards";

export const chatRouter = router({
  /** 图片意图独立结算；普通文字只通过持久流式任务接收。 */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        content: z.string().trim().min(1).max(CHAT_INPUT_CAPACITY),
        transcriptionId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureAgeConfirmed(ctx.user);
      const policy = await getPublishedProductConfig();
      if (input.content.length > policy.runtime.chat.maxInputChars)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `消息最多 ${policy.runtime.chat.maxInputChars} 字符`,
        });
      const selfieRequest = detectSelfieRequest(
        input.content,
        policy.selfies.poses,
        policy.selfies.defaultPoseId
      );
      if (!selfieRequest || detectSelfHarm(input.content)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Text messages must use the streaming chat endpoint.",
        });
      }
      await checkRateLimit(ctx.user.id, "chat", policy);
      if (input.transcriptionId)
        await validateTranscription(
          ctx.user.id,
          input.transcriptionId,
          input.content
        );
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
    }),
});
