/** 将任务拆成有名称、有当前内容的对象；编辑只修改明确选中的路径。 */
import type { ProductConfig } from "@shared/productConfig";
import { contentText } from "@shared/discovery";
import { fieldLabel, semanticFieldLabel, type FormSchema } from "./ConfigForm";
import {
  getSetting,
  settingsPanels,
  settingSchema,
  type SettingsSection,
} from "./settingsModel";
import { taskFieldGroups } from "./settingsRelations";
import { defaultUnit, displayedNumber, valueUnits } from "./fieldPresentation";

export type TaskEntry = {
  id: string;
  title: string;
  description: string;
  fields: string[];
  kind?: "reward" | "capacity";
  key?: string;
  level?: number;
  advanced?: boolean;
  arrayPath?: string;
  index?: number;
};

const names: Record<string, string> = {
  warm: "温柔体贴",
  direct: "坦率直接",
  playful: "活泼俏皮",
  reserved: "含蓄克制",
  concise: "简短回复",
  balanced: "适中",
  detailed: "详细回复",
  quiet: "安静陪伴",
  lively: "主动热情",
  gentle: "温和表达",
  expressive: "丰富表达",
  gradual: "循序渐进",
  natural: "自然相处",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  fal: "fal",
  elevenlabs: "ElevenLabs",
  fishaudio: "Fish Audio",
};
export const taskEntryName = (key: string) => names[key] ?? fieldLabel(key);
export function taskCollections(section: SettingsSection, task: string) {
  if (section === "prompts" && task === "behavior")
    return [
      "chat.relationshipStages.gradual",
      "chat.relationshipStages.natural",
    ];
  if (section === "characters" && task === "behavior")
    return ["defaultBehavior.examples"];
  return [];
}

export function taskEntries(
  section: SettingsSection,
  task: string,
  config: ProductConfig,
  schema?: FormSchema
): TaskEntry[] | undefined {
  const panel = settingsPanels[section].find(item => item.id === task);
  if (
    !panel ||
    panel.collection ||
    panel.workflow ||
    panel.videoWorkflow ||
    (section === "billing" && task === "subscription") ||
    (section === "proactive" && ["schedule", "copy"].includes(task))
  )
    return;
  const current = config[section];
  if (section === "emotion" && task === "moods")
    return Object.entries(config.emotion.moods).map(([key, mood]) => ({
      id: `moods.${key}`,
      title: `${mood.emoji} ${contentText(mood.label, "zh-CN")}`,
      description: "用户看到的心情名称、表情与配色。",
      fields: [`moods.${key}`],
    }));
  if (section === "intimacy" && task === "rewards")
    return Object.keys(config.intimacy.rules).map(key => ({
      id: `rules.${key}`,
      title: taskEntryName(key),
      description: "这次互动的积分、奖励条件与冷却。",
      fields: ["rules"],
      kind: "reward",
      key,
    }));
  const groups = taskFieldGroups[section]?.[task] ?? [
    {
      title: panel.title,
      description: panel.description,
      fields: panel.fields,
    },
  ];
  const entries: TaskEntry[] = [];
  const add = (
    fields: string[],
    title: string,
    description: string,
    advanced = false
  ) => {
    entries.push({
      id: fields.join("+"),
      fields,
      title,
      description,
      advanced,
    });
  };
  const visitPrompt = (path: string, prefix = "") => {
    const value = getSetting(current, path);
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (Array.isArray(value)) {
          const stage = item as { minLevel: number };
          entries.push({
            id: `${path}.${key}`,
            fields: [`${path}.${key}`],
            title: `${prefix} · 第 ${stage.minLevel} 级起`,
            description: "只调整这个关系阶段，保留其他阶段的内容与门槛。",
            arrayPath: path,
            index: Number(key),
          });
        } else
          visitPrompt(
            `${path}.${key}`,
            [
              prefix,
              names[key] ?? semanticFieldLabel(`${section}.${path}.${key}`),
            ]
              .filter(Boolean)
              .join(" · ")
          );
      }
    } else
      add(
        [path],
        prefix || taskEntryName(path.split(".").at(-1)!),
        "单独维护这份指令，必需变量继续校验。"
      );
  };
  for (const group of groups) {
    if (
      section === "characters" &&
      task === "behavior" &&
      group.fields.includes("defaultBehavior.examples")
    ) {
      config.characters.defaultBehavior.examples.forEach((_, index) =>
        entries.push({
          id: `defaultBehavior.examples.${index}`,
          title: `示例对话 ${index + 1}`,
          description: "一问一答示范这位角色的表达。",
          fields: [`defaultBehavior.examples.${index}`],
          arrayPath: "defaultBehavior.examples",
          index,
        })
      );
      continue;
    }
    if (section === "prompts" && task !== "context") {
      for (const field of group.fields)
        visitPrompt(field, taskEntryName(field.split(".").at(-1)!));
      continue;
    }
    if (section === "site" && task === "links") {
      for (const field of group.fields)
        add(
          [field],
          taskEntryName(field.split(".").at(-1)!),
          group.description
        );
      continue;
    }
    if (
      section === "memory" &&
      task === "capacity" &&
      group.fields.includes("levelRules")
    ) {
      for (const level of config.intimacy.levels)
        entries.push({
          id: `level.${level.level}`,
          title: `${level.level} 级 · ${contentText(level.name, "zh-CN")}`,
          description: "查看这个等级实际继承的容量，并按需单独设置。",
          fields: ["levelRules"],
          kind: "capacity",
          level: level.level,
        });
      continue;
    }
    if (
      section === "memory" &&
      task === "capacity" &&
      group.fields.includes("categories")
    ) {
      // 分类的结构与标识由契约维护；每次只编辑一类的展示文案。
      config.memory.categories.forEach((category, index) =>
        add(
          [`categories.${index}.label`],
          contentText(category.label, "zh-CN"),
          "调整这一个固定分类的展示名称。"
        )
      );
      add(
        group.fields.filter(field => field !== "categories"),
        "单条记忆的长度",
        group.description,
        group.advanced
      );
      continue;
    }
    // 单个未分组的大对象按下一层职责呈现；短小且互相约束的字段保留为同一任务。
    const only = group.fields.length === 1 ? group.fields[0] : undefined;
    const value = only ? getSetting(current, only) : undefined;
    const contract = only ? settingSchema(schema, only) : undefined;
    if (
      !taskFieldGroups[section]?.[task] &&
      only &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !contract?.propertyNames?.enum?.includes("zh-CN") &&
      Object.keys(value).length > 5
    ) {
      for (const key of Object.keys(value))
        add([`${only}.${key}`], taskEntryName(key), group.description);
    } else add(group.fields, group.title, group.description, group.advanced);
  }
  return entries;
}

