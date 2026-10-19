/** 客户端与服务端共用词典；每次显式传入语言，避免请求互相影响。 */
import { createInstance, type TOptions } from "i18next";
import en from "./locales/en";
import { FALLBACK_LOCALE, LANGUAGES, LOCALES, type Locale } from "./locales";

export type MessageKey = {
  [Namespace in keyof typeof en]: `${Namespace}:${keyof (typeof en)[Namespace] & string}`;
}[keyof typeof en];
type Template<Key extends MessageKey> =
  Key extends `${infer Namespace}:${infer Id}`
    ? Namespace extends keyof typeof en
      ? Id extends keyof (typeof en)[Namespace]
        ? (typeof en)[Namespace][Id]
        : never
      : never
    : never;
type Parameters<Text> = Text extends `${string}{{${infer Name}}}${infer Rest}`
  ? Name | Parameters<Rest>
  : never;
export type TranslationValues<Key extends MessageKey> = Record<
  Parameters<Template<Key>>,
  string | number
>;
export type TranslationArgs<Key extends MessageKey> = [
  Parameters<Template<Key>>,
] extends [never]
  ? [values?: Record<string, never>]
  : [values: TranslationValues<Key>];
export type Translator = <Key extends MessageKey>(
  key: Key,
  ...args: TranslationArgs<Key>
) => string;
export type StaticMessageKey = {
  [Key in MessageKey]: Parameters<Template<Key>> extends never ? Key : never;
}[MessageKey];
export type LocalizedMessage =
  | { key: StaticMessageKey; values?: Record<string, never> }
  | {
      [Key in MessageKey]: Parameters<Template<Key>> extends never
        ? never
        : { key: Key; values: TranslationValues<Key> };
    }[MessageKey];

export const i18n = createInstance();
void i18n.init({
  initAsync: false,
  lng: FALLBACK_LOCALE,
  fallbackLng: FALLBACK_LOCALE,
  supportedLngs: LOCALES,
  load: "currentOnly",
  ns: Object.keys(en),
  defaultNS: "common",
  keySeparator: false,
  resources: Object.fromEntries(
    LOCALES.map(locale => [locale, LANGUAGES[locale].messages])
  ),
  interpolation: { escapeValue: false, skipOnVariables: true },
  returnEmptyString: false,
  saveMissing: true,
  missingKeyHandler: (_languages, namespace, key) => {
    if (process.env.NODE_ENV !== "production")
      console.warn(`[i18n] Missing message: ${namespace}:${key}`);
  },
});

export function translate<Key extends MessageKey>(
  key: Key,
  locale: Locale,
  ...args: TranslationArgs<Key>
): string {
  const options: TOptions = { ...args[0], lng: locale };
  return String(i18n.t(String(key), options));
}

export function renderMessage(
  message: LocalizedMessage,
  locale: Locale
): string {
  return String(i18n.t(message.key, { ...message.values, lng: locale }));
}
