import { LANGUAGES, LOCALES, matchLocale } from "@shared/locales";

/** 聊天朗读跟随 AI 回复设置，默认中文，不受界面语言切换影响。 */
export function resolveSpeechLanguage(
  replyLanguage: string | null | undefined
) {
  const value = replyLanguage?.trim().toLowerCase();
  const locale =
    matchLocale(value) ??
    LOCALES.find(id =>
      LANGUAGES[id].speechNames.some(name => name.toLowerCase() === value)
    ) ??
    "zh-CN";
  return LANGUAGES[locale].speech;
}

/** 无匹配音色时由浏览器按 utterance.lang 处理。 */
export function selectSpeechVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string
) {
  const primary = language.split("-")[0].toLowerCase();
  const candidates = voices.filter(
    voice => voice.lang.toLowerCase().split("-")[0] === primary
  );
  return (
    candidates.find(
      voice => voice.lang.toLowerCase() === language.toLowerCase()
    ) ?? candidates[0]
  );
}
