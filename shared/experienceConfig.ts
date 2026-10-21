/** 角色、情绪、浏览器体验和运营链接的可发布规则；不包含初始值。 */
import { z } from "zod";
import { contentTextSchema } from "./discovery";
import { companionBehaviorSchema } from "./companionBehavior";
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const MOOD_IDS = [
  "excited",
  "happy",
  "content",
  "neutral",
  "lonely",
  "sad",
] as const;
/** 数据库容量和已实现的行为枚举是结构边界；可配置限制必须位于其内。 */
export const charactersConfigSchema = z
  .object({
    defaultBehavior: companionBehaviorSchema,
    conversationTitle: contentTextSchema.superRefine((items, ctx) => {
      for (const text of Object.values(items)) {
        if (
          !text.includes("{{name}}") ||
          /\{\{/.test(text.replaceAll("{{name}}", "")) ||
          text.replaceAll("{{name}}", "x".repeat(100)).length > 200
        )
          ctx.addIssue({
            code: "custom",
            message: "会话标题只使用 {{name}}，且须容纳最长角色名",
          });
      }
    }),
    limits: z
      .object({
        name: integer(1, 100),
        personality: integer(1, 20000),
        appearance: integer(1, 20000),
        interests: integer(1, 10000),
        customPrompt: integer(1, 10000),
        nickname: integer(1, 200),
        exampleLength: integer(1, 2000),
        exampleCount: integer(0, 20),
        globalPrompt: integer(1, 10000),
        replyLanguage: integer(1, 200),
        replyLength: integer(1, 200),
      })
      .strict(),
    promptBudgets: z
      .object({
        character: integer(100, 40000),
        style: integer(100, 20000),
        preferences: integer(100, 20000),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const limits = value.limits;
    if (
      value.defaultBehavior.userNickname.length > limits.nickname ||
      value.defaultBehavior.examples.length > limits.exampleCount ||
      value.defaultBehavior.examples.some(
        item =>
          Math.max(item.user.length, item.assistant.length) >
          limits.exampleLength
      )
    )
      ctx.addIssue({ code: "custom", message: "默认行为超过角色字段限制" });
  });
export const emotionConfigSchema = z
  .object({
    baseline: z.number().min(0).max(100),
    minScore: z.number().min(0).max(100),
    maxScore: z.number().min(0).max(100),
    recoveryMs: integer(1000, 30 * 86400000),
    hurtDurationMs: integer(0, 30 * 86400000),
    hurtThreshold: z.number().min(0).max(100),
    deltas: z
      .object({
        steady: z.number().min(-100).max(100),
        affection: z.number().min(-100).max(100),
        support: z.number().min(-100).max(100),
        conflict: z.number().min(-100).max(100),
        repair: z.number().min(-100).max(100),
      })
      .strict(),
    thresholds: z
      .object({
        excited: z.number().min(0).max(100),
        happy: z.number().min(0).max(100),
      })
      .strict(),
    moods: z.record(
      z.enum(MOOD_IDS),
      z
        .object({
          label: contentTextSchema,
          emoji: z.string().min(1).max(24),
          color,
          background: color,
        })
        .strict()
    ),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.minScore > v.baseline ||
      v.baseline > v.maxScore ||
      v.thresholds.happy > v.thresholds.excited
    )
      ctx.addIssue({ code: "custom", message: "情绪分数和展示门槛顺序无效" });
  });
export const experienceConfigSchema = z
  .object({
    pagination: z
      .object({
        conversations: integer(1, 100),
        messages: integer(1, 100),
        search: integer(1, 100),
        recentCharacters: integer(0, 100),
        notifications: integer(1, 100),
        searchPreviewChars: integer(1, 1000),
        maxSearchChars: integer(1, 500),
      })
      .strict(),
    playback: z
      .object({
        speeds: z.array(z.number().min(0.1).max(4)).min(1).max(20),
        defaultSpeed: z.number().min(0.1).max(4),
        browserRate: z.number().min(0.1).max(2),
        pitch: z.number().min(0).max(2),
        volume: z.number().min(0).max(1),
        defaultLanguage: z.string().min(1).max(35),
        defaultProvider: z.enum(["browser", "elevenlabs", "fishaudio"]),
      })
      .strict(),
    transport: z
      .object({
        requestTimeoutMs: integer(100, 120000),
        retryBaseMs: integer(100, 60000),
        retryMaxMs: integer(100, 120000),
        observerPollMs: integer(50, 5000),
        observerHeartbeatMs: integer(1000, 120000),
        clientPollMs: integer(1000, 3600000),
      })
      .strict(),
    operations: z
      .object({
        defaultDays: integer(1, 365),
        maxDays: integer(1, 365),
        sampleSize: integer(1, 10000),
      })
      .strict(),
    minimumRecordingSeconds: integer(0, 60),
    levelNoticeMs: integer(100, 30000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      !v.playback.speeds.includes(v.playback.defaultSpeed) ||
      new Set(v.playback.speeds).size !== v.playback.speeds.length
    )
      ctx.addIssue({
        code: "custom",
        message: "默认播放速度必须存在且速度不能重复",
      });
    if (
      v.transport.retryBaseMs > v.transport.retryMaxMs ||
      v.operations.defaultDays > v.operations.maxDays
    )
      ctx.addIssue({ code: "custom", message: "重试或统计窗口的上下限无效" });
  });
const link = z
  .string()
  .max(1000)
  .refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "链接必须使用无凭据的 HTTPS 地址");
export const siteConfigSchema = z
  .object({
    disclosure: contentTextSchema,
    links: z
      .object({
        support: link,
        openrouter: link,
        openai: link,
        fal: link,
        elevenlabs: link,
        fishaudio: link,
      })
      .strict(),
  })
  .strict();

/** 创建、编辑与表单共用可配置的字段限制；只校验实际提交的字段。 */
export function characterFieldsError(
  value: Record<string, unknown>,
  rules: z.infer<typeof charactersConfigSchema>
): string | null {
  for (const field of [
    "name",
    "personality",
    "appearance",
    "interests",
    "customPrompt",
  ] as const) {
    const text = value[field];
    if (
      typeof text === "string" &&
      (text.length > rules.limits[field] ||
        (["name", "personality", "appearance"].includes(field) && !text.trim()))
    )
      return `${field} 最多 ${rules.limits[field]} 字符，必填字段不能为空`;
  }
  const behavior = value.behavior as
    z.infer<typeof companionBehaviorSchema> | undefined;
  if (
    behavior &&
    (behavior.userNickname.length > rules.limits.nickname ||
      behavior.examples.length > rules.limits.exampleCount ||
      behavior.examples.some(
        item =>
          Math.max(item.user.length, item.assistant.length) >
          rules.limits.exampleLength
      ))
  )
    return "角色行为超出当前字段限制";
  return null;
}
