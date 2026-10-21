import { vi } from "vitest";
import * as repository from "./repositories/productConfig";
const originalPublished = repository.getPublishedProductConfig;
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

export const DEFAULT_PROACTIVE_PREFERENCES = productFixture.proactive.defaults;

/** 回归测试通过配置边界模拟运营规则，生产执行不再读取这些环境变量。 */
export function stubProductConfig(path: string, value: unknown) {
  const current = repository.getPublishedProductConfig;
  const previous = vi.isMockFunction(current)
    ? (current.getMockImplementation() ?? originalPublished)
    : current;
  vi.spyOn(repository, "getPublishedProductConfig").mockImplementation(
    async (...args) => {
      const result = structuredClone(await previous(...args));
      const parts = path.split(".");
      let target = result as Record<string, unknown>;
      for (const key of parts.slice(0, -1))
        target = target[key] as Record<string, unknown>;
      target[parts.at(-1)!] = value;
      return result;
    }
  );
}

export const DEFAULT_COMPANION_BEHAVIOR =
  productFixture.characters.defaultBehavior;
