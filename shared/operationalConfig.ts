/** 主动联系与运行限制的可发布契约，不包含业务默认值。 */
import { z } from "zod";
import { CHAT_INPUT_CAPACITY } from "./const";
import { contentTextSchema } from "./discovery";
import { proactivePreferencesSchema } from "./proactiveContact";
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
/** 模板以通知身份关联；只允许通知中已有的具名变量。 */
const notificationTemplates = z
  .record(z.string().min(1).max(200), contentTextSchema)
  .superRefine((templates, ctx) => {
    const required = [
      "title.thinkingOfYou",
      "privateTitle",
      "privatePreview",
      "eventUpcoming",
      "eventToday",
      "eventFollowUp",
      "dailyCompanion",
    ];
    for (const id of required)
      if (!templates[`notifications:${id}`])
        ctx.addIssue({ code: "custom", message: `缺少通知模板 ${id}` });
    for (const text of Object.values(templates).flatMap(value =>
      Object.values(value)
    )) {
      if (!text) continue;
      const clean = text.replace(/\{\{(name|memory|eventDay)\}\}/g, "");
      if (/\{\{|\}\}/.test(clean))
        ctx.addIssue({
          code: "custom",
          message: "通知只支持 name、memory、eventDay 变量",
        });
    }
    for (const [locale, text] of Object.entries(
      templates["notifications:title.thinkingOfYou"] ?? {}
    ))
      if (/\{\{(?:memory|eventDay)\}\}/.test(text ?? ""))
        ctx.addIssue({
          code: "custom",
          path: ["notifications:title.thinkingOfYou", locale],
          message: "普通联系通知标题仅支持角色名变量",
        });
    for (const id of ["privateTitle", "privatePreview"])
      if (
        Object.values(templates[`notifications:${id}`] ?? {}).some(text =>
          /\{\{/.test(text ?? "")
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "隐私通知不能包含角色或事件变量",
        });
  });
export const proactiveConfigSchema = z
  .object({
    enabled: z.boolean(),
    defaults: proactivePreferencesSchema,
    frequencyDays: z
      .object({ min: integer(1, 365), max: integer(1, 365) })
      .strict(),
    minimumGapMs: integer(0, 30 * 86400000),
    unreadBackoff: z
      .object({
        base: integer(1, 10),
        maxExponent: integer(0, 10),
        maxDays: integer(1, 365),
      })
      .strict(),
    events: z
      .object({ upcomingDays: integer(0, 30), followupDays: integer(0, 30) })
      .strict(),
    contactLifetimeMs: integer(1000, 86400000),
    leaseMs: integer(1000, 300000),
    tickMs: integer(1000, 3600000),
    pushTimeoutMs: integer(100, 20000),
    batchSize: integer(1, 1000),
    retry: z
      .object({
        quietMs: integer(1000, 3600000),
        baseMs: integer(1000, 3600000),
        maxMs: integer(1000, 86400000),
        maxExponent: integer(0, 10),
      })
      .strict(),
    client: z
      .object({
        unreadPollMs: integer(1000, 3600000),
        initialCheckMs: integer(1000, 3600000),
        checkIntervalMs: integer(1000, 3600000),
      })
      .strict(),
    templates: notificationTemplates,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.frequencyDays.min > value.frequencyDays.max ||
      value.defaults.frequencyDays < value.frequencyDays.min ||
      value.defaults.frequencyDays > value.frequencyDays.max
    )
      ctx.addIssue({
        code: "custom",
        message: "主动联系默认频率必须位于有效范围内",
      });
    if (value.defaults.proactiveEnabled)
      ctx.addIssue({ code: "custom", message: "主动联系必须由用户明确启用" });
    if (value.pushTimeoutMs >= value.leaseMs)
      ctx.addIssue({ code: "custom", message: "推送超时必须小于投递租约" });
    if (value.retry.baseMs > value.retry.maxMs)
      ctx.addIssue({ code: "custom", message: "重试初始间隔不能大于上限" });
  });
export type ProactiveConfig = z.infer<typeof proactiveConfigSchema>;

const imageUpload = z
  .object({
    maxBytes: integer(1, 32 * 1024 * 1024),
    mimeTypes: z
      .array(z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]))
      .min(1)
      .max(4)
      .refine(values => new Set(values).size === values.length),
  })
  .strict();
