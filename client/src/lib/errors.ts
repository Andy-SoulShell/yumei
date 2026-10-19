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
  if (business?.reason === "LEVEL_LOCKED")
    return t("selfie:poseLocked", {
      required: business.requiredLevel,
      current: business.currentLevel,
    });
  if (business?.reason === "UPGRADE_REQUIRED")
    return t("chat:yourPlanDoesNotIncludeThisFeatureView");
  return error.message;
}
