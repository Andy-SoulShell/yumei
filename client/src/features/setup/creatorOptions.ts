import type { Translator } from "@shared/i18n";
import { enCreator } from "@shared/locales/creator";
import {
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
  );
}

/** 将视觉选项落到现有外貌字段，保留现有创建接口。 */
export function describeCreator(selection: CreatorSelection, t: Translator) {
  const descriptions = [
    t(
      selection.style === "anime" ? "characters:anime" : "characters:realistic"
    ),
    `${selection.age} · ${t("creator:adult")} · ${t(`creator:${selection.gender}`)}`,
  ];
  for (const category of [
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
        `${t(`creator:${category}`)}: ${creatorLabel(value, t)}`
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

const REFERENCE_URLS = new Set(
  CREATOR_IMAGE_GROUPS.flatMap(group =>
    group.options.map(option => option.imageUrl)
  )
);

/** 选项图与上传照片走相同的参考图保存流程。 */
export async function loadCreatorReference(url: string): Promise<File> {
  if (!REFERENCE_URLS.has(url)) throw new Error("Unknown reference image");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Reference image unavailable");
  const blob = await response.blob();
  if (
    blob.type !== "image/webp" ||
    blob.size === 0 ||
    blob.size > 10 * 1024 * 1024
  ) {
    throw new Error("Invalid reference image");
  }
  return new File([blob], "companion-reference.webp", { type: "image/webp" });
}

export function referenceBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Reference image could not be read"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}
