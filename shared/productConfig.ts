import {
  charactersConfigSchema,
  emotionConfigSchema,
  experienceConfigSchema,
  siteConfigSchema,
} from "./experienceConfig";
/** 套餐、养成、提示词与记忆共用的可执行业务配置。 */
import { z } from "zod";
import { contentTextSchema, contentText, officialIdSchema } from "./discovery";
import type { Locale } from "./locales";
import {
  proactiveConfigSchema,
  uploadsConfigSchema,
  modelsConfigSchema,
  runtimeConfigSchema,
} from "./operationalConfig";
import { memoryConfigSchema, promptsConfigSchema } from "./aiConfig";
import { videosConfigSchema } from "./video";
import { economySchema, DEFAULT_ECONOMY } from "./economy";

export const REWARD_ACTIONS = [
  "text_message",
  "voice_message",
  "selfie",
  "daily_first",
  "edit_profile",
  "long_conversation",
  "night_chat",
] as const;
export type RewardAction = (typeof REWARD_ACTIONS)[number];
export const RATE_ACTIONS = ["chat", "selfie", "transcribe", "tts"] as const;
export type RateLimitedAction = (typeof RATE_ACTIONS)[number];
const count = z.number().int().min(0).max(100000000);
const nullableCount = count.nullable();
const safeUrl = z
  .string()
  .max(1000)
  .refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "结账链接必须是无凭据的 HTTPS 地址")
  .nullable();

/** 权益由服务端执行，null 表示相应额度不限量；合照不再依赖套餐名称。 */
export const tierLimitsSchema = z
  .object({
    dailyMessages: nullableCount,
    dailySelfies: nullableCount,
    monthlySelfies: nullableCount,
    maxGirlfriends: nullableCount,
    voiceTranscription: z.boolean(),
    ttsProviders: z.array(z.enum(["elevenlabs", "fishaudio"])).max(2),
    modelLocked: z.boolean(),
    couplePhoto: z.boolean(),
  })
  .strict()
  .refine(
    value => value.dailySelfies === null || value.monthlySelfies === null,
    "自拍额度只能选择按日或按月计量"
  );
export type TierLimits = z.infer<typeof tierLimitsSchema>;
export type Tier = string;

/** 套餐数组顺序同时决定展示和升级顺序，ID 用于订阅关联。 */
export const billingConfigSchema = z
  .object({
    economy: economySchema.default(DEFAULT_ECONOMY),
    mode: z.enum(["free", "none", "lemonsqueezy"]),
    pastDueGraceMs: z
      .number()
      .int()
      .min(0)
      .max(90 * 86400000),
    defaultTierId: officialIdSchema,
    selfHostedTierId: officialIdSchema,
    defaultChatModel: z.string().trim().min(1).max(200),
    rateLimits: z
      .object({ chat: count, selfie: count, transcribe: count, tts: count })
      .strict(),
    plans: z
      .array(
        z
          .object({
            id: officialIdSchema,
            label: contentTextSchema,
            enabled: z.boolean(),
            price: z
              .object({
                amount: z.number().finite().min(0).max(1000000),
                currency: z
                  .string()
                  .regex(/^[A-Z]{3}$/)
                  .refine(value => {
                    try {
                      new Intl.NumberFormat("en", {
                        style: "currency",
                        currency: value,
                      });
                      return true;
                    } catch {
                      return false;
                    }
                  }),
                period: z.enum(["month", "year"]),
              })
              .strict(),
            limits: tierLimitsSchema,
            checkoutUrl: safeUrl,
            lemonVariantId: z.string().regex(/^\d+$/).max(100).nullable(),
          })
          .strict()
      )
      .min(1)
      .max(50),
  })
  .strict();

