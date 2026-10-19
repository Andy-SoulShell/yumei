import { TRPCError } from "@trpc/server";
import axios from "axios";
import { z } from "zod";
import { resolveChatProvider } from "../_core/chatProvider";
import { resolveImageProvider } from "../_core/imageProvider";
import {
  KEY_NAMES,
  keyProvider,
  validateProviderKey,
  type KeyName,
} from "../_core/keyProvider";
import { protectedProcedure, router } from "../_core/trpc";
import { getUserApiConfig, upsertApiConfig } from "../repositories/apiConfig";

export const apiConfigRouter = router({
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
        ttsProvider: z.enum(["browser", "elevenlabs", "fishaudio"]).optional(),
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
      const response = await axios.get("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15_000,
      });
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
    const apiKey = await keyProvider.get({ userId: ctx.user.id }, "elevenlabs");
    if (!apiKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "ElevenLabs key not configured",
      });
    }
    try {
      const response = await axios.get("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
        timeout: 15_000,
      });
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
          timeout: 15_000,
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
});
