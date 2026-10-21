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
  config.billing.mode = (process.env.BILLING_PROVIDER ||
    config.billing.mode) as typeof config.billing.mode;
  config.models.chat.provider = (process.env.LLM_PROVIDER ||
    config.models.chat.provider) as typeof config.models.chat.provider;
  config.models.chat.operatorBaseUrl =
    process.env.OPERATOR_CHAT_BASE_URL?.replace(/\/+$/, "") || null;
  config.models.chat.deepseekModel =
    process.env.DEEPSEEK_MODEL?.trim() || config.models.chat.deepseekModel;
  config.models.image.provider = (process.env.IMAGE_PROVIDER ||
    config.models.image.provider) as typeof config.models.image.provider;
  config.models.image.comfyuiBaseUrl =
    process.env.COMFYUI_BASE_URL?.replace(/\/+$/, "") || null;
  config.models.image.falCouple =
    process.env.FAL_COUPLE_MODEL?.trim() || config.models.image.falCouple;
  const initialNumber = (name: string, fallback: number) =>
    process.env[name] ? Number(process.env[name]) : fallback;
  config.runtime.ai.dailyTaskLimit = initialNumber(
    "AI_DAILY_TASK_LIMIT",
    config.runtime.ai.dailyTaskLimit
  );
  config.runtime.ai.taskTimeoutMs = initialNumber(
    "AI_TASK_TIMEOUT_MS",
    config.runtime.ai.taskTimeoutMs
  );
  config.runtime.chat.maxOutputChars = initialNumber(
    "CHAT_MAX_OUTPUT_CHARS",
    config.runtime.chat.maxOutputChars
  );
  config.runtime.chat.replyTimeoutMs = initialNumber(
    "CHAT_REPLY_TIMEOUT_MS",
    config.runtime.chat.replyTimeoutMs
  );
  config.runtime.chat.localConcurrency = initialNumber(
    "CHAT_STREAM_CONCURRENCY",
    config.runtime.chat.localConcurrency
  );
  config.runtime.chat.userConcurrency = initialNumber(
    "CHAT_USER_CONCURRENCY",
    config.runtime.chat.userConcurrency
  );
  config.runtime.image.comfyuiTimeoutMs = initialNumber(
    "COMFYUI_TIMEOUT_MS",
    config.runtime.image.comfyuiTimeoutMs
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
