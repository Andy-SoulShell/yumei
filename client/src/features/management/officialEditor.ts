/** 官方角色编辑与发布确认使用相同的候选值、字段校验和变更比较。 */
import {
  officialCharacterSchema,
  discoverySnapshotSchema,
  type OfficialCharacter,
  type DiscoverySnapshot,
} from "@shared/discovery";
import type { ProductConfig } from "@shared/productConfig";
import { sameConfigValue } from "./editorState";

export type CharacterRules = ProductConfig["characters"];
export type OfficialDraft = {
  home: DiscoverySnapshot["home"];
  characters: { data: OfficialCharacter; archived: boolean }[];
  published: DiscoverySnapshot;
};
export const officialFieldNames: Record<string, string> = {
  id: "角色标识",
  name: "名字",
  age: "年龄",
  style: "画面风格",
  label: "身份标签",
  tagline: "角色介绍",
  personality: "人物设定",
  appearance: "外貌说明",
  interests: "兴趣",
  imageUrl: "封面图片",
  behavior: "相处方式",
  userNickname: "对用户的称呼",
  examples: "示例对话",
  user: "用户示例",
  assistant: "角色示例",
  expression: "表达方式",
  verbosity: "回复长度",
  initiative: "主动程度",
  relationshipPace: "关系节奏",
  emotionIntensity: "情感表达",
  listed: "探索页展示",
  sortOrder: "排序",
  home: "首页",
  defaultPresetId: "默认角色",
  featuredIds: "精选角色",
  pageSize: "每页数量",
  homeCharacterLimit: "首页角色数量",
  carouselIntervalMs: "轮播间隔",
  slides: "轮播",
  faqs: "常见问题",
  title: "标题",
  highlight: "强调文字",
  action: "按钮文案",
  href: "链接",
  images: "图片",
  question: "问题",
  answer: "回答",
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};
export function fieldName(path: string) {
  return path
    .split(".")
    .map(part =>
      /^\d+$/.test(part)
        ? `第 ${Number(part) + 1} 项`
        : officialFieldNames[part] || part
    )
    .join(" · ");
}

/** 可选文案留空时的默认内容也直接用于预览，保存不会产生另一套展示值。 */
export function prepareOfficialCharacter(
  value: OfficialCharacter
): OfficialCharacter {
  return {
    ...value,
    label: {
      ...value.label,
      "zh-CN": value.label["zh-CN"]?.trim() || "AI 伙伴",
    },
    tagline: {
      ...value.tagline,
      "zh-CN":
        value.tagline["zh-CN"]?.trim() ||
        value.personality.trim().slice(0, 100) ||
        "期待与你相识。",
    },
    appearance:
      value.appearance.trim() ||
      `成年${value.style === "anime" ? "动漫" : "写实"}角色，外貌与服装以参考图片为准。`,
  };
}
export function createOfficialCharacter(
  template: OfficialCharacter,
  rules: CharacterRules,
  sortOrder: number
): OfficialCharacter {
  return {
    id: `character-${crypto.randomUUID().slice(0, 8)}`,
    name: "",
    age: 18,
    style: template.style,
    imageUrl: template.imageUrl,
    label: { "zh-CN": "" },
    tagline: { "zh-CN": "" },
    personality: "",
    appearance: "",
    interests: "",
    listed: true,
    sortOrder,
    behavior: structuredClone(rules.defaultBehavior),
  };
}
export function officialCharacterIssues(
  value: OfficialCharacter,
  rules: CharacterRules
) {
  const issues: Record<string, string> = {};
  const parsed = officialCharacterSchema.safeParse(value);
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      issues[path] =
        path === "age"
          ? "年龄须为 18–120 岁的整数"
          : path === "imageUrl"
            ? "请选择站内封面或上传图片"
            : `${fieldName(path)}填写不完整或超出允许范围`;
    }
  for (const key of [
    "name",
    "personality",
    "appearance",
    "interests",
  ] as const) {
    const limit = Math.min(
      rules.limits[key],
      key === "name" ? 100 : key === "interests" ? 1000 : 2000
    );
    if (value[key].length > limit)
      issues[key] =
        `${officialFieldNames[key]}最多 ${limit} 字，当前 ${value[key].length} 字`;
    else if (key !== "interests" && !value[key].trim())
      issues[key] = `请填写${officialFieldNames[key]}`;
  }
  const behavior = value.behavior;
  if (behavior.userNickname.length > rules.limits.nickname)
    issues["behavior.userNickname"] =
      `称呼最多 ${rules.limits.nickname} 字，当前 ${behavior.userNickname.length} 字`;
  if (behavior.examples.length > rules.limits.exampleCount)
    issues["behavior.examples"] =
      `示例对话最多 ${rules.limits.exampleCount} 组`;
  behavior.examples.forEach((example, index) => {
    for (const key of ["user", "assistant"] as const) {
      if (example[key].length > rules.limits.exampleLength)
        issues[`behavior.examples.${index}.${key}`] =
          `${fieldName(`behavior.examples.${index}.${key}`)}最多 ${rules.limits.exampleLength} 字`;
    }
  });
  return issues;
}

