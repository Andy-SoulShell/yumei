/** 测试使用的初始业务响应；生产前后端不得导入此文件。 */
import source from "./seeds/product.json";
import {
  localizeProductConfig,
  productConfigSchema,
} from "../shared/productConfig";
export const productFixture = productConfigSchema.parse(source);
export const productView = localizeProductConfig(productFixture, "zh-CN");
export const TIER_LIMITS = Object.fromEntries(
  productFixture.billing.plans.map(plan => [plan.id, plan.limits])
);
export const TIER_PRICES = Object.fromEntries(
  productFixture.billing.plans.map(plan => [plan.id, plan.price])
);
export const RATE_LIMITS_PER_MINUTE = productFixture.billing.rateLimits;
export const SELFIE_POSES = productFixture.selfies.poses;

export const THEME_IDS = productFixture.themes.items.map(item => item.id);
export const THEMES = Object.fromEntries(
  productFixture.themes.items.map(item => [item.id, item])
);
export const DEFAULT_PREFERENCES = {
  language: "system",
  colorMode: "system",
  theme: productFixture.themes.defaultThemeId,
} as const;
