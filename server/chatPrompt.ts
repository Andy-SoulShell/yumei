/** 组合角色资料、用户全局偏好和角色专属指令，不访问外部服务。 */
import type { Girlfriend, ApiConfig } from "../drizzle/schema";

export function buildChatSystemPrompt(
  girlfriend: Pick<
    Girlfriend,
    "name" | "personality" | "appearance" | "interests" | "customPrompt"
  >,
  apiConfig?: Pick<
    ApiConfig,
    "globalPrompt" | "replyLanguage" | "replyLengthLimit"
  >
) {
  let systemPrompt = `你是${girlfriend.name}，一个虚拟女友。

性格特征：
${girlfriend.personality}

外貌特征：
${girlfriend.appearance}

${girlfriend.interests ? `兴趣爱好：\n${girlfriend.interests}` : ""}

请以${girlfriend.name}的身份与用户对话，保持角色的一致性。你的回复应该自然、友好、充满情感。`;

  // 追加全局提示词（如果有）
  if (apiConfig?.globalPrompt) {
    systemPrompt += `\n\n【全局行为规范】\n${apiConfig.globalPrompt}`;
  }

  // 追加回复语言和长度限制
  if (apiConfig?.replyLanguage && apiConfig.replyLanguage !== "中文") {
    systemPrompt += `\n\n请使用${apiConfig.replyLanguage}回复。`;
  }
  if (apiConfig?.replyLengthLimit) {
    systemPrompt += `\n回复长度控制在${apiConfig.replyLengthLimit}左右。`;
  }

  // 追加个体定制提示词（如果有）
  if (girlfriend.customPrompt) {
    systemPrompt += `\n\n【${girlfriend.name}专属指令】\n${girlfriend.customPrompt}`;
  }
  return systemPrompt;
}
