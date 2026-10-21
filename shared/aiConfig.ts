/** 提示词模板与记忆执行规则的共享契约，不包含任何默认业务值。 */
import { z } from "zod";
import { contentTextSchema, officialIdSchema } from "./discovery";

/** 模板只替换具名变量一次，不执行表达式，也不递归展开变量内容。 */
export function renderPrompt(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g,
    (_slot, key: string) => {
      if (!(key in values)) throw new Error(`Unknown prompt variable: ${key}`);
      return values[key];
    }
  );
}
function template(variables: string[]) {
  return z
    .string()
    .trim()
    .min(1)
    .max(20000)
    .superRefine((value, ctx) => {
      const slots = Array.from(
        value.matchAll(/\{\{([^{}]*)\}\}/g),
        match => match[1]
      );
      if (
        slots.some(slot => !variables.includes(slot)) ||
        variables.some(slot => !slots.includes(slot)) ||
        /\{\{|\}\}/.test(value.replace(/\{\{[^{}]*\}\}/g, ""))
      )
        ctx.addIssue({
          code: "custom",
          message: `模板必须且只能使用变量：${variables.join(", ") || "无"}`,
        });
    });
}
const instruction = template([]);
const stages = z
  .array(
    z
      .object({ minLevel: z.number().int().min(1).max(100), instruction })
      .strict()
  )
  .min(1)
  .max(100)
  .superRefine((items, ctx) => {
    if (
      items[0].minLevel !== 1 ||
      items.some(
        (item, index) => index > 0 && item.minLevel <= items[index - 1].minLevel
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "关系阶段必须从等级 1 开始严格递增",
      });
  });
export const promptsConfigSchema = z
  .object({
    quickTemplates: z
      .array(
        z
          .object({
            id: officialIdSchema,
            enabled: z.boolean(),
            label: contentTextSchema,
            text: contentTextSchema,
          })
          .strict()
      )
      .max(100),
    chat: z
      .object({
        system: template([
          "characterData",
          "expression",
          "verbosity",
          "initiative",
          "relationship",
          "tone",
          "cause",
          "emotionIntensity",
          "styleData",
          "preferencesData",
          "languageRule",
          "lengthRule",
          "memoryState",
        ]),
        expression: z
          .object({
            warm: instruction,
            direct: instruction,
            playful: instruction,
            reserved: instruction,
          })
          .strict(),
        verbosity: z
          .object({
            concise: instruction,
            balanced: instruction,
            detailed: instruction,
          })
          .strict(),
        initiative: z
          .object({
            quiet: instruction,
            balanced: instruction,
            lively: instruction,
          })
          .strict(),
        tone: z
          .object({
            calm: instruction,
            warm: instruction,
            concerned: instruction,
            hurt: instruction,
          })
          .strict(),
        cause: z
          .object({
            steady: instruction,
            affection: instruction,
            support: instruction,
            conflict: instruction,
            repair: instruction,
          })
          .strict(),
        emotionIntensity: z
          .object({ gentle: instruction, expressive: instruction })
          .strict(),
        relationshipStages: z
          .object({ gradual: stages, natural: stages })
          .strict(),
        languageRule: template(["language"]),
        defaultLanguage: instruction,
        lengthRule: template(["length"]),
        turnLanguage: template(["language"]),
        memoryEnabled: instruction,
        memoryDisabled: instruction,
      })
      .strict(),
    image: z
      .object({
        reference: template(["scene"]),
        text: template(["scene", "appearance"]),
        couple: template(["scene"]),
        defaultScene: instruction,
        defaultCoupleScene: instruction,
      })
      .strict(),
    extraction: template(["maxLength"]),
    summary: instruction,
    memoryContext: template(["records"]),
    transcription: instruction,
    context: z
      .object({
        total: z.number().int().min(16000).max(160000),
        platform: z.number().int().min(1000).max(64000),
        followups: z.number().int().min(8000).max(96000),
        history: z.number().int().min(0).max(64000),
      })
      .strict(),
  })
  .strict();

