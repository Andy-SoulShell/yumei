import { translate } from "@shared/i18n";
import type { Locale } from "@shared/locales";

/** 相对时间的单位与语序由浏览器的本地化数据决定。 */
export function formatRelativeTime(
  value: Date | string,
  locale: Locale,
  now = new Date()
) {
  const date = new Date(value);
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < 60_000) return translate("common:justNow", locale);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsed < 3_600_000)
    return relative.format(-Math.floor(elapsed / 60_000), "minute");
  if (elapsed < 86_400_000)
    return relative.format(-Math.floor(elapsed / 3_600_000), "hour");
  if (elapsed < 604_800_000)
    return relative.format(-Math.floor(elapsed / 86_400_000), "day");
  return date.toLocaleDateString(locale);
}

/** 金额保持数字；币种和计费周期均作为数据传入。 */
export function formatPrice(
  price: { amount: number; currency: string; period: "month" | "year" },
  locale: Locale
) {
  const periods = {
    month: "billing:monthlyPrice",
    year: "billing:yearlyPrice",
  } as const;
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
  }).format(price.amount);
  return translate(periods[price.period], locale, { price: amount });
}

/** 同一个额度恢复时刻按设备时区显示，保留时区名称避免含糊的“明天”。 */
export function formatResetTime(value: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
