/** 业务规则、提示词与记忆的初始配置，只在空库首次导入。 */
import data from "./product.json";
import { productConfigSchema } from "../../shared/productConfig";

/** 部署中的结账链接和变体映射仅在初始化时导入，以后由管理 API 编辑。 */
export function initialProductConfig() {
  const config = productConfigSchema.parse(data);
  for (const id of ["plus", "pro"]) {
    const plan = config.billing.plans.find(item => item.id === id)!;
    plan.checkoutUrl =
      process.env[`LEMONSQUEEZY_CHECKOUT_${id.toUpperCase()}`] || null;
    plan.lemonVariantId =
      process.env[`LEMONSQUEEZY_VARIANT_${id.toUpperCase()}`] || null;
  }
  config.proactive.enabled = process.env.COMPANION_PROACTIVE_ENABLED !== "0";
  if (process.env.PROACTIVE_TICK_MS)
    config.proactive.tickMs = Number(process.env.PROACTIVE_TICK_MS);
  if (process.env.PROACTIVE_PUSH_TIMEOUT_MS)
    config.proactive.pushTimeoutMs = Number(
      process.env.PROACTIVE_PUSH_TIMEOUT_MS
    );
  config.memory.enabled = process.env.COMPANION_MEMORY_ENABLED !== "0";
  const provider =
    process.env.LLM_PROVIDER === "deepseek" ? "deepseek" : "openrouter";
  config.memory.extraction.models[provider] =
    process.env.MEMORY_EXTRACTION_MODEL?.trim() || null;
  config.memory.semantic.model =
    process.env.MEMORY_EMBEDDING_MODEL?.trim() || null;
  if (process.env.CHAT_CONTEXT_CHAR_LIMIT) {
    config.prompts.context.total = Number(process.env.CHAT_CONTEXT_CHAR_LIMIT);
    config.prompts.context.followups = Math.min(
      48000,
      config.prompts.context.total - 16000
    );
  }
  return productConfigSchema.parse(config);
}
