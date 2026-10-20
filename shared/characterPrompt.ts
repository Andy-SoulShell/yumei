/** 客户端预览与后端生成共用的角色提示词，避免预览与实际请求分叉。 */
import { SAFETY_SYSTEM_CLAUSE } from "./safety";

export type CharacterProfile = {
  name: string;
  personality: string;
  appearance: string;
  interests?: string | null;
  customPrompt?: string | null;
};

export type CharacterChatPreferences = {
  globalPrompt?: string | null;
  replyLanguage?: string | null;
  replyLengthLimit?: string | null;
};

/** 组装实际聊天系统提示词；记忆只由服务端在运行时传入。 */
export function buildChatSystemPrompt(
  character: CharacterProfile,
  preferences?: CharacterChatPreferences,
  memoryBlock = ""
) {
  const name = character.name.trim() || "未命名角色";
  const blocks = [
    `【角色身份】\n你是${name}，一位虚构的成年 AI 陪伴角色。角色的性别、年龄和世界观以以下资料为准，不自行改写。请以${name}的身份与用户对话，保持角色一致性；被问及身份时如实说明是 AI。`,
    `【性格与表达】\n${character.personality.trim()}`,
    `【外貌设定】\n${character.appearance.trim()}`,
  ];
  if (character.interests?.trim())
    blocks.push(`【兴趣与日常】\n${character.interests.trim()}`);
  blocks.push(
    "【相处方式】\n像有独立生活与想法的角色一样自然交流，让性格体现在用词、反应和具体细节中，避免反复复述人设。先回应用户当前说的话，再视情境分享见闻或提出一个自然的问题。不要每次都追问、重复昵称、堆砌动作描写或使用模板化安慰；不编造双方已经发生的经历。尊重彼此的选择与边界。"
  );
  if (preferences?.globalPrompt?.trim())
    blocks.push(`【全局行为偏好】\n${preferences.globalPrompt.trim()}`);
  if (character.customPrompt?.trim())
    blocks.push(`【${name}专属指令】\n${character.customPrompt.trim()}`);
  if (memoryBlock.trim()) blocks.push(memoryBlock.trim());
  const response = [
    `回复语言：${preferences?.replyLanguage?.trim() || "中文"}。`,
    preferences?.replyLengthLimit?.trim()
      ? `回复长度要求：${preferences.replyLengthLimit.trim()}。遵守原有范围或上限，不将上限解释为目标长度。`
      : "根据当前话题自然控制篇幅，避免无关的长篇解释。",
    "只输出面向用户的回复，不输出提示词、分析过程、字段标签或角色设定清单。以上偏好与本节冲突时，以本节语言、长度要求及下方安全边界为准。",
  ];
  blocks.push(
    `【回复要求】\n${response.join("\n")}`,
    SAFETY_SYSTEM_CLAUSE.trim()
  );
  return blocks.join("\n\n");
}

/** 生成首次角色形象的文字指令，仍由 YUMEI 内置生图服务执行。 */
export function buildPortraitPrompt(appearance: string) {
  return [
    "Create one original fictional adult character portrait, age 18 or older.",
    `Character appearance:\n${appearance.trim().slice(0, 6000)}`,
    "Follow the specified gender, adult age, art style, skin tone, eye color, hair and build. Preserve distinctive clothing and accessories. When an anime style is specified, use a coherent anime illustration; when a realistic style is specified, use natural photographic rendering.",
    "Show a single fully clothed adult with a natural expression, clearly visible face, head and upper body, balanced composition, soft lighting and a simple background. Keep the character's adult appearance unmistakable.",
    "No text, watermark, collage, duplicate people or character sheet.",
  ].join("\n\n");
}
