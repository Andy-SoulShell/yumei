/** 对比完整业务快照，避免从某一分区发布时遗漏其他已保存修改。 */
import { productConfigSchema, type ProductConfig } from "@shared/productConfig";
import type { OfficialCharacter } from "@shared/discovery";
import { fieldLabel, formOptionLabel } from "./ConfigForm";
import { sections } from "./managementModel";
import { sameConfigValue } from "./editorState";
import { officialCharacterIssues, type FieldChange } from "./officialEditor";
import {
  defaultUnit,
  displayedNumber,
  nullableLabel,
  valueUnits,
} from "./fieldPresentation";
import { getSetting, settingsChoices } from "./settingsModel";
function readable(value: unknown, path: string, config: ProductConfig): string {
  if (value === undefined) return "未设置";
  if (value === null) {
    if (
      /dailySelfies$/.test(path) &&
      getSetting(config, path.replace(/dailySelfies$/, "monthlySelfies")) !==
        null
    )
      return "按月计量";
    if (
      /monthlySelfies$/.test(path) &&
      getSetting(config, path.replace(/monthlySelfies$/, "dailySelfies")) !==
        null
    )
      return "按日计量";
    return nullableLabel(path);
  }
  if (value === "") return "留空";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (typeof value === "number") {
    if (/quiet(Start|End)$/.test(path))
      return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}（本地时间）`;
    const currency = getSetting(config, path.replace(/\.amount$/, ".currency"));
    const units = valueUnits(
      path,
      typeof currency === "string" ? currency : undefined
    );
    if (units.length) {
      const u = defaultUnit(path, value, units);
      return `${displayedNumber(value, u.factor)} ${u.label}`;
    }
  }
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item, i) => readable(item, `${path}.${i}`, config))
          .join("；")
      : "无";
  if (typeof value === "object")
    return Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(
        ([key, item]) =>
          `${fieldLabel(key)}：${readable(item, `${path}.${key}`, config)}`
      )
      .join("；");
  if (typeof value === "string")
    return (
      settingsChoices(config, path)?.find(item => item.value === value)
        ?.label ??
      (/\.(?:style|mode|provider|defaultProvider|expression|verbosity|initiative|relationshipPace|emotionIntensity|period|proactiveMode|deepseekThinking)$/.test(
        path
      )
        ? formOptionLabel(value)
        : value)
    );
  return String(value);
}
const identity = (value: unknown) =>
  value && typeof value === "object"
    ? String(
        (value as { id?: string; level?: number }).id ??
          (value as { level?: number }).level ??
          (value as { minLevel?: number }).minLevel ??
          ""
      )
    : "";
const itemLabel = (value: unknown, index: number) => {
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>,
      name = item.label ?? item.name;
    if (typeof name === "string") return name;
    if (name && typeof name === "object")
      return String(
        (name as Record<string, string>)["zh-CN"] || `第 ${index + 1} 项`
      );
    if (item.level) return `第 ${item.level} 级`;
    if (item.minLevel) return `第 ${item.minLevel} 级起`;
  }
  return `第 ${index + 1} 项`;
};
function diff(
  before: unknown,
  after: unknown,
  path: string,
  beforePath: string,
  afterPath: string,
  published: ProductConfig,
  config: ProductConfig
): FieldChange[] {
  if (sameConfigValue(before, after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    if (Array.isArray(before) && Array.isArray(after)) {
      const oldKeys = before.map(identity),
        newKeys = after.map(identity);
      if (
        [...oldKeys, ...newKeys].every(Boolean) &&
        new Set(oldKeys).size === oldKeys.length &&
        new Set(newKeys).size === newKeys.length
      ) {
        const changes: FieldChange[] = [];
        if (
          !sameConfigValue(
            oldKeys.filter(key => newKeys.includes(key)),
            newKeys.filter(key => oldKeys.includes(key))
          )
        )
          changes.push({
            field: `${path} · 顺序`,
            before: before.map(itemLabel).join(" → "),
            after: after.map(itemLabel).join(" → "),
          });
        for (const key of Array.from(new Set([...oldKeys, ...newKeys]))) {
          const oldIndex = oldKeys.indexOf(key),
            newIndex = newKeys.indexOf(key);
          changes.push(
            ...diff(
              before[oldIndex],
              after[newIndex],
              `${path} · ${itemLabel(after[newIndex] ?? before[oldIndex], Math.max(oldIndex, newIndex))}`,
              `${beforePath}.${oldIndex}`,
              `${afterPath}.${newIndex}`,
              published,
              config
            )
          );
        }
        return changes;
      }
      return Array.from(
        { length: Math.max(before.length, after.length) },
        (_, i) => {
          const value = after[i] || before[i];
          return diff(
            before[i],
            after[i],
            `${path} · ${itemLabel(value, i)}`,
            `${beforePath}.${i}`,
            `${afterPath}.${i}`,
            published,
            config
          );
        }
      ).flat();
    }
    if (!Array.isArray(before) && !Array.isArray(after))
      return Array.from(
        new Set([...Object.keys(before), ...Object.keys(after)])
      ).flatMap(key =>
        diff(
          (before as Record<string, unknown>)[key],
          (after as Record<string, unknown>)[key],
          path ? `${path} · ${fieldLabel(key)}` : fieldLabel(key),
          `${beforePath}.${key}`,
          `${afterPath}.${key}`,
          published,
          config
        )
      );
  }
  return [
    {
      field: path,
      before: readable(before, beforePath, published),
      after: readable(after, afterPath, config),
    },
  ];
}
export function productPublicationReview(
  config: ProductConfig,
  published: ProductConfig,
  characters: readonly OfficialCharacter[]
) {
  const groups = sections
    .map(section => ({
      ...section,
      fields: diff(
        published[section.id],
        config[section.id],
        "",
        section.id,
        section.id,
        published,
        config
      ),
    }))
    .filter(section => section.fields.length > 0);
  const parsed = productConfigSchema.safeParse(config);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map(
        issue =>
          `${issue.path.map(part => fieldLabel(String(part))).join(" · ")}：${issue.message}`
      );
  for (const character of characters)
    for (const issue of Object.values(
      officialCharacterIssues(character, config.characters)
    ))
      errors.push(`${character.name}：${issue}`);
  return { groups, errors, changed: groups.length > 0 };
}
