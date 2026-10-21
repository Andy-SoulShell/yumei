/** 官方角色和首页运营内容的校验、发布快照与本地化视图。 */
import { z } from "zod";
import { companionBehaviorSchema } from "./companionBehavior";
import { LOCALES, type Locale } from "./locales";

/** 稳定业务 ID；修改名称或人设时保留此 ID。 */
export const officialIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,99}$/);

/** 运营文案至少提供中文，缺少其他语言时回退中文。 */
export const contentTextSchema = z
  .partialRecord(z.enum(LOCALES), z.string().trim().min(1).max(6000))
  .refine(value => !!value["zh-CN"], "请提供简体中文文案");
export type ContentText = z.infer<typeof contentTextSchema>;

/** 仅接受站内角色资源或管理员上传的公开图片，不读取任意文件和远端地址。 */
export const officialImageSchema = z
  .string()
  .regex(
    /^\/(?:characters\/[a-zA-Z0-9_-]+|files\/official-[a-zA-Z0-9_-]+)\.(?:jpg|jpeg|png|webp|gif)$/
  );

const internalLinkSchema = z
  .string()
  .max(500)
  .refine(value => {
    try {
      const decoded = decodeURIComponent(value);
      return (
        decoded.startsWith("/") &&
        !decoded.startsWith("//") &&
        !/[\\\s]/.test(decoded) &&
        !Array.from(decoded).some(char => char.charCodeAt(0) < 32)
      );
    } catch {
      return false;
    }
  }, "链接必须是本站路径");

/** 官方角色完整草稿；listed=false 可供默认角色使用而不进入公开列表。 */
export const officialCharacterSchema = z
  .object({
    id: officialIdSchema,
    name: z.string().trim().min(1).max(100),
    age: z.number().int().min(18).max(120),
    style: z.enum(["realistic", "anime"]),
    label: contentTextSchema,
    tagline: contentTextSchema,
    personality: z.string().trim().min(1).max(2000),
    appearance: z.string().trim().min(1).max(2000),
    interests: z.string().max(1000),
    imageUrl: officialImageSchema,
    behavior: companionBehaviorSchema,
    listed: z.boolean(),
    sortOrder: z.number().int().min(0).max(100000),
  })
  .strict();
export type OfficialCharacter = z.infer<typeof officialCharacterSchema>;

/** 首页轮播和 FAQ 以数组顺序展示，空数组表示关闭对应模块。 */
export const homepageSchema = z
  .object({
    defaultPresetId: officialIdSchema,
    featuredIds: z.array(officialIdSchema).max(50),
    pageSize: z.number().int().min(1).max(100),
    homeCharacterLimit: z.number().int().min(0).max(100),
    carouselIntervalMs: z.number().int().min(3000).max(60000),
    slides: z
      .array(
        z
          .object({
            id: officialIdSchema,
            title: contentTextSchema,
            highlight: contentTextSchema,
            action: contentTextSchema,
            href: internalLinkSchema,
            images: z.array(officialImageSchema).min(1).max(3),
          })
          .strict()
      )
      .max(20),
    faqs: z
      .array(
        z
          .object({
            id: officialIdSchema,
            question: contentTextSchema,
            answer: contentTextSchema,
          })
          .strict()
      )
      .max(50),
  })
  .strict();
export type Homepage = z.infer<typeof homepageSchema>;

/** 同一次发布的角色和首页快照，避免读取到部分更新的引用。 */
export const discoverySnapshotSchema = z
  .object({
    characters: z.array(officialCharacterSchema).min(1).max(2000),
    home: homepageSchema,
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const unique = (ids: string[], path: (string | number)[]) => {
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: "custom", path, message: "ID 不能重复" });
    };
    unique(
      snapshot.characters.map(item => item.id),
      ["characters"]
    );
    unique(snapshot.home.featuredIds, ["home", "featuredIds"]);
    unique(
      snapshot.home.slides.map(item => item.id),
      ["home", "slides"]
    );
    unique(
      snapshot.home.faqs.map(item => item.id),
      ["home", "faqs"]
    );
    if (
      !snapshot.characters.some(
        item => item.id === snapshot.home.defaultPresetId
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["home", "defaultPresetId"],
        message: "默认角色必须存在",
      });
    for (const id of snapshot.home.featuredIds) {
      if (!snapshot.characters.some(item => item.id === id && item.listed))
        ctx.addIssue({
          code: "custom",
          path: ["home", "featuredIds"],
          message: `精选角色 ${id} 未上架`,
        });
    }
  });
export type DiscoverySnapshot = z.infer<typeof discoverySnapshotSchema>;

/** 当前语言的角色展示资料；人设和用户数据保持原文。 */
export type CharacterPreset = Omit<OfficialCharacter, "label" | "tagline"> & {
  label: string;
  tagline: string;
};

/** 选择运营文案的当前语言，缺失时使用中文。 */
export function contentText(value: ContentText, locale: Locale): string {
  return value[locale] ?? value["zh-CN"] ?? "";
}

/** 将已发布数据转换为界面文案，动态新增 ID 无需静态翻译键映射。 */
export function localizeDiscovery(snapshot: DiscoverySnapshot, locale: Locale) {
  return {
    characters: snapshot.characters.map((item): CharacterPreset => ({
      ...item,
      label: contentText(item.label, locale),
      tagline: contentText(item.tagline, locale),
    })),
    home: {
      ...snapshot.home,
      slides: snapshot.home.slides.map(item => ({
        ...item,
        title: contentText(item.title, locale),
        highlight: contentText(item.highlight, locale),
        action: contentText(item.action, locale),
      })),
      faqs: snapshot.home.faqs.map(item => ({
        ...item,
        question: contentText(item.question, locale),
        answer: contentText(item.answer, locale),
      })),
    },
  };
}
