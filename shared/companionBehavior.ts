/** 角色表达、相处节奏和示例对话的共享契约，供表单、接口和提示词使用。 */
import { z } from "zod";

/** 示例仅描述说话方式，不作为已经发生的聊天或用户事实。 */
export const companionBehaviorSchema = z.object({
  expression: z.enum(["warm", "direct", "playful", "reserved"]),
  verbosity: z.enum(["concise", "balanced", "detailed"]),
  initiative: z.enum(["quiet", "balanced", "lively"]),
  relationshipPace: z.enum(["gradual", "natural"]),
  emotionIntensity: z.enum(["gentle", "expressive"]),
  userNickname: z.string().trim().max(200),
  examples: z
    .array(
      z.object({
        user: z.string().trim().min(1).max(2000),
        assistant: z.string().trim().min(1).max(2000),
      })
    )
    .max(20),
});

/** 经服务端校验的角色行为设置。 */
export type CompanionBehavior = z.infer<typeof companionBehaviorSchema>;

/** 仅缺省时采用当前发布的默认行为；不再从 schema 填入固定业务值。 */
export function resolveCompanionBehavior(
  value: unknown,
  defaults: CompanionBehavior
): CompanionBehavior {
  const parsed = companionBehaviorSchema.safeParse({
    ...defaults,
    ...(value && typeof value === "object" ? value : {}),
  });
  return parsed.success ? parsed.data : structuredClone(defaults);
}
