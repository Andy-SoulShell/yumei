import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BusinessRuleError } from "../_core/businessError";
import { keyProvider } from "../_core/keyProvider";
import { transcribeWithOpenAI } from "../_core/openaiWhisper";
import { checkRateLimit } from "../_core/quota";
import { protectedProcedure, router } from "../_core/trpc";
import { decodeBase64Upload, enforceUpload } from "../_core/uploads";
import { getTierLimits, isBillingEnforced } from "../billing";
import { saveTranscription } from "../transcriptions";
import { ensureAgeConfirmed } from "./guards";
import { runMeteredAiTask } from "../aiTaskRuntime";
import { getPublishedProductConfig } from "../repositories/productConfig";

export const voiceRouter = router({
  /** 校验成年状态、套餐及上传大小后保存录音，再调用 OpenAI Whisper 转写。 */
  transcribe: protectedProcedure
    .input(
      z.object({
        audioBase64: z.string().min(1, "音频数据不能为空"),
        mimeType: z.string().min(1).optional(),
        language: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // 0. 年龄门 + 服务端限流。
      ensureAgeConfirmed(ctx.user);
      const policy = await getPublishedProductConfig();
      await checkRateLimit(ctx.user.id, "transcribe", policy);

      // 0b. 档位门槛：免费档不含语音转写；
      // BYOK openai key 或自托管模式除外。
      const sttKey = await keyProvider.resolve(
        { userId: ctx.user.id },
        "openai"
      );
      if (isBillingEnforced(policy) && sttKey.source !== "user") {
        const stt = await getTierLimits(ctx.user.id, policy);
        if (!stt.limits.voiceTranscription) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "UPGRADE_REQUIRED",
            cause: new BusinessRuleError({ reason: "UPGRADE_REQUIRED" }),
          });
        }
      }

      const mimeType = input.mimeType ?? policy.uploads.audio.mimeTypes[0];
      // 1. Base64 解码
      const audioBuffer = decodeBase64Upload(input.audioBase64);

      enforceUpload(policy.uploads.audio, audioBuffer, mimeType);

      const whisperApiKey = sttKey.value;
      if (!whisperApiKey)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Voice transcription is not configured yet: no OpenAI key available.",
        });

      const result = await runMeteredAiTask(
        {
          userId: ctx.user.id,
          kind: "transcription",
          provider: "openai",
          model: policy.models.transcription.model,
          isByok: sttKey.source === "user",
          promptVersion: `product-config/${policy.revision}:transcription`,
        },
        async signal => {
          const response = await transcribeWithOpenAI(
            {
              signal,
              audio: { data: audioBuffer, mimeType },
              language: input.language,
              prompt: policy.prompts.transcription,
            },
            whisperApiKey,
            policy
          );
          if ("error" in response)
            throw new TRPCError({
              code: "BAD_GATEWAY",
              message: "Voice transcription failed. Please try again.",
            });
          return { value: response };
        },
        policy
      );

      if (
        !Number.isFinite(result.duration) ||
        result.duration < policy.experience.minimumRecordingSeconds ||
        result.duration > policy.uploads.audio.maxDurationSeconds
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `录音时长不能超过 ${policy.uploads.audio.maxDurationSeconds} 秒`,
        });
      const transcriptionId = await saveTranscription(
        ctx.user.id,
        result,
        policy
      );
      // 7. 返回转写结果及仅由服务端签发的一次性行为凭据。
      return {
        transcriptionId,
        text: result.text?.trim() || "",
        language: result.language || "unknown",
        duration: result.duration || 0,
      };
    }),
});
