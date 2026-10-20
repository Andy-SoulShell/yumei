/** 主动联系的显式偏好、IANA 本地日历与免打扰规则。 */
import { z } from "zod";

export function validCompanionTimeZone(value: string) {
  try {
    if (!value || value.length > 64 || /^[+-]/.test(value)) return false;
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const proactivePreferencesSchema = z
  .object({
    timeZone: z
      .string()
      .refine(validCompanionTimeZone, "Invalid IANA time zone"),
    proactiveEnabled: z.boolean(),
    proactiveMode: z.enum(["events", "daily"]),
    quietStart: z.number().int().min(0).max(1439),
    quietEnd: z.number().int().min(0).max(1439),
    frequencyDays: z.number().int().min(1).max(14),
    hidePrivatePreview: z.boolean(),
  })
  .strict();
export type ProactivePreferences = z.infer<typeof proactivePreferencesSchema>;

export const DEFAULT_PROACTIVE_PREFERENCES: ProactivePreferences = {
  timeZone: "UTC",
  proactiveEnabled: false,
  proactiveMode: "events",
  quietStart: 1320,
  quietEnd: 480,
  frequencyDays: 1,
  hidePrivatePreview: true,
};

export function proactiveLocalClock(now: Date, timeZone: string) {
  if (!Number.isFinite(now.getTime()) || !validCompanionTimeZone(timeZone))
    return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find(value => value.type === name)!.value;
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

/** 起止相同表示关闭免打扰；跨日窗口在两个边界分别判断。 */
export function isProactiveQuiet(minute: number, start: number, end: number) {
  return start === end
    ? false
    : start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
}

export function calendarDayDistance(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86_400_000
  );
}

/** 限制离线设备的展示窗口，不能越过已设置的免打扰或本地日结束。 */
export function proactiveDeliveryExpiresAt(
  now: Date,
  preferences: ProactivePreferences,
  deadline: Date
) {
  const first = proactiveLocalClock(now, preferences.timeZone);
  if (
    !first ||
    !Number.isFinite(deadline.getTime()) ||
    isProactiveQuiet(first.minute, preferences.quietStart, preferences.quietEnd)
  )
    return new Date(now);
  const end = Math.min(deadline.getTime(), now.getTime() + 26 * 3_600_000);
  for (
    let instant = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
    instant < end;
    instant += 60_000
  ) {
    const clock = proactiveLocalClock(new Date(instant), preferences.timeZone);
    if (
      !clock ||
      clock.day !== first.day ||
      isProactiveQuiet(
        clock.minute,
        preferences.quietStart,
        preferences.quietEnd
      )
    )
      return new Date(instant);
  }
  return new Date(Math.max(now.getTime(), end));
}

/** 以本地日历日频控；另设六小时下限，避免切换时区立即重复联系。 */
export function proactiveContactWindow(input: {
  preferences: ProactivePreferences;
  now: Date;
  lastContactAt?: Date | null;
  unreadContacts?: number;
  lastInteractionAt?: Date | null;
  hasActiveChat?: boolean;
}) {
  const prefs = proactivePreferencesSchema.safeParse(input.preferences);
  if (!prefs.success || !prefs.data.proactiveEnabled)
    return { allowed: false, reason: "disabled" as const, day: null };
  const clock = proactiveLocalClock(input.now, prefs.data.timeZone);
  if (!clock) return { allowed: false, reason: "disabled" as const, day: null };
  if (
    isProactiveQuiet(clock.minute, prefs.data.quietStart, prefs.data.quietEnd)
  )
    return { allowed: false, reason: "quiet" as const, day: clock.day };
  if (
    input.hasActiveChat ||
    (input.lastInteractionAt &&
      input.now.getTime() - input.lastInteractionAt.getTime() < 6 * 3_600_000)
  )
    return { allowed: false, reason: "active" as const, day: clock.day };
  if (input.lastContactAt) {
    const last = proactiveLocalClock(input.lastContactAt, prefs.data.timeZone);
    const cadence = Math.min(
      30,
      prefs.data.frequencyDays *
        2 ** Math.min(3, Math.max(0, input.unreadContacts ?? 0))
    );
    if (
      !last ||
      calendarDayDistance(last.day, clock.day) < cadence ||
      input.now.getTime() - input.lastContactAt.getTime() < 6 * 3_600_000
    )
      return { allowed: false, reason: "cadence" as const, day: clock.day };
  }
  return { allowed: true, reason: "eligible" as const, day: clock.day };
}
