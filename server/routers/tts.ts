import { TRPCError } from "@trpc/server";
import axios from "axios";
import { nanoid } from "nanoid";
import { z } from "zod";
import { BusinessRuleError } from "../_core/businessError";
import { keyProvider } from "../_core/keyProvider";
import { checkRateLimit } from "../_core/quota";
import { getPublishedProductConfig } from "../repositories/productConfig";
import { protectedProcedure, router } from "../_core/trpc";
import { getTierLimits, isBillingEnforced } from "../billing";
import { putStagedMedia } from "../managedMedia";
import { getUserApiConfig } from "../repositories/apiConfig";
import { runMeteredAiTask } from "../aiTaskRuntime";
import { ensureAgeConfirmed } from "./guards";

export const ttsRouter = router({
  /** 检查请求频率、套餐与文本长度后生成语音，并保存可播放文件。 */
  generate: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureAgeConfirmed(ctx.user);
      // 服务端限流。
      const policy = await getPublishedProductConfig();
      await checkRateLimit(ctx.user.id, "tts", policy);

      const apiConfig = await getUserApiConfig(ctx.user.id);
      if (!apiConfig) {
        throw new Error("未配置 API");
      }

      const provider = apiConfig.ttsProvider || "browser";

      const ttsKey =
        provider === "elevenlabs" || provider === "fishaudio"
          ? await keyProvider.resolve(
              { userId: ctx.user.id },
              provider === "elevenlabs" ? "elevenlabs" : "fish-audio"
            )
          : null;
      // 语音服务权限由当前套餐决定，用户密钥或自托管模式除外。
      if (
        isBillingEnforced() &&
        (provider === "elevenlabs" || provider === "fishaudio")
      ) {
        const byokForProvider = ttsKey?.source === "user";
        if (!byokForProvider) {
          const ttsTier = await getTierLimits(ctx.user.id, policy);
          if (!ttsTier.limits.ttsProviders.includes(provider)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "UPGRADE_REQUIRED",
              cause: new BusinessRuleError({ reason: "UPGRADE_REQUIRED" }),
            });
          }
        }
      }

      if (provider === "elevenlabs") {
        // resolve key via KeyProvider (BYOK → operator).
        const elevenKey = ttsKey?.value;
        if (!elevenKey || !apiConfig.elevenlabsVoiceId) {
          throw new Error(
            elevenKey
              ? "请先在 Settings 中选择 ElevenLabs 声音"
              : "ElevenLabs 密钥未配置（运营方未设置或您未提供 BYOK）"
          );
        }

        try {
          const response = await runMeteredAiTask(
            {
              userId: ctx.user.id,
              kind: "tts",
              provider: "elevenlabs",
              model: "eleven_multilingual_v2",
              isByok: ttsKey?.source === "user",
              promptVersion: "companion-voice/1",
            },
            async signal => ({
              value: await axios.post(
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
                  signal,
                  timeout: 60_000,
                }
              ),
            })
          );

          // 上传音频到 S3
          const audioBuffer = Buffer.from(response.data);
          const fileKey = `tts-${ctx.user.id}-${nanoid()}.mp3`;
          const { url } = await putStagedMedia(
            ctx.user.id,
            fileKey,
            audioBuffer,
            "audio/mpeg",
            24 * 60 * 60_000
          );

          return { audioUrl: url, provider: "elevenlabs" as const };
        } catch (error: any) {
          console.error("[TTS] ElevenLabs error:", error?.response?.status);
          // eslint-disable-next-line preserve-caught-error -- Upstream errors can contain provider credentials.
          throw new Error("ElevenLabs 语音生成失败");
        }
      } else if (provider === "fishaudio") {
        const fishKey = ttsKey?.value;
        if (!fishKey || !apiConfig.fishAudioModelId) {
          throw new Error(
            fishKey
              ? "请先在 Settings 中选择 Fish Audio 声音模型"
              : "Fish Audio 密钥未配置（运营方未设置或您未提供 BYOK）"
          );
        }

        try {
          const response = await runMeteredAiTask(
            {
              userId: ctx.user.id,
              kind: "tts",
              provider: "fishaudio",
              model: "s1",
              isByok: ttsKey?.source === "user",
              promptVersion: "companion-voice/1",
            },
            async signal => ({
              value: await axios.post(
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
                  signal,
                  timeout: 60_000,
                }
              ),
            })
          );

          // 上传音频到 S3
          const audioBuffer = Buffer.from(response.data);
          const fileKey = `tts-${ctx.user.id}-${nanoid()}.mp3`;
          const { url } = await putStagedMedia(
            ctx.user.id,
            fileKey,
            audioBuffer,
            "audio/mpeg",
            24 * 60 * 60_000
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
});
