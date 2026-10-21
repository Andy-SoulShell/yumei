/** 解析聊天服务地址、模型及凭据，保持运营方默认与用户 BYOK 的优先关系。 */

import type { ProductConfig } from "../../shared/productConfig";
import { getPublishedProductConfig } from "../repositories/productConfig";
import { keyProvider } from "./keyProvider";
import { isBillingEnforced } from "../billing";

/** 设置页报告和聊天任务执行共用模型选择，保留未选择模型时的动态默认语义。 */
export function resolveChatModel(
  provider: Pick<ChatProvider, "name" | "model" | "isByok">,
  preferredModel: string | null | undefined,
  configuration: ProductConfig,
  modelLocked: boolean
) {
  if (provider.name === "deepseek") return provider.model;
  if (isBillingEnforced(configuration) && modelLocked && !provider.isByok)
    return configuration.billing.defaultChatModel;
  return preferredModel || configuration.billing.defaultChatModel;
}

/** 一次聊天实际使用的 Provider、模型、基础地址与服务端密钥。 */
export type ChatProvider = {
  name: "openrouter" | "deepseek";
  baseUrl: string;
  model: string;
  apiKey: string | null;
  /** 本次实际凭据是否来自用户，决定套餐计量豁免。 */
  isByok: boolean;
};

/** 按环境选择 DeepSeek 或 OpenRouter 的运营方默认配置。 */
export async function getOperatorChatProvider(
  configuration?: ProductConfig
): Promise<ChatProvider> {
  const policy = configuration ?? (await getPublishedProductConfig());
  if (policy.models.chat.provider === "deepseek") {
    return {
      name: "deepseek",
      baseUrl:
        policy.models.chat.operatorBaseUrl?.replace(/\/+$/, "") ||
        "https://api.deepseek.com",
      model: policy.models.chat.deepseekModel,
      apiKey: process.env.OPERATOR_DEEPSEEK_KEY || null,
      isByok: false,
    };
  }
  return {
    name: "openrouter",
    baseUrl:
      policy.models.chat.operatorBaseUrl?.replace(/\/+$/, "") ||
      "https://openrouter.ai/api/v1",
    model: policy.billing.defaultChatModel,
    apiKey: process.env.OPERATOR_OPENROUTER_KEY || null,
    isByok: false,
  };
}

/**
 * 解析用户聊天配置，用户 OpenRouter BYOK 优先于运营方默认服务。
 *
 * @remarks DeepSeek 与 OpenRouter 密钥分别使用，禁止交叉转发。
 */
export async function resolveChatProvider(
  userId: string,
  configuration?: ProductConfig
): Promise<ChatProvider> {
  const policy = configuration ?? (await getPublishedProductConfig());
  const operator = await getOperatorChatProvider(policy);
  const key = await keyProvider.resolve({ userId }, "openrouter");
  if (key.source !== "user") return operator;
  return {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: policy.billing.defaultChatModel,
    apiKey: key.value,
    isByok: key.source === "user",
  };
}