/** 请求体按 Base64 膨胀后的上限校验，界面和服务端直接使用同一字节数。 */
export const uploadsConfigSchema = z
  .object({
    requestMaxBytes: integer(1024 * 1024, 256 * 1024 * 1024),
    avatar: imageUpload,
    reference: imageUpload,
    couple: imageUpload,
    official: imageUpload,
    audio: z
      .object({
        maxBytes: integer(1, 25 * 1024 * 1024),
        mimeTypes: z
          .array(
            z.enum([
              "audio/webm",
              "audio/mp4",
              "audio/mpeg",
              "audio/mp3",
              "audio/wav",
              "audio/wave",
              "audio/ogg",
              "audio/m4a",
            ])
          )
          .min(1)
          .max(8)
          .refine(values => new Set(values).size === values.length),
        recordingMimeTypes: z
          .array(
            z.enum([
              "audio/webm;codecs=opus",
              "audio/webm",
              "audio/mp4",
              "audio/ogg;codecs=opus",
            ])
          )
          .min(1)
          .max(4),
        maxDurationSeconds: integer(1, 1200),
        sampleRate: integer(8000, 96000),
        chunkMs: integer(20, 1000),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const max = Math.max(
      ...[
        value.avatar,
        value.reference,
        value.couple,
        value.official,
        value.audio,
      ].map(item => item.maxBytes)
    );
    if (Math.ceil(max / 3) * 4 + 65536 > value.requestMaxBytes)
      ctx.addIssue({
        code: "custom",
        message: "请求体上限不足以容纳上传文件的 Base64 数据",
      });
    if (
      value.audio.recordingMimeTypes.some(
        mime =>
          !value.audio.mimeTypes.includes(
            mime.split(";")[0] as (typeof value.audio.mimeTypes)[number]
          )
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "录音编码必须属于允许上传的音频类型",
      });
  });
export type UploadLimit =
  z.infer<typeof imageUpload> | z.infer<typeof uploadsConfigSchema>["audio"];
/** 仅描述规则；所有数值从发布配置生成。 */
export function uploadDescription(limit: UploadLimit) {
  // 保留字节级精度，避免小容量被四舍五入成 0MB，或提示的上限大于执行上限。
  const unit =
    limit.maxBytes % (1024 * 1024) === 0
      ? { bytes: 1024 * 1024, label: "MiB" }
      : limit.maxBytes % 1024 === 0
        ? { bytes: 1024, label: "KiB" }
        : { bytes: 1, label: "B" };
  return {
    formats: limit.mimeTypes
      .map(mime => mime.split("/")[1].toUpperCase())
      .join(" / "),
    maxSize: `${limit.maxBytes / unit.bytes} ${unit.label}`,
  };
}
/** 使用 MIME 主类型匹配录音编码参数。 */
export function acceptsUpload(
  limit: UploadLimit,
  file: { type: string; size: number }
) {
  return (
    file.size > 0 &&
    file.size <= limit.maxBytes &&
    (limit.mimeTypes as string[]).includes(
      file.type.split(";")[0].trim().toLowerCase()
    )
  );
}

/** 运营方网关允许本机 HTTP；凭据始终来自密钥服务，不能写入公开配置。 */
const endpoint = z
  .string()
  .max(1000)
  .refine(value => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "服务地址必须是无凭据、查询或片段的 HTTP(S) URL");
const model = z.string().trim().min(1).max(200);
const workflow = z
  .object({
    id: model,
    promptNode: z.string().min(1),
    seedNode: z.string().min(1),
    outputNode: z.string().min(1),
    referenceNode: z.string().nullable(),
    resizeNode: z.string().nullable(),
    nodes: z
      .record(
        z.string().min(1),
        z
          .object({
            class_type: z.string().min(1),
            inputs: z.record(z.string(), z.json()),
            _meta: z.record(z.string(), z.json()).optional(),
          })
          .strict()
      )
      .refine(
        value =>
          Object.keys(value).length > 0 && Object.keys(value).length <= 200
      ),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const id of [
      value.promptNode,
      value.seedNode,
      value.outputNode,
      value.referenceNode,
      value.resizeNode,
    ])
      if (id && !value.nodes[id])
        ctx.addIssue({ code: "custom", message: `工作流缺少绑定节点 ${id}` });
    if (JSON.stringify(value.nodes).length > 200000)
      ctx.addIssue({ code: "custom", message: "工作流不能超过 200000 字符" });
  });
/** 模型名称与实际请求、计量记录共同使用；工作流中的模型和采样参数也可编辑。 */
export const modelsConfigSchema = z
  .object({
    chat: z
      .object({
        provider: z.enum(["openrouter", "deepseek"]),
        operatorBaseUrl: endpoint.nullable(),
        deepseekModel: model,
      })
      .strict(),
    image: z
      .object({
        provider: z.enum(["fal", "comfyui"]),
        comfyuiBaseUrl: endpoint.nullable(),
        falSelfie: model,
        falCouple: model,
        workflows: z.object({ text: workflow, reference: workflow }).strict(),
      })
      .strict(),
    transcription: z.object({ model }).strict(),
    tts: z.object({ elevenlabs: model, fishaudio: model }).strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.image.provider === "comfyui" && !value.image.comfyuiBaseUrl)
      ctx.addIssue({ code: "custom", message: "ComfyUI 需要配置服务地址" });
    if (
      !value.image.workflows.reference.referenceNode ||
      !value.image.workflows.reference.resizeNode
    )
      ctx.addIssue({
        code: "custom",
        message: "参考图工作流必须绑定上传图与缩放节点",
      });
  });
