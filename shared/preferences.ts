/** 用户界面偏好的稳定标识；与 AI 回复语言及用户创作内容相互独立。 */
import { FALLBACK_LOCALE, LOCALES, matchLocale, type Locale } from "./locales";
export { LANGUAGES, LOCALES, normalizeLocale } from "./locales";
export type { Locale } from "./locales";
export const UI_LANGUAGES = ["system", ...LOCALES] as const;
export const COLOR_MODES = ["system", "light", "dark"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export type ColorMode = (typeof COLOR_MODES)[number];
export type ThemeId = string;
export interface InterfacePreferences {
  language: UiLanguage;
  theme: ThemeId;
  colorMode: ColorMode;
}

export const DEFAULT_PREFERENCES: InterfacePreferences = {
  language: "system",
  theme: "",
  colorMode: "system",
};

/** 校验本地偏好；主题存在性由当前发布配置决定。 */
export function parsePreferences(
  value: unknown,
  themes?: import("./productConfig").ThemesConfig
): InterfacePreferences {
  const data = value && typeof value === "object" ? value : {};
  const candidate = data as Partial<InterfacePreferences>;
  return {
    language: UI_LANGUAGES.includes(candidate.language as UiLanguage)
      ? candidate.language!
      : DEFAULT_PREFERENCES.language,
    theme:
      typeof candidate.theme === "string" &&
      candidate.theme.length <= 100 &&
      (!themes ||
        themes.items.some(item => item.id === candidate.theme && item.enabled))
        ? candidate.theme
        : (themes?.defaultThemeId ?? ""),
    colorMode: COLOR_MODES.includes(candidate.colorMode as ColorMode)
      ? candidate.colorMode!
      : DEFAULT_PREFERENCES.colorMode,
  };
}

/** 按浏览器优先级从注册语言中选择，所有候选均不支持时回退英文。 */
export function resolveLocale(
  language: UiLanguage,
  browserLanguages: readonly string[]
): Locale {
  if (language !== "system") return language;
  for (const candidate of browserLanguages) {
    const matched = matchLocale(candidate);
    if (matched) return matched;
  }
  return FALLBACK_LOCALE;
}
