import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BusinessRuleError } from "../_core/businessError";
import { keyProvider } from "../_core/keyProvider";
import { transcribeWithOpenAI } from "../_core/openaiWhisper";
import { checkRateLimit } from "../_core/quota";
import { protectedProcedure, router } from "../_core/trpc";
import { getTierLimits, isBillingEnforced } from "../billing";
import { saveTranscription } from "../transcriptions";
import { ensureAgeConfirmed } from "./guards";

export const voiceRouter = router({
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
      await checkRateLimit(ctx.user.id, "transcribe");

      // 0b. 档位门槛：免费档不含语音转写；
      // BYOK openai key 或自托管模式除外。
      const sttKey = await keyProvider.resolve(
        { userId: ctx.user.id },
        "openai"
      );
      if (isBillingEnforced() && sttKey.source !== "user") {
        const stt = await getTierLimits(ctx.user.id);
        if (!stt.limits.voiceTranscription) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "UPGRADE_REQUIRED",
            cause: new BusinessRuleError({ reason: "UPGRADE_REQUIRED" }),
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

      const whisperApiKey = sttKey.value;
      if (!whisperApiKey)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Voice transcription is not configured yet: no OpenAI key available.",
        });

      const result = await transcribeWithOpenAI(
        {
          audio: { data: audioBuffer, mimeType: input.mimeType },
          language: input.language,
          prompt: "这是一段与 AI 女友的日常对话语音消息",
        },
        whisperApiKey
      );

      // 6. 错误处理
      if ("error" in result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error,
        });
      }

      const transcriptionId = await saveTranscription(ctx.user.id, result);
      // 7. 返回转写结果及仅由服务端签发的一次性行为凭据。
      return {
        transcriptionId,
        text: result.text?.trim() || "",
        language: result.language || "unknown",
        duration: result.duration || 0,
      };
    }),
});
