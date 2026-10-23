import { formatResetTime } from "./formatters";
import type { Translator } from "@shared/i18n";
import type { BusinessErrorDetails } from "@shared/errors";

/** 优先展示已知业务原因的译文，供应商诊断信息保留原文。 */
export function apiErrorMessage(
  error: {
    message: string;
    data?: { business?: BusinessErrorDetails | null } | null;
  },
  t: Translator
) {
  const business = error.data?.business;
  const usage = usageLimitMessage(business, t);
  if (usage) return usage;
  if (business?.reason === "VIDEO_REJECTED") return t(`video:${business.code}`);
  if (business?.reason === "LEVEL_LOCKED")
    return t("selfie:poseLocked", {
      required: business.requiredLevel,
      current: business.currentLevel,
    });
  if (business?.reason === "UPGRADE_REQUIRED")
    return t("chat:yourPlanDoesNotIncludeThisFeatureView");
  return error.message;
}

/** 只把结构化的用量原因展示给用户，不猜测 429 的具体含义。 */
export function usageLimitMessage(
  business: BusinessErrorDetails | null | undefined,
  t: Translator
) {
  if (business?.reason === "QUOTA_EXCEEDED")
    return t(
      business.meter === "chat"
        ? "billing:chatQuotaExhausted"
        : "billing:mediaQuotaExhausted",
      { time: formatResetTime(business.resetAt, t.lng) }
    );
  if (business?.reason === "RATE_LIMITED")
    return business.retryAt
      ? t("billing:retryAfterSeconds", {
          seconds: Math.max(
            1,
            Math.ceil((Date.parse(business.retryAt) - Date.now()) / 1000)
          ),
        })
      : t("billing:actionUnavailable");
  if (business?.reason === "CONCURRENCY_LIMIT")
    return t("billing:concurrencyLimit");
  if (business?.reason === "FOLLOWUP_LIMIT") return t("billing:followupLimit");
  return null;
}