/** 每次执行捕获运行快照；调度器在下一轮读取当前参数。 */
export const runtimeConfigSchema = z
  .object({
    ai: z
      .object({
        dailyTaskLimit: integer(1, 10000),
        taskTimeoutMs: integer(100, 120000),
      })
      .strict(),
    chat: z
      .object({
        maxInputChars: integer(1, CHAT_INPUT_CAPACITY),
        maxOutputChars: integer(1, 32000),
        maxTokens: integer(1, 128000),
        deepseekThinking: z.enum(["disabled", "enabled"]),
        temperature: z.number().min(0).max(2).nullable(),
        topP: z.number().gt(0).max(1).nullable(),
        replyTimeoutMs: integer(100, 300000),
        queueTimeoutMs: integer(1000, 3600000),
        leaseMs: integer(1000, 60000),
        heartbeatMs: integer(100, 30000),
        pollMs: integer(50, 5000),
        schedulerMs: integer(50, 60000),
        localConcurrency: integer(1, 32),
        userConcurrency: integer(1, 10),
        burstMessages: integer(1, 100),
        batchSize: integer(1, 200),
        segmentChars: integer(2, 2000),
        flushMs: integer(10, 5000),
        flushPollMs: integer(10, 1000),
      })
      .strict(),
    image: z
      .object({
        comfyuiTimeoutMs: integer(1000, 3600000),
        comfyuiRequestTimeoutMs: integer(100, 120000),
        comfyuiPollMs: integer(10, 30000),
        cancelTimeoutMs: integer(100, 30000),
        falTimeoutMs: integer(100, 600000),
        downloadTimeoutMs: integer(100, 300000),
        maxImageBytes: integer(1, 100 * 1024 * 1024),
        reservationGraceMs: integer(1000, 600000),
      })
      .strict(),
    voice: z
      .object({
        transcriptionTimeoutMs: integer(100, 300000),
        ttsTimeoutMs: integer(100, 300000),
        ttsMaxChars: integer(1, 20000),
        ttsRetentionMs: integer(1000, 7 * 86400000),
        credentialTtlMs: integer(1000, 86400000),
      })
      .strict(),
    catalog: z
      .object({
        timeoutMs: integer(100, 120000),
        fishPageSize: integer(1, 1000),
      })
      .strict(),
    storage: z
      .object({
        requestTimeoutMs: integer(100, 300000),
        signedUrlTtlSeconds: integer(1, 86400),
      })
      .strict(),
    maintenance: z
      .object({
        tickMs: integer(1000, 3600000),
        mediaBatchSize: integer(1, 1000),
        mediaLeaseMs: integer(1000, 300000),
        mediaRetryBaseMs: integer(100, 3600000),
        mediaRetryMaxMs: integer(1000, 86400000),
        mediaRetryMaxExponent: integer(0, 20),
        stagedRetentionMs: integer(1000, 86400000),
        companionTrashRetentionMs: integer(86400000, 90 * 86400000).multipleOf(
          86400000
        ),
        rateWindowRetentionMs: integer(60000, 86400000),
        generationTimeoutMs: integer(1000, 3600000),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.chat.heartbeatMs + value.chat.pollMs >= value.chat.leaseMs)
      ctx.addIssue({
        code: "custom",
        message: "聊天租约必须大于心跳与轮询间隔之和",
      });
    if (
      value.chat.flushPollMs > value.chat.flushMs ||
      value.chat.segmentChars > value.chat.maxOutputChars
    )
      ctx.addIssue({
        code: "custom",
        message: "聊天分段与刷新参数超出执行范围",
      });
    if (value.maintenance.mediaRetryBaseMs > value.maintenance.mediaRetryMaxMs)
      ctx.addIssue({ code: "custom", message: "媒体重试初始间隔不能超过上限" });
  });
