/** 语言偏好由账号管理；react-i18next 按本次渲染的语言绑定翻译。 */
import { useTranslation } from "react-i18next";
import { usePreferences } from "@/contexts/PreferencesContext";
import { i18n, type Translator } from "@shared/i18n";
export { translate } from "@shared/i18n";
export type { MessageKey, TranslationValues } from "@shared/i18n";

/** 订阅账号语言偏好，并提供绑定当前语言的翻译函数。 */
export function useI18n() {
  const { locale } = usePreferences();
  const { t } = useTranslation(undefined, {
    i18n,
    lng: locale,
    useSuspense: false,
  });
  return { t: t as Translator, locale };
}
