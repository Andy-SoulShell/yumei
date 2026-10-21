/** 对比完整业务快照，避免从某一分区发布时遗漏其他已保存修改。 */
import { productConfigSchema, type ProductConfig } from "@shared/productConfig";
import type { OfficialCharacter } from "@shared/discovery";
import { fieldLabel } from "./ConfigForm";
import { sections } from "./managementModel";
import { sameConfigValue } from "./editorState";
import { officialCharacterIssues, type FieldChange } from "./officialEditor";
function readable(value: unknown): string {
  if (value === undefined) return "未设置";
  if (value === null) return "不限量 / 未设置";
  if (value === "") return "留空";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (Array.isArray(value))
    return value.length ? value.map(readable).join("；") : "无";
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${fieldLabel(key)}：${readable(item)}`)
      .join("；");
  return String(value);
}
function diff(before: unknown, after: unknown, path: string): FieldChange[] {
  if (sameConfigValue(before, after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    if (Array.isArray(before) && Array.isArray(after))
      return Array.from(
        { length: Math.max(before.length, after.length) },
        (_, i) => {
          const value = after[i] || before[i];
          const name =
            value && typeof value === "object"
              ? value.name || value.id
              : undefined;
          return diff(
            before[i],
            after[i],
            `${path} · ${typeof name === "string" ? name : `第 ${i + 1} 项`}`
          );
        }
      ).flat();
    if (!Array.isArray(before) && !Array.isArray(after))
      return Array.from(
        new Set([...Object.keys(before), ...Object.keys(after)])
      ).flatMap(key =>
        diff(
          (before as Record<string, unknown>)[key],
          (after as Record<string, unknown>)[key],
          path ? `${path} · ${fieldLabel(key)}` : fieldLabel(key)
        )
      );
  }
  return [{ field: path, before: readable(before), after: readable(after) }];
}
export function productPublicationReview(
  config: ProductConfig,
  published: ProductConfig,
  characters: readonly OfficialCharacter[]
) {
  const groups = sections
    .map(section => ({
      ...section,
      fields: diff(published[section.id], config[section.id], ""),
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