/** 目录只展示草稿内容，不读取用户数据，也不调用外部服务。 */
export function taskEntrySummary(
  entry: TaskEntry,
  section: SettingsSection,
  config: ProductConfig
): string {
  if (entry.kind === "capacity") {
    const rule = [...config.memory.levelRules]
      .reverse()
      .find(item => item.minLevel <= entry.level!)!;
    return `可记住 ${rule.capacity} 条 · 每次召回 ${rule.recallCount} 条`;
  }
  if (entry.kind === "reward") {
    const rule =
      config.intimacy.rules[
        entry.key as keyof ProductConfig["intimacy"]["rules"]
      ];
    return `${rule.enabled ? "已启用" : "已停用"} · 基础 ${rule.basePoints} 分 · 额外 ${rule.bonusPoints} 分`;
  }
  const value = getSetting(config[section], entry.fields[0]);
  if (typeof value === "string") return value || "暂未填写";
  if (typeof value === "boolean") return value ? "已开启" : "已关闭";
  if (value && typeof value === "object") {
    if ("zh-CN" in value)
      return contentText(value as Record<string, string>, "zh-CN");
    if ("instruction" in value) return String(value.instruction);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("user" in value)
      return `用户：${value.user}\n角色：${"assistant" in value ? value.assistant : ""}`;
  }
  const lines: string[] = [];
  const describe = (value: unknown, path: string) => {
    const label = semanticFieldLabel(`${section}.${path}`);
    if (typeof value === "number") {
      const unit = defaultUnit(
        `${section}.${path}`,
        value,
        valueUnits(`${section}.${path}`)
      );
      lines.push(
        `${label}：${displayedNumber(value, unit.factor)} ${unit.label}`
      );
    } else if (typeof value === "boolean")
      lines.push(`${label}：${value ? "开启" : "关闭"}`);
    else if (typeof value === "string")
      lines.push(`${label}：${taskEntryName(value)}`);
    else if (value === null) lines.push(`${label}：使用默认值`);
    else if (Array.isArray(value)) lines.push(`${label}：${value.join("、")}`);
    else if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value))
        describe(item, `${path}.${key}`);
  };
  for (const field of entry.fields)
    describe(getSetting(config[section], field), field);
  return lines.slice(0, 3).join("\n") || entry.description;
}