const positive = z.number().int().min(1).max(10000);
const fraction = z.number().min(0).max(1);
const model = z.string().trim().min(1).max(200).nullable();
export const memoryCategorySchema = z.enum([
  "fact",
  "preference",
  "event",
  "relationship",
]);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;
export const memoryConfigSchema = z
  .object({
    enabled: z.boolean(),
    categories: z
      .array(
        z
          .object({ id: memoryCategorySchema, label: contentTextSchema })
          .strict()
      )
      .length(4),
    maxExtractedLength: z.number().int().min(2).max(2000),
    maxEditedLength: z.number().int().min(1).max(8000),
    levelRules: z
      .array(
        z
          .object({
            minLevel: z.number().int().min(1).max(100),
            capacity: z.number().int().min(0).max(10000),
            recallCount: z.number().int().min(0).max(10000),
          })
          .strict()
      )
      .min(1)
      .max(100),
    extraction: z
      .object({
        firstRound: z.boolean(),
        explicitRequests: z.boolean(),
        everyRounds: positive,
        sourceMessageLimit: positive,
        maxResults: z.number().int().min(1).max(100),
        temperature: z.number().min(0).max(2),
        maxTokens: z.number().int().min(256).max(32000),
        models: z
          .object({
            openrouter: model,
            deepseek: model.refine(
              value => value === null || /^deepseek[-\w.]*$/i.test(value),
              "DeepSeek 提取模型必须属于当前服务"
            ),
          })
          .strict(),
      })
      .strict(),
    summary: z
      .object({
        enabled: z.boolean(),
        factLimit: positive,
        sourceMessageLimit: positive,
        maxTopics: z.number().int().min(0).max(100),
        maxQuoteLength: z.number().int().min(1).max(8000),
        maxTokens: z.number().int().min(256).max(32000),
      })
      .strict(),
    semantic: z
      .object({
        model,
        batchSize: z.number().int().min(1).max(1000),
        weight: z.number().min(0).max(100),
      })
      .strict(),
    matching: z
      .object({
        duplicateThreshold: fraction,
        correctionThreshold: fraction,
        initialWeightMin: z.number().int().min(0).max(100),
        initialWeightMax: z.number().int().min(0).max(100),
        reinforcement: z.number().int().min(0).max(100),
      })
      .strict(),
    ranking: z
      .object({
        freshnessFloor: fraction,
        decayDays: z.number().min(0.01).max(36500),
        affinityMultiplier: z.number().min(0).max(100),
        affinityMax: z.number().min(0).max(100),
        pinnedBonus: z.number().min(0).max(100),
      })
      .strict(),
    recall: z
      .object({
        explicitUsesCapacity: z.boolean(),
        maxChars: z.number().int().min(0).max(20000),
      })
      .strict(),
    jobs: z
      .object({
        batchSize: z.number().int().min(1).max(100),
        maxAttempts: z.number().int().min(1).max(100),
        retryBaseMs: z.number().int().min(100).max(3600000),
        retryMaxMs: z.number().int().min(100).max(86400000),
      })
      .strict(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(config.categories.map(c => c.id)).size !== 4)
      issue("四种记忆类别必须各出现一次");
    if (
      config.levelRules[0].minLevel !== 1 ||
      config.levelRules.some(
        (rule, index) =>
          index > 0 && rule.minLevel <= config.levelRules[index - 1].minLevel
      )
    )
      issue("记忆等级规则必须从 1 开始严格递增");
    if (config.levelRules.some(rule => rule.recallCount > rule.capacity))
      issue("日常召回数量不能超过对应容量");
    if (config.matching.initialWeightMin > config.matching.initialWeightMax)
      issue("初始记忆权重上下限颠倒");
    if (config.jobs.retryMaxMs < config.jobs.retryBaseMs)
      issue("重试上限不能小于基础间隔");
  });
export type MemoryConfig = z.infer<typeof memoryConfigSchema>;
export type PromptsConfig = z.infer<typeof promptsConfigSchema>;