/** 启用姿势可动态增删；别名参与聊天请求中的姿势识别。 */
export const selfiePoseSchema = z
  .object({
    id: officialIdSchema,
    label: contentTextSchema,
    emoji: z.string().min(1).max(24),
    minLevel: z.number().int().min(1).max(100),
    promptFragment: z.string().trim().min(1).max(3000),
    mode: z.enum(["mirror", "direct", "auto"]),
    enabled: z.boolean(),
    aliases: z.array(z.string().trim().min(1).max(100)).max(30),
  })
  .strict();
export type SelfiePose = z.infer<typeof selfiePoseSchema>;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const intimacyLevelSchema = z
  .object({
    level: z.number().int().min(1).max(100),
    requiredPoints: count,
    name: contentTextSchema,
    description: contentTextSchema,
    petName: contentTextSchema,
    emoji: z.string().min(1).max(24),
    color,
    gradientFrom: color,
    gradientTo: color,
  })
  .strict();
export type IntimacyLevel = z.infer<typeof intimacyLevelSchema>;

/** 奖励条件由动作类型和数值阈值解释，界面说明从这些字段生成。 */
export const rewardRuleSchema = z
  .object({
    enabled: z.boolean(),
    label: contentTextSchema,
    basePoints: count,
    bonusPoints: count,
    bonusThreshold: nullableCount,
    cooldownMinutes: z.number().int().min(0).max(1440),
    dailyLimit: nullableCount,
  })
  .strict();
export type PointsRule = z.infer<typeof rewardRuleSchema>;
export const intimacyConfigSchema = z
  .object({
    dailyPointsLimit: count,
    minimumTextLength: z.number().int().min(1).max(2000),
    night: z
      .object({
        timeZone: z
          .string()
          .max(64)
          .refine(value => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
      })
      .strict(),
    levels: z.array(intimacyLevelSchema).min(1).max(100),
    rules: z.record(z.enum(REWARD_ACTIONS), rewardRuleSchema),
  })
  .strict();

/** API 主题的语义色与预览同源；仅接受十六进制颜色。 */
export const themesConfigSchema = z
  .object({
    defaultThemeId: officialIdSchema,
    items: z
      .array(
        z
          .object({
            id: officialIdSchema,
            enabled: z.boolean(),
            name: contentTextSchema,
            description: contentTextSchema,
            hue: z.number().min(0).max(360),
            colors: z.tuple([color, color, color]),
            light: color,
            dark: color,
            background: z.object({ light: color, dark: color }).strict(),
            foreground: color,
          })
          .strict()
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.items.map(item => item.id)).size !== value.items.length)
      ctx.addIssue({ code: "custom", message: "主题 ID 不能重复" });
    if (
      !value.items.some(
        item => item.id === value.defaultThemeId && item.enabled
      )
    )
      ctx.addIssue({ code: "custom", message: "默认主题必须存在且启用" });
  });
export type ThemesConfig = z.infer<typeof themesConfigSchema>;

