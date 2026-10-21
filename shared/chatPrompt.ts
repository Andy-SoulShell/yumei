/** 预览和聊天执行共用的提示词渲染；模板仅从发布配置传入。 */
import type { ProductConfig } from "./productConfig";
import { renderPrompt } from "./aiConfig";
import { resolveCompanionBehavior } from "./companionBehavior";
import type { CompanionEmotion } from "./companionEmotion";
import { getLevelByPoints } from "./intimacy";

export type ChatCharacter = {
  name: string;
  personality: string;
  appearance: string;
  interests?: string | null;
  customPrompt?: string | null;
  behavior?: unknown;
  intimacyLevel?: number;
  intimacyPoints?: number;
};
export type ChatPromptPreferences = {
  globalPrompt?: string | null;
  replyLanguage?: string | null;
  replyLengthLimit?: string | null;
};
export type ChatBehaviorContext = {
  emotion?: CompanionEmotion | null;
  memoryEnabled?: boolean;
};
/** 资料保持完整 JSON，编码分隔符并按转义后长度限制总输入。 */
function dataBlock(value: unknown, budget = 6000) {
  let remaining = budget;
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== "string") return item;
    let clipped = "";
    for (const char of item) {
      const cost = JSON.stringify(char).replace(/[<>]/g, "\\u003c").length - 2;
      if (cost > remaining) break;
      clipped += char;
      remaining -= cost;
    }
    return clipped;
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}
/** 独立的本轮语言提醒使用同一发布模板，不改写用户原文。 */
export function buildTurnLanguageReminder(
  config: ProductConfig,
  language: string | null | undefined
) {
  const value = language?.trim().slice(0, 50);
  return value
    ? renderPrompt(config.prompts.chat.turnLanguage, {
        language: dataBlock(value),
      })
    : "";
}
/** 渲染当前角色、关系和用户偏好，不维护另一份展示模板。 */
export function buildChatSystemPrompt(
  config: ProductConfig,
  girlfriend: ChatCharacter,
  apiConfig: ChatPromptPreferences = {},
  context: ChatBehaviorContext = {}
) {
  const behavior = resolveCompanionBehavior(girlfriend.behavior),
    templates = config.prompts.chat;
  const level =
    girlfriend.intimacyPoints === undefined
      ? (girlfriend.intimacyLevel ?? 1)
      : getLevelByPoints(girlfriend.intimacyPoints, config.intimacy.levels)
          .level;
  const stages = templates.relationshipStages[behavior.relationshipPace];
  const relationship =
    [...stages].reverse().find(stage => stage.minLevel <= level) ?? stages[0];
  return (
    renderPrompt(templates.system, {
      characterData: dataBlock({
        name: girlfriend.name?.slice(0, 100) ?? "",
        personality: girlfriend.personality?.slice(0, 2000) ?? "",
        appearance: girlfriend.appearance?.slice(0, 2000) ?? "",
        interests: girlfriend.interests?.slice(0, 1000) ?? "",
        customPrompt: girlfriend.customPrompt?.slice(0, 300) ?? "",
      }),
      expression: templates.expression[behavior.expression],
      verbosity: templates.verbosity[behavior.verbosity],
      initiative: templates.initiative[behavior.initiative],
      relationship: relationship.instruction,
      tone: templates.tone[context.emotion?.tone ?? "calm"],
      cause: templates.cause[context.emotion?.reason ?? "steady"],
      emotionIntensity: templates.emotionIntensity[behavior.emotionIntensity],
      styleData: dataBlock(
        { userNickname: behavior.userNickname, examples: behavior.examples },
        3200
      ),
      preferencesData: dataBlock(
        { globalPrompt: apiConfig.globalPrompt?.slice(0, 500) ?? "" },
        600
      ),
      languageRule: apiConfig.replyLanguage
        ? renderPrompt(templates.languageRule, {
            language: dataBlock(apiConfig.replyLanguage.slice(0, 50)),
          })
        : templates.defaultLanguage,
      lengthRule: apiConfig.replyLengthLimit
        ? renderPrompt(templates.lengthRule, {
            length: dataBlock(apiConfig.replyLengthLimit.slice(0, 100)),
          })
        : "",
      memoryState:
        context.memoryEnabled !== false && config.memory.enabled
          ? templates.memoryEnabled
          : templates.memoryDisabled,
    }).replace(/\n{3,}/g, "\n\n") + `\n${templates.safetyClause}`
  );
}