export type FieldChange = { field: string; before: string; after: string };
function display(value: unknown): string {
  if (value === undefined || value === null || value === "") return "未填写";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (typeof value === "string")
    return (
      ({ anime: "动漫", realistic: "写实" } as Record<string, string>)[value] ||
      value
    );
  if (Array.isArray(value))
    return value.length ? value.map(display).join("、") : "无";
  if (typeof value === "object")
    return Object.entries(value)
      .map(
        ([key, item]) => `${officialFieldNames[key] || key}：${display(item)}`
      )
      .join("；");
  return String(value);
}
function changes(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix = ""
): FieldChange[] {
  return Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)])
  ).flatMap(key => {
    const a = before[key],
      b = after[key],
      path = prefix ? `${prefix}.${key}` : key;
    if (sameConfigValue(a, b)) return [];
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    )
      return changes(
        a as Record<string, unknown>,
        b as Record<string, unknown>,
        path
      );
    return [{ field: fieldName(path), before: display(a), after: display(b) }];
  });
}
export function discoveryPublicationReview(
  draft: OfficialDraft,
  rules: CharacterRules
) {
  const active = draft.characters
    .filter(item => !item.archived)
    .map(item => item.data);
  const items: {
    id: string;
    name: string;
    kind: "新增" | "修改" | "下架";
    fields: FieldChange[];
  }[] = [];
  const errors: string[] = [];
  for (const character of active) {
    const previous = draft.published.characters.find(
      item => item.id === character.id
    );
    const fields = changes(previous || {}, character).filter(
      change => change.field !== "角色标识"
    );
    if (fields.length)
      items.push({
        id: character.id,
        name: character.name,
        kind: previous ? "修改" : "新增",
        fields,
      });
    for (const error of Object.values(
      officialCharacterIssues(character, rules)
    ))
      errors.push(`${character.name}：${error}`);
  }
  for (const previous of draft.published.characters) {
    if (!active.some(item => item.id === previous.id))
      items.push({
        id: previous.id,
        name: previous.name,
        kind: "下架",
        fields: [],
      });
  }
  const snapshot = discoverySnapshotSchema.safeParse({
    characters: active,
    home: draft.home,
  });
  if (!snapshot.success)
    for (const issue of snapshot.error.issues) {
      const error =
        issue.path[0] === "home" && issue.path[1] === "defaultPresetId"
          ? "首页默认角色已归档，请先在首页设置更换默认角色。"
          : issue.path[0] === "home" && issue.path[1] === "featuredIds"
            ? "首页精选包含未公开或已归档角色，请先调整首页精选。"
            : `${fieldName(issue.path.join("."))}：${issue.message}`;
      if (!errors.includes(error)) errors.push(error);
    }
  const namedHome = (
    home: DiscoverySnapshot["home"],
    characters: OfficialCharacter[]
  ) => ({
    ...home,
    defaultPresetId:
      characters.find(item => item.id === home.defaultPresetId)?.name ||
      home.defaultPresetId,
    featuredIds: home.featuredIds.map(
      id => characters.find(item => item.id === id)?.name || id
    ),
  });
  const beforeHome = namedHome(
      draft.published.home,
      draft.published.characters
    ),
    afterHome = namedHome(draft.home, active);
  const basics = (home: DiscoverySnapshot["home"]) =>
    Object.fromEntries(
      Object.entries(home).filter(([key]) => key !== "slides" && key !== "faqs")
    );
  const home = changes(basics(draft.published.home), basics(draft.home)).map(
    change => {
      const key =
        change.field === "默认角色"
          ? "defaultPresetId"
          : change.field === "精选角色"
            ? "featuredIds"
            : null;
      return key
        ? {
            ...change,
            before: display(beforeHome[key]),
            after: display(afterHome[key]),
          }
        : change;
    }
  );
  for (const key of ["slides", "faqs"] as const) {
    const before = draft.published.home[key],
      after = draft.home[key],
      label = key === "slides" ? "轮播" : "常见问题";
    const title = (item: (typeof before)[number]) =>
      (
        ("question" in item ? item.question : item.title)["zh-CN"] ||
        "未命名条目"
      ).slice(0, 32);
    const copy = (item: (typeof before)[number]) =>
      Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id"));
    const oldOrder = before
        .filter(item => after.some(next => next.id === item.id))
        .map(item => item.id),
      newOrder = after
        .filter(item => before.some(old => old.id === item.id))
        .map(item => item.id);
    if (!sameConfigValue(oldOrder, newOrder))
      home.push({
        field: `${label} · 展示顺序`,
        before: before.map(title).join(" → "),
        after: after.map(title).join(" → "),
      });
    for (const item of after) {
      const previous = before.find(old => old.id === item.id);
      if (!previous)
        home.push({
          field: `${label} · 新增「${title(item)}」`,
          before: "无",
          after: display(copy(item)),
        });
      else
        home.push(
          ...changes(copy(previous), copy(item)).map(change => ({
            ...change,
            field: `${label} · ${title(item)} · ${change.field}`,
          }))
        );
    }
    for (const previous of before)
      if (!after.some(item => item.id === previous.id))
        home.push({
          field: `${label} · 移除「${title(previous)}」`,
          before: display(copy(previous)),
          after: "无",
        });
  }
  const homeReferences = items
    .filter(item =>
      [
        draft.home.defaultPresetId,
        ...draft.home.featuredIds,
        draft.published.home.defaultPresetId,
        ...draft.published.home.featuredIds,
      ].includes(item.id)
    )
    .map(item => item.name);
  return {
    items,
    home,
    homeReferences,
    errors,
    changed: items.length > 0 || home.length > 0,
  };
}
