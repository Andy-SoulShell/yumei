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
import {
  generateOmniVoiceSpeech,
  getOmniVoiceCatalog,
  getOmniVoiceConfig,
  normalizeOmniVoiceReference,
} from "../_core/omnivoice";
import {
  OMNIVOICE_CLONE_PREFIX,
  OMNIVOICE_REFERENCE_MAX_BASE64,
  OMNIVOICE_REFERENCE_MAX_BYTES,
} from "../../shared/omnivoice";
import {
  createOmniVoiceClone,
  deleteOmniVoiceClone,
  getOmniVoiceClone,
  listOmniVoiceClones,
} from "../repositories/omnivoice";
import { decodeBase64Upload } from "../_core/uploads";
import { getActiveGirlfriend } from "../repositories/companions";

export const ttsRouter = router({
  /** 服务连通性和公开音色；不返回运营方地址或密钥。 */
  omnivoiceStatus: protectedProcedure.query(async ({ ctx }) => {
    const catalog = await getOmniVoiceCatalog();
    return {
      ...catalog,
      voices: [
        ...catalog.voices.map(v => ({
          ...v,
          cloned: false,
          durationMs: null as number | null,
        })),
        ...(await listOmniVoiceClones(ctx.user.id)).map(v => ({
          ...v,
          cloned: true,
        })),
      ],
    };
  }),
  createOmnivoiceVoice: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        audio: z.string().min(1).max(OMNIVOICE_REFERENCE_MAX_BASE64),
        text: z.string().trim().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureAgeConfirmed(ctx.user);
      await checkRateLimit(
        ctx.user.id,
        "tts",
        await getPublishedProductConfig()
      );
      if (
        decodeBase64Upload(input.audio).length > OMNIVOICE_REFERENCE_MAX_BYTES
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "参考音频不能超过 5 MB",
        });
      const normalized = await normalizeOmniVoiceReference(input.audio);
      return createOmniVoiceClone(ctx.user.id, {
        name: input.name,
        text: input.text,
        ...normalized,
      });
    }),
  deleteOmnivoiceVoice: protectedProcedure
    .input(
      z.object({ id: z.string().startsWith(OMNIVOICE_CLONE_PREFIX).max(64) })
    )
    .mutation(({ ctx, input }) => deleteOmniVoiceClone(ctx.user.id, input.id)),
  /** 检查请求频率、套餐与文本长度后生成语音，并保存可播放文件。 */
  generate: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(20000),
        girlfriendId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureAgeConfirmed(ctx.user);
      const girlfriend =
        input.girlfriendId === undefined
          ? undefined
          : await getActiveGirlfriend(ctx.user.id, input.girlfriendId);
      if (input.girlfriendId !== undefined && !girlfriend)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Companion not found",
        });
      // 服务端限流。
      const policy = await getPublishedProductConfig();
      await checkRateLimit(ctx.user.id, "tts", policy);
      if (input.text.length > policy.runtime.voice.ttsMaxChars)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `语音文本最多 ${policy.runtime.voice.ttsMaxChars} 字符`,
        });

      const apiConfig = await getUserApiConfig(ctx.user.id);
      const provider = girlfriend?.omnivoiceVoiceId
        ? "omnivoice"
        : apiConfig?.ttsProvider || policy.experience.playback.defaultProvider;

      if (provider === "omnivoice") {
        const voiceId =
          girlfriend?.omnivoiceVoiceId ||
          apiConfig?.omnivoiceVoiceId ||
          "default";
        const clone = voiceId.startsWith(OMNIVOICE_CLONE_PREFIX)
          ? await getOmniVoiceClone(ctx.user.id, voiceId)
          : null;
        const config = getOmniVoiceConfig();
        if (!config) throw new Error("OmniVoice 本地服务尚未配置");
        if (input.text.length > 5000)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OmniVoice 语音文本最多 5000 字符",
          });
        const audio = await runMeteredAiTask(
          {
            userId: ctx.user.id,
            kind: "tts",
            provider: "omnivoice",
            model: "omnivoice",
            isByok: false,
            promptVersion: `product-config/${policy.revision}:voice`,
          },
          async signal => ({
            value: await generateOmniVoiceSpeech(
              input.text,
              clone ? "default" : voiceId,
              signal,
              clone
                ? { audio: clone.referenceAudio, text: clone.referenceText }
                : undefined
            ),
          }),
          {
            ...policy,
            runtime: {
              ...policy.runtime,
              ai: { ...policy.runtime.ai, taskTimeoutMs: config.timeout },
            },
          }
        );
        const { url } = await putStagedMedia(
          ctx.user.id,
          `tts-${ctx.user.id}-${nanoid()}.wav`,
          audio,
          "audio/wav",
          policy.runtime.voice.ttsRetentionMs
        );
        return { audioUrl: url, provider: "omnivoice" as const };
      }

      const ttsKey =
        provider === "elevenlabs" || provider === "fishaudio"
          ? await keyProvider.resolve(
              { userId: ctx.user.id },
              provider === "elevenlabs" ? "elevenlabs" : "fish-audio"
            )
          : null;
      // 语音服务权限由当前套餐决定，用户密钥或自托管模式除外。
      if (
        isBillingEnforced(policy) &&
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
        if (!elevenKey || !apiConfig?.elevenlabsVoiceId) {
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
              model: policy.models.tts.elevenlabs,
              isByok: ttsKey?.source === "user",
              promptVersion: `product-config/${policy.revision}:voice`,
            },
            async signal => ({
              value: await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${apiConfig.elevenlabsVoiceId}`,
                {
                  text: input.text,
                  model_id: policy.models.tts.elevenlabs,
                },
                {
                  headers: {
                    "xi-api-key": elevenKey,
                    "Content-Type": "application/json",
                    Accept: "audio/mpeg",
                  },
                  responseType: "arraybuffer",
                  signal,
                  timeout: policy.runtime.voice.ttsTimeoutMs,
                }
              ),
            }),
            policy
          );

          // 上传音频到 S3
          const audioBuffer = Buffer.from(response.data);
          const fileKey = `tts-${ctx.user.id}-${nanoid()}.mp3`;
          const { url } = await putStagedMedia(
            ctx.user.id,
            fileKey,
            audioBuffer,
            "audio/mpeg",
            policy.runtime.voice.ttsRetentionMs
          );

          return { audioUrl: url, provider: "elevenlabs" as const };
        } catch (error: any) {
          console.error("[TTS] ElevenLabs error:", error?.response?.status);
          // eslint-disable-next-line preserve-caught-error -- Upstream errors can contain provider credentials.
          throw new Error("ElevenLabs 语音生成失败");
        }
      } else if (provider === "fishaudio") {
        const fishKey = ttsKey?.value;
        if (!fishKey || !apiConfig?.fishAudioModelId) {
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
              model: policy.models.tts.fishaudio,
              isByok: ttsKey?.source === "user",
              promptVersion: `product-config/${policy.revision}:voice`,
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
                    model: policy.models.tts.fishaudio,
                  },
                  responseType: "arraybuffer",
                  signal,
                  timeout: policy.runtime.voice.ttsTimeoutMs,
                }
              ),
            }),
            policy
          );

          // 上传音频到 S3
          const audioBuffer = Buffer.from(response.data);
          const fileKey = `tts-${ctx.user.id}-${nanoid()}.mp3`;
          const { url } = await putStagedMedia(
            ctx.user.id,
            fileKey,
            audioBuffer,
            "audio/mpeg",
            policy.runtime.voice.ttsRetentionMs
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
