/** 解析聊天服务地址、模型及凭据，保持运营方默认与用户 BYOK 的优先关系。 */

import { FREE_TIER_DEFAULT_MODEL } from "../../shared/quotas";
import { keyProvider } from "./keyProvider";

/** 一次聊天实际使用的 Provider、模型、基础地址与服务端密钥。 */
export type ChatProvider = {
  name: "openrouter" | "deepseek";
  baseUrl: string;
  model: string;
  apiKey: string | null;
};

/** 按环境选择 DeepSeek 或 OpenRouter 的运营方默认配置。 */
export function getOperatorChatProvider(): ChatProvider {
  if (process.env.LLM_PROVIDER === "deepseek") {
    return {
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
      apiKey: process.env.OPERATOR_DEEPSEEK_KEY || null,
    };
  }
  return {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: FREE_TIER_DEFAULT_MODEL,
    apiKey: process.env.OPERATOR_OPENROUTER_KEY || null,
  };
}

/**
 * 解析用户聊天配置，用户 OpenRouter BYOK 优先于运营方默认服务。
 *
 * @remarks DeepSeek 与 OpenRouter 密钥分别使用，禁止交叉转发。
 */
export async function resolveChatProvider(
  userId: string
): Promise<ChatProvider> {
  const operator = getOperatorChatProvider();
  if (operator.name === "deepseek") {
    const keys = await keyProvider.describeUserKeys(userId);
    // BYOK 仍使用 OpenRouter；两家服务的密钥绝不混用。
    if (!keys.openrouter?.isSet) return operator;
  }
  return {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: FREE_TIER_DEFAULT_MODEL,
    apiKey: await keyProvider.get({ userId }, "openrouter"),
  };
}
