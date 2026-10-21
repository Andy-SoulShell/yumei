import * as emotion from "../shared/companionEmotion";
import * as behavior from "../shared/companionBehavior";
/** 旧功能回归显式传入种子快照；生产代码不得导入测试配置。 */
import { productFixture } from "./testProductConfig";
import * as chat from "../shared/chatPrompt";
import * as images from "./promptTemplates";
import * as memory from "../shared/memory";
import * as extraction from "./memory";
import * as budget from "./chatContextBudget";
type Tail<T extends unknown[]> = T extends [unknown, ...infer Rest]
  ? Rest
  : never;
export const buildChatSystemPrompt = (
  ...args: Tail<Parameters<typeof chat.buildChatSystemPrompt>>
) => chat.buildChatSystemPrompt(productFixture, ...args);
export const buildTurnLanguageReminder = (
  ...args: Tail<Parameters<typeof chat.buildTurnLanguageReminder>>
) => chat.buildTurnLanguageReminder(productFixture, ...args);
export const buildImagePrompt = (
  ...args: Tail<Parameters<typeof images.buildImagePrompt>>
) => images.buildImagePrompt(productFixture, ...args);
export const buildCoupleImagePrompt = (
  ...args: Tail<Parameters<typeof images.buildCoupleImagePrompt>>
) => images.buildCoupleImagePrompt(productFixture, ...args);
export const shouldExtractMemories = (rounds: number, message: string) =>
  memory.shouldExtractMemories(rounds, message, productFixture.memory);
export const memoryCapacity = (level: number) =>
  memory.memoryCapacity(level, productFixture.memory);
export const memoryInjectionK = (level: number, message = "") =>
  memory.memoryInjectionK(level, message, productFixture.memory);
export const timeDecayFactor = (date: Date, now?: Date) =>
  memory.timeDecayFactor(date, productFixture.memory, now);
export const scoreMemory = (
  value: memory.ScorableMemory,
  message: string,
  now?: Date
) => memory.scoreMemory(value, message, productFixture.memory, now);
export const parseExtractionResponse = (raw: string) =>
  extraction.parseExtractionResponse(raw, productFixture.memory);
export const chatContextLimits = () => ({
  ...budget.chatContextLimits(productFixture),
  total: 64000,
});
export const planChatContext = (
  input: Tail<Parameters<typeof budget.planChatContext>>[0]
) =>
  budget.planChatContext(
    {
      ...productFixture,
      prompts: {
        ...productFixture.prompts,
        context: { ...productFixture.prompts.context, total: 64000 },
      },
    },
    input
  );
export const SAFETY_SYSTEM_CLAUSE = productFixture.prompts.chat.safetyClause;

export { DEFAULT_COMPANION_BEHAVIOR } from "./testProductConfig";
export const evolveCompanionEmotion = (
  previous: Parameters<typeof emotion.evolveCompanionEmotion>[0],
  text: string,
  now?: Date
) =>
  emotion.evolveCompanionEmotion(previous, text, productFixture.emotion, now);
export const resolveCompanionBehavior = (value: unknown) =>
  behavior.resolveCompanionBehavior(
    value,
    productFixture.characters.defaultBehavior
  );
