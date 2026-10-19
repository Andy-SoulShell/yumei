/** 中文原文作为文案标识；插值保持原值，不翻译用户生成的数据。 */
import { useCallback } from "react";
import { usePreferences } from "@/contexts/PreferencesContext";
import type { Locale } from "@shared/preferences";
import { en, zh } from "@/locales/messages";

export type TranslationValues = Record<string, unknown>;

/** 按指定语言翻译界面文案，缺失项保留原文，参数只执行纯文本插值。 */
export function translate(
  text: string,
  locale: Locale,
  values: TranslationValues = {}
) {
  const template = (locale === "en" ? en[text] : zh[text]) ?? text;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, key: string) =>
    key in values ? String(values[key] ?? "") : placeholder
  );
}

/** 仅翻译系统通知标题的固定后缀，角色名称保持用户输入的原文。 */
export function translateNotificationTitle(title: string, locale: Locale) {
  const separator = title.lastIndexOf(": ");
  if (separator < 0) return translate(title, locale);
  return (
    title.slice(0, separator + 2) +
    translate(title.slice(separator + 2), locale)
  );
}

/** 订阅账号语言偏好，并提供绑定当前语言的翻译函数。 */
export function useI18n() {
  const { locale } = usePreferences();
  const t = useCallback(
    (text: string, values?: TranslationValues) =>
      translate(text, locale, values),
    [locale]
  );
  return { t, locale };
}
