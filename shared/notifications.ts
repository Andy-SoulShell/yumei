/** 站内与外推按同一发布模板本地化，插值仅执行一次。 */
import { contentText } from "./discovery";
import type { Locale } from "./locales";
import type { ProactiveConfig } from "./operationalConfig";
export type NotificationMessage = {
  key: string;
  values?: Record<string, string | number>;
};
/** 通知正文中的用户资料不会被递归解释成模板。 */
export function renderNotification(
  config: ProactiveConfig,
  message: NotificationMessage,
  locale: Locale
) {
  const template = config.templates[message.key];
  if (!template) return "";
  return contentText(template, locale).replace(
    /\{\{(name|memory|eventDay)\}\}/g,
    (_match, name: string) => String(message.values?.[name] ?? "")
  );
}
