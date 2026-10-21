/** 首次初始化官方目录和首页；已有运营修改不会被启动或重复初始化覆盖。 */
import { CHARACTER_PRESETS } from "./characterPresets";
import { DEFAULT_GIRLFRIEND } from "./defaultGirlfriend";
import { getPresetBehavior } from "./presetBehavior";
import { LANGUAGES, LOCALES } from "../../shared/locales";
import {
  discoverySnapshotSchema,
  type ContentText,
} from "../../shared/discovery";
import type { StaticMessageKey } from "../../shared/i18n";

function text(key: StaticMessageKey): ContentText {
  const [namespace, id] = key.split(":");
  return Object.fromEntries(
    LOCALES.map(locale => [
      locale,
      (
        LANGUAGES[locale].messages as unknown as Record<
          string,
          Record<string, string>
        >
      )[namespace][id],
    ])
  );
}

/** 保留原有二十个目录角色、默认 YUMEI、精选顺序及全部已支持语言。 */
export function initialDiscovery() {
  return discoverySnapshotSchema.parse({
    characters: [
      ...CHARACTER_PRESETS.map((preset, sortOrder) => ({
        ...preset,
        label: text(
          `characters:presets.${preset.id}.label` as StaticMessageKey
        ),
        tagline: text(
          `characters:presets.${preset.id}.tagline` as StaticMessageKey
        ),
        behavior: getPresetBehavior(preset.id),
        listed: true,
        sortOrder,
      })),
      {
        id: "yumei",
        name: DEFAULT_GIRLFRIEND.name,
        personality: DEFAULT_GIRLFRIEND.personality,
        appearance: DEFAULT_GIRLFRIEND.appearance,
        interests: DEFAULT_GIRLFRIEND.interests,
        age: 22,
        style: "anime",
        imageUrl: DEFAULT_GIRLFRIEND.referenceImageUrl,
        label: { "zh-CN": "YUMEI" },
        tagline: { "zh-CN": "你的 AI 陪伴角色" },
        behavior: getPresetBehavior(""),
        listed: false,
        sortOrder: 20,
      },
    ],
    home: {
      defaultPresetId: "yumei",
      pageSize: 20,
      homeCharacterLimit: 20,
      carouselIntervalMs: 6500,
      featuredIds: [
        "xiaotao",
        "rin",
        "linxi",
        "zhixia",
        "momoka",
        "hikari",
        "kaede",
        "shiori",
        "shiyu",
        "sakura",
      ],
      slides: [
        {
          id: "explore",
          title: text("explore:heroTitle"),
          highlight: text("explore:heroHighlight"),
          action: text("explore:heroAction"),
          href: "/explore",
          images: [
            "/characters/char_mature.jpg",
            "/characters/char_cute.jpg",
            "/characters/char_anime_cute.jpg",
          ],
        },
        {
          id: "create",
          title: text("landing:createTitle"),
          highlight: text("landing:createHighlight"),
          action: text("explore:heroSecondary"),
          href: "/setup",
          images: [
            "/characters/linxi.jpg",
            "/characters/hikari.jpg",
            "/characters/shiyu.jpg",
          ],
        },
        {
          id: "photos",
          title: text("landing:photosTitle"),
          highlight: text("landing:photosHighlight"),
          action: text("landing:photosAction"),
          href: "/generate",
          images: [
            "/characters/zhixia.jpg",
            "/characters/kaede.jpg",
            "/characters/jiangyue.jpg",
          ],
        },
      ],
      faqs: ["what", "free", "memory", "create", "devices"].map(id => ({
        id,
        question: text(`landing:faq.${id}.question` as StaticMessageKey),
        answer: text(`landing:faq.${id}.answer` as StaticMessageKey),
      })),
    },
  });
}
