/** 奖励说明直接解释执行字段，不再保存可与实际条件脱节的规则文案。 */
import type {
  RewardAction,
  localizeProductConfig,
} from "@shared/productConfig";
import type { Translator } from "@shared/i18n";

export function rewardDescription(
  action: RewardAction,
  config: ReturnType<typeof localizeProductConfig>,
  t: Translator
) {
  const rule = config.intimacy.rules[action];
  switch (action) {
    case "text_message":
      return [
        t("intimacy:minimumText", { count: config.intimacy.minimumTextLength }),
        rule.bonusPoints
          ? t("intimacy:rewardText", {
              count: rule.bonusThreshold!,
              points: rule.bonusPoints,
            })
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "voice_message":
      return rule.bonusPoints
        ? t("intimacy:rewardVoice", {
            count: rule.bonusThreshold! / 1000,
            points: rule.bonusPoints,
          })
        : "";
    case "selfie":
      return rule.bonusPoints
        ? t("intimacy:rewardSelfie", { points: rule.bonusPoints })
        : "";
    case "daily_first":
      return rule.bonusPoints
        ? t("intimacy:rewardStreak", {
            count: rule.bonusThreshold!,
            points: rule.bonusPoints,
          })
        : "";
    case "edit_profile":
      return rule.bonusPoints
        ? t("intimacy:rewardProfile", { points: rule.bonusPoints })
        : "";
    case "long_conversation":
      return t("intimacy:rewardLong", { count: rule.bonusThreshold! + 1 });
    case "night_chat":
      return t("intimacy:rewardNight", {
        zone: config.intimacy.night.timeZone,
        start: config.intimacy.night.startHour,
        end: config.intimacy.night.endHour,
      });
  }
}
