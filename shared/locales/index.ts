/** 新增语言只需导入语言包，并在此登记语言、日历与字体配置。 */
import {
  enUS,
  ja as jaCalendar,
  ko as koCalendar,
  zhCN,
} from "date-fns/locale";
import en from "./en";
import zhCNMessages from "./zh-CN";
import ja from "./ja";
import ko from "./ko";
import type { MessageCatalog } from "./types";

type LanguageDefinition = {
  label: string;
  matches: readonly string[];
  messages: MessageCatalog;
  calendar: typeof enUS;
  speech: string;
  speechNames: readonly string[];
  fontFamily: string;
  fontStylesheet?: string;
  wordBreak: "normal" | "keep-all";
};
const systemFonts =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const fontUrl = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;

export const LANGUAGES = {
  "zh-CN": {
    label: "简体中文",
    matches: ["zh"],
    messages: zhCNMessages,
    calendar: zhCN,
    speech: "zh-CN",
    speechNames: ["中文", "汉语", "中国語", "중국어", "chinese"],
    fontFamily: `"Noto Sans SC", ${systemFonts}`,
    fontStylesheet: fontUrl("Noto+Sans+SC"),
    wordBreak: "normal",
  },
  en: {
    label: "English",
    matches: ["en"],
    messages: en,
    calendar: enUS,
    speech: "en-US",
    speechNames: ["英文", "英语", "英語", "영어", "english"],
    fontFamily: systemFonts,
    fontStylesheet: undefined,
    wordBreak: "normal",
  },
  ja: {
    label: "日本語",
    matches: ["ja"],
    messages: ja,
    calendar: jaCalendar,
    speech: "ja-JP",
    speechNames: ["日文", "日语", "日本語", "일본어", "japanese"],
    fontFamily: `"Noto Sans JP", ${systemFonts}`,
    fontStylesheet: fontUrl("Noto+Sans+JP"),
    wordBreak: "normal",
  },
  ko: {
    label: "한국어",
    matches: ["ko"],
    messages: ko,
    calendar: koCalendar,
    speech: "ko-KR",
    speechNames: ["韩语", "韩文", "韓国語", "한국어", "korean"],
    fontFamily: `"Noto Sans KR", ${systemFonts}`,
    fontStylesheet: fontUrl("Noto+Sans+KR"),
    wordBreak: "keep-all",
  },
} satisfies Record<string, LanguageDefinition>;

export type Locale = keyof typeof LANGUAGES;
export const LOCALES = Object.keys(LANGUAGES) as [Locale, ...Locale[]];
export const FALLBACK_LOCALE: Locale = "en";

/** 按配置匹配地区变体；不支持的浏览器语言留给下一候选语言。 */
export function matchLocale(
  value: string | null | undefined
): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.replaceAll("_", "-").toLowerCase();
  return (
    LOCALES.find(locale => locale.toLowerCase() === normalized) ??
    LOCALES.find(locale =>
      LANGUAGES[locale].matches.some(
        prefix => normalized === prefix || normalized.startsWith(`${prefix}-`)
      )
    )
  );
}

export function normalizeLocale(value: string | null | undefined): Locale {
  return matchLocale(value) ?? FALLBACK_LOCALE;
}
