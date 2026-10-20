/** 角色表达、相处节奏和示例对话的共享契约，供表单、接口和提示词使用。 */
import { z } from "zod";

/** 示例仅描述说话方式，不作为已经发生的聊天或用户事实。 */
export const companionBehaviorSchema = z.object({
  expression: z.enum(["warm", "direct", "playful", "reserved"]).default("warm"),
  verbosity: z.enum(["concise", "balanced", "detailed"]).default("balanced"),
  initiative: z.enum(["quiet", "balanced", "lively"]).default("balanced"),
  relationshipPace: z.enum(["gradual", "natural"]).default("gradual"),
  emotionIntensity: z.enum(["gentle", "expressive"]).default("gentle"),
  userNickname: z.string().trim().max(40).default(""),
  examples: z
    .array(
      z.object({
        user: z.string().trim().min(1).max(300),
        assistant: z.string().trim().min(1).max(300),
      })
    )
    .max(5)
    .default([]),
});

/** 经服务端校验的角色行为设置。 */
export type CompanionBehavior = z.infer<typeof companionBehaviorSchema>;

/** 未定制和旧角色的稳定默认值；读取时不要原地修改此对象。 */
export const DEFAULT_COMPANION_BEHAVIOR: CompanionBehavior =
  companionBehaviorSchema.parse({});

/** 为未配置的角色返回新对象；无效持久值不进入提示词。 */
export function resolveCompanionBehavior(value: unknown): CompanionBehavior {
  const parsed = companionBehaviorSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : companionBehaviorSchema.parse({});
}
