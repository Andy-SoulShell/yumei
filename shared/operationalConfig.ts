/** 主动联系与运行限制的可发布契约，不包含业务默认值。 */
import { z } from "zod";
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
