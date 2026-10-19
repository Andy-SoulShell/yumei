import { FREE_TIER_DEFAULT_MODEL } from "../../shared/quotas";
import { keyProvider } from "./keyProvider";

export type ChatProvider = {
  name: "openrouter" | "deepseek";
  baseUrl: string;
  model: string;
  apiKey: string | null;
};

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
