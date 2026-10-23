import { z } from "zod";
import { companionBehaviorSchema } from "@shared/companionBehavior";
import { readFormDraft } from "@/lib/formDrafts";
const schema = z
  .object({
    name: z.string().max(100),
    personality: z.string().max(20000),
    appearance: z.string().max(20000),
    interests: z.string().max(10000),
    customPrompt: z.string().max(10000),
    omnivoiceVoiceId: z.string().max(200),
    presetId: z.string().max(100).nullable(),
    pendingFiles: z.boolean(),
    behavior: companionBehaviorSchema.extend({
      userNickname: z.string().max(200),
      examples: z
        .array(
          z.object({
            user: z.string().max(2000),
            assistant: z.string().max(2000),
          })
        )
        .max(20),
    }),
  })
  .strict();
export type CharacterDraft = z.infer<typeof schema>;
export function readCharacterDraft(key: string | null) {
  const result = schema.safeParse(readFormDraft(key));
  return result.success ? result.data : null;
}
