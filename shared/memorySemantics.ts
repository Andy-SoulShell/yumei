/** 记忆语义相似度与日期锚定规则；不把未知日期和无效向量当作确定事实。 */

/** 校验向量数值、维度和模长，拒绝无意义或超出容量的向量。 */
export function validMemoryVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 4096 &&
    value.every(
      item =>
        typeof item === "number" &&
        Number.isFinite(item) &&
        Math.abs(item) <= 1e6
    ) &&
    value.some(item => item !== 0)
  );
}

/** 计算同模型同维度向量的余弦相似度，无效或零向量返回未知。 */
export function memoryCosineSimilarity(
  left: unknown,
  right: unknown
): number | null {
  if (
    !validMemoryVector(left) ||
    !validMemoryVector(right) ||
    left.length !== right.length
  )
    return null;
  let dot = 0,
    a = 0,
    b = 0;
  // 先缩放，避免有效的小数向量平方后下溢为零。
  const leftScale = Math.max(...left.map(Math.abs));
  const rightScale = Math.max(...right.map(Math.abs));
  for (let i = 0; i < left.length; i++) {
    const x = left[i] / leftScale,
      y = right[i] / rightScale;
    dot += x * y;
    a += x ** 2;
    b += y ** 2;
  }
  return Math.max(-1, Math.min(1, dot / Math.sqrt(a * b)));
}

/** 返回经过日历验证的 ISO 日期，拒绝溢出、二月三十日等输入。 */
function calendarDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

/** 按用户 IANA 时区读取来源消息对应的日历日期，非法时区不静默猜测。 */
export function memorySourceDay(source: Date, timeZone: string): string | null {
  if (!Number.isFinite(source.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(source);
    const value = (name: string) =>
      Number(parts.find(part => part.type === name)?.value);
    return calendarDate(value("year"), value("month"), value("day"));
  } catch {
    return null;
  }
}

/** 仅解析明确日期或四语日相对词，模糊的「下次」「过阵子」保持未知。 */
export function resolveMemoryEventDay(
  content: string,
  source: Date,
  timeZone: string
): string | null {
  const day = memorySourceDay(source, timeZone);
  if (!day) return null;
  const full = content.match(
    /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b|\b(20\d{2})年(\d{1,2})月(\d{1,2})日?/
  );
  if (full)
    return calendarDate(
      Number(full[1] ?? full[4]),
      Number(full[2] ?? full[5]),
      Number(full[3] ?? full[6])
    );
  const monthDay = content.match(/(\d{1,2})月(\d{1,2})日/);
  if (monthDay) {
    const yearOffset = /后年|後年|再来年/.test(content)
      ? 2
      : /前年|一昨年/.test(content)
        ? -2
        : /明年|来年|내년|\bnext year\b/i.test(content)
          ? 1
          : /去年|昨年|작년|\blast year\b/i.test(content)
            ? -1
            : 0;
    return calendarDate(
      Number(day.slice(0, 4)) + yearOffset,
      Number(monthDay[1]),
      Number(monthDay[2])
    );
  }
  // 先匹配后天，再匹配明天，避免长短词覆盖。
  const offset = /后天|後天|明後日|모레|\bday after tomorrow\b/i.test(content)
    ? 2
    : /明天|明日|내일|\btomorrow\b/i.test(content)
      ? 1
      : /今天|今日|오늘|\btoday\b/i.test(content)
        ? 0
        : null;
  if (offset === null) return null;
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