/** 一次发布完整替换业务快照，跨领域引用在发布前统一检查。 */
export const productConfigSchema = z
  .object({
    characters: charactersConfigSchema,
    emotion: emotionConfigSchema,
    experience: experienceConfigSchema,
    site: siteConfigSchema,
    themes: themesConfigSchema,
    proactive: proactiveConfigSchema,
    uploads: uploadsConfigSchema,
    models: modelsConfigSchema,
    runtime: runtimeConfigSchema,
    billing: billingConfigSchema,
    selfies: z
      .object({
        defaultPoseId: officialIdSchema,
        poses: z.array(selfiePoseSchema).min(1).max(200),
      })
      .strict(),
    videos: videosConfigSchema,
    intimacy: intimacyConfigSchema,
    prompts: promptsConfigSchema,
    memory: memoryConfigSchema,
  })
  .strict()
  .superRefine((config, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const unique = (ids: string[], message: string) => {
      if (new Set(ids).size !== ids.length) issue(message);
    };
    unique(
      config.prompts.quickTemplates.map(item => item.id),
      "提示词模板 ID 不能重复"
    );
    for (const item of config.prompts.quickTemplates)
      if (
        Object.values(item.text).some(
          text => text && text.length > config.characters.limits.globalPrompt
        )
      )
        issue("快捷模板正文不能超过全局偏好的字数上限");
    if (
      config.experience.minimumRecordingSeconds >
      config.uploads.audio.maxDurationSeconds
    )
      issue("最短录音时长不能超过最长录音时长");
    const context = config.prompts.context;
    if (
      context.platform + context.followups > context.total ||
      config.memory.recall.maxChars > context.total - context.platform
    )
      issue("提示词、补充消息和记忆预留超出总上下文预算");
    if (
      new TextEncoder().encode(JSON.stringify(config)).byteLength + 65536 >
      config.uploads.requestMaxBytes
    )
      issue("请求体上限不足以保存完整业务配置");
    const chat = config.prompts.chat;
    const longest = (values: Record<string, string>) =>
      Math.max(...Object.values(values).map(v => v.length));
    const reserve =
      chat.safetyClause.length +
      chat.system.length +
      longest(chat.expression) +
      longest(chat.verbosity) +
      longest(chat.initiative) +
      longest(chat.tone) +
      longest(chat.cause) +
      longest(chat.emotionIntensity) +
      Math.max(
        ...Object.values(chat.relationshipStages).flatMap(v =>
          v.map(s => s.instruction.length)
        )
      ) +
      chat.languageRule.length +
      chat.lengthRule.length +
      chat.turnLanguage.length +
      Math.max(chat.memoryEnabled.length, chat.memoryDisabled.length) +
      config.characters.promptBudgets.character +
      config.characters.promptBudgets.style +
      config.characters.promptBudgets.preferences +
      600;
    if (reserve > context.platform)
      issue("聊天模板与资料预留超过平台上下文预算");
    unique(
      config.billing.plans.map(plan => plan.id),
      "套餐 ID 不能重复"
    );
    unique(
      config.billing.plans.flatMap(plan =>
        plan.lemonVariantId ? [plan.lemonVariantId] : []
      ),
      "支付变体不能重复映射"
    );
    unique(
      [
        ...config.billing.plans.flatMap(plan =>
          plan.lemonVariantId ? [plan.lemonVariantId] : []
        ),
        ...config.billing.economy.packs.flatMap(pack =>
          pack.variantId ? [pack.variantId] : []
        ),
      ],
      "充值包与订阅支付变体不能重复映射"
    );
    for (const id of Object.keys(config.billing.economy.planCoins))
      if (!config.billing.plans.some(plan => plan.id === id))
        issue("订阅赠币必须关联已有套餐");
    for (const id of [
      config.billing.defaultTierId,
      config.billing.selfHostedTierId,
    ])
      if (!config.billing.plans.some(plan => plan.id === id && plan.enabled))
        issue("默认和自托管套餐必须存在且启用");
    if (
      config.billing.plans.find(
        plan => plan.id === config.billing.defaultTierId
      )?.price.amount !== 0
    )
      issue("默认套餐价格必须为零");
    unique(
      config.selfies.poses.map(pose => pose.id),
      "姿势 ID 不能重复"
    );
    if (
      !config.selfies.poses.some(
        pose =>
          pose.id === config.selfies.defaultPoseId &&
          pose.enabled &&
          pose.minLevel === 1
      )
    )
      issue("默认姿势必须启用且在第一级解锁");
    config.intimacy.levels.forEach((level, index) => {
      if (
        level.level !== index + 1 ||
        (index === 0
          ? level.requiredPoints !== 0
          : level.requiredPoints <=
            config.intimacy.levels[index - 1].requiredPoints)
      )
        issue("等级必须从 1 连续递增，首级经验为零，其余门槛严格递增");
    });
    for (const pose of config.selfies.poses)
      if (pose.minLevel > config.intimacy.levels.length)
        issue(`姿势 ${pose.id} 的解锁等级不存在`);
    unique(
      config.videos.presets.map(preset => preset.id),
      "视频动作 ID 不能重复"
    );
    for (const preset of config.videos.presets)
      if (preset.minLevel > config.intimacy.levels.length)
        issue(`视频动作 ${preset.id} 的解锁等级不存在`);
    for (const id of [
      "text_message",
      "voice_message",
      "daily_first",
      "long_conversation",
    ] as const)
      if (
        config.intimacy.rules[id].bonusThreshold === null ||
        config.intimacy.rules[id].bonusThreshold < 1
      )
        issue(`奖励 ${id} 必须提供正整数阈值`);
    for (const id of ["selfie", "edit_profile", "night_chat"] as const)
      if (config.intimacy.rules[id].bonusThreshold !== null)
        issue(`奖励 ${id} 不接受数值阈值`);
    if (config.intimacy.rules.daily_first.dailyLimit !== 1)
      issue("每日首次奖励的每日次数必须为 1");
    if (config.intimacy.rules.night_chat.bonusPoints !== 0)
      issue("夜间奖励不再叠加额外奖励");
  });
