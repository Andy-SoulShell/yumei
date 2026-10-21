/** 亲密度纯计算函数；所有等级、颜色和时段均由调用方传入发布配置。 */
import type { ProductConfig } from "./productConfig";
export type { IntimacyLevel, PointsRule } from "./productConfig";
type Threshold = { level: number; requiredPoints: number };

/** 根据经验读取配置中已达到的最高等级。 */
export function getLevelByPoints<L extends Threshold>(
  points: number,
  levels: readonly L[]
): L {
  points = Number.isFinite(points) ? Math.max(0, points) : 0;
  let result = levels[0];
  for (const level of levels) {
    if (points < level.requiredPoints) break;
    result = level;
  }
  return result;
}
/** 读取等级定义，并将未知编号限制到实际配置范围。 */
export function getLevelInfo<L extends Threshold>(
  level: number,
  levels: readonly L[]
): L {
  return levels[
    Math.min(Math.max(Math.trunc(level) - 1, 0), levels.length - 1)
  ];
}
/** 满级时返回 null，等级数量不再写死。 */
export function getNextLevel<L extends Threshold>(
  level: number,
  levels: readonly L[]
): L | null {
  return levels.find(item => item.level > level) ?? null;
}
/** 返回升级所需经验，满级返回 null。 */
export function getPointsToNextLevel(
  points: number,
  levels: readonly Threshold[]
): number | null {
  const next = getNextLevel(getLevelByPoints(points, levels).level, levels);
  return next ? next.requiredPoints - points : null;
}
/** 计算当前配置等级区间内的百分比。 */
export function getLevelProgress(
  points: number,
  levels: readonly Threshold[]
): number {
  const current = getLevelByPoints(points, levels),
    next = getNextLevel(current.level, levels);
  return next
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((points - current.requiredPoints) /
              (next.requiredPoints - current.requiredPoints)) *
              100
          )
        )
      )
    : 100;
}
/** 根据可配置 IANA 时区与跨午夜时间窗口判断夜间。 */
export function isNightTime(
  date: Date,
  night: ProductConfig["intimacy"]["night"]
): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: night.timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date)
  );
  return night.startHour === night.endHour
    ? false
    : night.startHour < night.endHour
      ? hour >= night.startHour && hour < night.endHour
      : hour >= night.startHour || hour < night.endHour;
}
/** 生成可直接用于内联样式的渐变，动态颜色不依赖构建期 Tailwind 类。 */
export function getLevelGradient<
  L extends Threshold & { gradientFrom: string; gradientTo: string },
>(level: number, levels: readonly L[]): string {
  const info = getLevelInfo(level, levels);
  return `linear-gradient(to right, ${info.gradientFrom}, ${info.gradientTo})`;
}
