import type { Translator } from "@shared/i18n";
import { enCreator } from "@shared/locales/creator";
import {
  CREATOR_ASSET_VERSION,
  CREATOR_IMAGE_GROUPS,
  type CreatorCategory,
  type CreatorGender,
  type CreatorStyle,
} from "./creatorAssets";

export type CreatorSelection = {
  gender: CreatorGender;
  style: CreatorStyle;
  age: number;
  options: Partial<Record<CreatorCategory | "skin" | "eyes" | "hair", string>>;
};

/** 用稳定标识本地化图片与颜色标签。 */
export function creatorLabel(id: string, t: Translator) {
  return id in enCreator ? t(`creator:${id as keyof typeof enCreator}`) : id;
}

export function creatorOptions(
  gender: CreatorGender,
  style: CreatorStyle,
  category: CreatorCategory
) {
  return (
    CREATOR_IMAGE_GROUPS.find(
      group =>
        group.gender === gender &&
        group.style === style &&
        group.category === category
    )?.options ?? []
  ).map(option => ({
    ...option,
    imageUrl: `${option.imageUrl}?v=${CREATOR_ASSET_VERSION}`,
  }));
}

/** 将偏好标签转为生成形象使用的文字描述。 */
export function describeCreator(selection: CreatorSelection, t: Translator) {
  const descriptions = [
    t(
      selection.style === "anime" ? "characters:anime" : "characters:realistic"
    ),
    `${selection.age} · ${t("creator:adult")} · ${t(`creator:${selection.gender}`)}`,
  ];
  for (const category of [
    "templates",
    "ethnicity",
    "skin",
    "eyes",
    "hair",
    "hairstyle",
    "bodytype",
    "breast",
    "butt",
  ] as const) {
    if (
      selection.gender === "male" &&
      (category === "breast" || category === "butt")
    )
      continue;
    const value = selection.options[category];
    if (value)
      descriptions.push(
        `${t(`creator:${category === "templates" ? "templateStep" : category}`)}: ${creatorLabel(value, t)}`
      );
  }
  return descriptions.join("; ");
}

/** 分支切换清除不再适用的选项，保留成年年龄。 */
export function changeCreatorBranch(
  selection: CreatorSelection,
  gender: CreatorGender,
  style: CreatorStyle
): CreatorSelection {
  return { gender, style, age: selection.age, options: {} };
}