export type ProductConfig = z.infer<typeof productConfigSchema>;

/** 从实际自拍与视频规则生成展示，修改名称或等级时无需维护第二份文案。 */
export function localizeProductConfig(config: ProductConfig, locale: Locale) {
  return {
    ...config,
    emotion: {
      ...config.emotion,
      moods: Object.fromEntries(
        Object.entries(config.emotion.moods).map(([id, item]) => [
          id,
          { ...item, label: contentText(item.label, locale) },
        ])
      ) as Record<
        keyof ProductConfig["emotion"]["moods"],
        Omit<ProductConfig["emotion"]["moods"]["happy"], "label"> & {
          label: string;
        }
      >,
    },
    site: {
      ...config.site,
      disclosure: contentText(config.site.disclosure, locale),
    },
    themes: {
      ...config.themes,
      items: config.themes.items
        .filter(item => item.enabled)
        .map(item => ({
          ...item,
          name: contentText(item.name, locale),
          description: contentText(item.description, locale),
        })),
    },
    prompts: {
      ...config.prompts,
      quickTemplates: config.prompts.quickTemplates
        .filter(item => item.enabled)
        .map(item => ({
          ...item,
          label: contentText(item.label, locale),
          text: contentText(item.text, locale),
        })),
    },
    memory: {
      ...config.memory,
      categories: config.memory.categories.map(item => ({
        ...item,
        label: contentText(item.label, locale),
      })),
    },
    billing: {
      ...config.billing,
      plans: config.billing.plans.map(plan => ({
        ...plan,
        label: contentText(plan.label, locale),
      })),
    },
    selfies: {
      ...config.selfies,
      poses: config.selfies.poses
        .filter(pose => pose.enabled)
        .map(pose => ({ ...pose, label: contentText(pose.label, locale) })),
    },
    videos: {
      presets: config.videos.presets
        .filter(preset => preset.enabled)
        .map(preset => ({
          ...preset,
          label: contentText(preset.label, locale),
        })),
    },
    intimacy: {
      ...config.intimacy,
      levels: config.intimacy.levels.map(level => ({
        ...level,
        name: contentText(level.name, locale),
        description: contentText(level.description, locale),
        petName: contentText(level.petName, locale),
        unlocks: [...config.selfies.poses, ...config.videos.presets]
          .filter(pose => pose.enabled && pose.minLevel === level.level)
          .map(pose => contentText(pose.label, locale)),
      })),
      rules: Object.fromEntries(
        REWARD_ACTIONS.map(id => [
          id,
          {
            ...config.intimacy.rules[id],
            label: contentText(config.intimacy.rules[id].label, locale),
          },
        ])
      ) as Record<RewardAction, Omit<PointsRule, "label"> & { label: string }>,
    },
  };
}
