/** 用户界面偏好的稳定标识；与 AI 回复语言及用户创作内容相互独立。 */
export const UI_LANGUAGES = ["system", "zh-CN", "en"] as const;
export const COLOR_MODES = ["system", "light", "dark"] as const;
export const THEME_IDS = [
  "tokyo-sunset",
  "sakura",
  "midnight",
  "neon-mint",
  "crimson",
  "sapphire",
  "lava",
  "pearl",
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];
export type Locale = "zh-CN" | "en";
export type ColorMode = (typeof COLOR_MODES)[number];
export type ThemeId = (typeof THEME_IDS)[number];
export interface InterfacePreferences {
  language: UiLanguage;
  theme: ThemeId;
  colorMode: ColorMode;
}

export const DEFAULT_PREFERENCES: InterfacePreferences = {
  language: "system",
  theme: "tokyo-sunset",
  colorMode: "system",
};

/** 校验本地缓存，只接受已支持的标识，损坏或旧版数据逐字段回退。 */
export function parsePreferences(value: unknown): InterfacePreferences {
  const data = value && typeof value === "object" ? value : {};
  const candidate = data as Partial<InterfacePreferences>;
  return {
    language: UI_LANGUAGES.includes(candidate.language as UiLanguage)
      ? candidate.language!
      : DEFAULT_PREFERENCES.language,
    theme: THEME_IDS.includes(candidate.theme as ThemeId)
      ? candidate.theme!
      : DEFAULT_PREFERENCES.theme,
    colorMode: COLOR_MODES.includes(candidate.colorMode as ColorMode)
      ? candidate.colorMode!
      : DEFAULT_PREFERENCES.colorMode,
  };
}

/** 按浏览器语言优先级解析自动语言，中文使用简体中文，其余回退英文。 */
export function resolveLocale(
  language: UiLanguage,
  browserLanguages: readonly string[]
): Locale {
  if (language !== "system") return language;
  for (const candidate of browserLanguages) {
    if (/^zh(?:-|$)/i.test(candidate)) return "zh-CN";
    if (/^en(?:-|$)/i.test(candidate)) return "en";
  }
  return "en";
}
