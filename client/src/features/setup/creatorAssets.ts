/** 角色创建器的本地图片选项。 */
import { CREATOR_TEMPLATES } from "./creatorTemplates";
export const CREATOR_ASSET_VERSION = "studio-v2";
export type CreatorGender = "female" | "male";
export type CreatorStyle = "realistic" | "anime";
export type CreatorCategory =
  | "style"
  | "templates"
  | "ethnicity"
  | "hairstyle"
  | "bodytype"
  | "breast"
  | "butt";
export type CreatorOption = { id: string; imageUrl: string };
export type CreatorImageGroup = {
  gender: CreatorGender;
  style: CreatorStyle;
  category: CreatorCategory;
  options: CreatorOption[];
};

export const CREATOR_IMAGE_GROUPS: CreatorImageGroup[] = [
  {
    gender: "female",
    style: "anime",
    category: "bodytype",
    options: [
      {
        id: "athletic",
        imageUrl:
          "/character-options/creator/female/anime/bodytype/athletic.webp",
      },
      {
        id: "curvy",
        imageUrl: "/character-options/creator/female/anime/bodytype/curvy.webp",
      },
      {
        id: "muscular",
        imageUrl:
          "/character-options/creator/female/anime/bodytype/muscular.webp",
      },
      {
        id: "slim",
        imageUrl: "/character-options/creator/female/anime/bodytype/slim.webp",
      },
      {
        id: "voluptuous",
        imageUrl:
          "/character-options/creator/female/anime/bodytype/voluptuous.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "anime",
    category: "breast",
    options: [
      {
        id: "flat",
        imageUrl: "/character-options/creator/female/anime/breast/flat.webp",
      },
      {
        id: "large",
        imageUrl: "/character-options/creator/female/anime/breast/large.webp",
      },
      {
        id: "medium",
        imageUrl: "/character-options/creator/female/anime/breast/medium.webp",
      },
      {
        id: "small",
        imageUrl: "/character-options/creator/female/anime/breast/small.webp",
      },
      {
        id: "xl",
        imageUrl: "/character-options/creator/female/anime/breast/xl.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "anime",
    category: "butt",
    options: [
      {
        id: "athletic",
        imageUrl: "/character-options/creator/female/anime/butt/athletic.webp",
      },
      {
        id: "large",
        imageUrl: "/character-options/creator/female/anime/butt/large.webp",
      },
      {
        id: "medium",
        imageUrl: "/character-options/creator/female/anime/butt/medium.webp",
      },
      {
        id: "skinny",
        imageUrl: "/character-options/creator/female/anime/butt/skinny.webp",
      },
      {
        id: "small",
        imageUrl: "/character-options/creator/female/anime/butt/small.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "anime",
    category: "ethnicity",
    options: [
      {
        id: "angel",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/angel.webp",
      },
      {
        id: "coolintellectual",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/coolintellectual.webp",
      },
      {
        id: "demon",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/demon.webp",
      },
      {
        id: "elf",
        imageUrl: "/character-options/creator/female/anime/ethnicity/elf.webp",
      },
      {
        id: "matureelegant",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/matureelegant.webp",
      },
      {
        id: "newchinese",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/newchinese.webp",
      },
      {
        id: "purealluring",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/purealluring.webp",
      },
      {
        id: "spicybold",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/spicybold.webp",
      },
      {
        id: "sweethealing",
        imageUrl:
          "/character-options/creator/female/anime/ethnicity/sweethealing.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "anime",
    category: "hairstyle",
    options: [
      {
        id: "bangs",
        imageUrl:
          "/character-options/creator/female/anime/hairstyle/bangs.webp",
      },
      {
        id: "braided",
        imageUrl:
          "/character-options/creator/female/anime/hairstyle/braided.webp",
      },
      {
        id: "bun",
        imageUrl: "/character-options/creator/female/anime/hairstyle/bun.webp",
      },
      {
        id: "longstraight",
        imageUrl:
          "/character-options/creator/female/anime/hairstyle/longstraight.webp",
      },
      {
        id: "pixie",
        imageUrl:
          "/character-options/creator/female/anime/hairstyle/pixie.webp",
      },
      {
        id: "ponytail",
        imageUrl:
          "/character-options/creator/female/anime/hairstyle/ponytail.webp",
      },
      {
        id: "short",
        imageUrl:
          "/character-options/creator/female/anime/hairstyle/short.webp",
      },
      {
        id: "twobuns",
        imageUrl:
          "/character-options/creator/female/anime/hairstyle/twobuns.webp",
      },
      {
        id: "wavy",
        imageUrl: "/character-options/creator/female/anime/hairstyle/wavy.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "anime",
    category: "style",
    options: [
      {
        id: "anime-female",
        imageUrl: "/character-options/creator/style/anime-female.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "realistic",
    category: "bodytype",
    options: [
      {
        id: "athletic",
        imageUrl:
          "/character-options/creator/female/realistic/bodytype/athletic.webp",
      },
      {
        id: "curvy",
        imageUrl:
          "/character-options/creator/female/realistic/bodytype/curvy.webp",
      },
      {
        id: "muscular",
        imageUrl:
          "/character-options/creator/female/realistic/bodytype/muscular.webp",
      },
      {
        id: "slim",
        imageUrl:
          "/character-options/creator/female/realistic/bodytype/slim.webp",
      },
      {
        id: "voluptuous",
        imageUrl:
          "/character-options/creator/female/realistic/bodytype/voluptuous.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "realistic",
    category: "breast",
    options: [
      {
        id: "flat",
        imageUrl:
          "/character-options/creator/female/realistic/breast/flat.webp",
      },
      {
        id: "large",
        imageUrl:
          "/character-options/creator/female/realistic/breast/large.webp",
      },
      {
        id: "medium",
        imageUrl:
          "/character-options/creator/female/realistic/breast/medium.webp",
      },
      {
        id: "small",
        imageUrl:
          "/character-options/creator/female/realistic/breast/small.webp",
      },
      {
        id: "xl",
        imageUrl: "/character-options/creator/female/realistic/breast/xl.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "realistic",
    category: "butt",
    options: [
      {
        id: "athletic",
        imageUrl:
          "/character-options/creator/female/realistic/butt/athletic.webp",
      },
      {
        id: "large",
        imageUrl: "/character-options/creator/female/realistic/butt/large.webp",
      },
      {
        id: "medium",
        imageUrl:
          "/character-options/creator/female/realistic/butt/medium.webp",
      },
      {
        id: "skinny",
        imageUrl:
          "/character-options/creator/female/realistic/butt/skinny.webp",
      },
      {
        id: "small",
        imageUrl: "/character-options/creator/female/realistic/butt/small.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "realistic",
    category: "ethnicity",
    options: [
      {
        id: "angel",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/angel.webp",
      },
      {
        id: "coolintellectual",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/coolintellectual.webp",
      },
      {
        id: "demon",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/demon.webp",
      },
      {
        id: "elf",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/elf.webp",
      },
      {
        id: "matureelegant",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/matureelegant.webp",
      },
      {
        id: "newchinese",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/newchinese.webp",
      },
      {
        id: "purealluring",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/purealluring.webp",
      },
      {
        id: "spicybold",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/spicybold.webp",
      },
      {
        id: "sweethealing",
        imageUrl:
          "/character-options/creator/female/realistic/ethnicity/sweethealing.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "realistic",
    category: "hairstyle",
    options: [
      {
        id: "bangs",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/bangs.webp",
      },
      {
        id: "braided",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/braided.webp",
      },
      {
        id: "bun",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/bun.webp",
      },
      {
        id: "longstraight",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/longstraight.webp",
      },
      {
        id: "pixie",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/pixie.webp",
      },
      {
        id: "ponytail",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/ponytail.webp",
      },
      {
        id: "short",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/short.webp",
      },
      {
        id: "twobuns",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/twobuns.webp",
      },
      {
        id: "wavy",
        imageUrl:
          "/character-options/creator/female/realistic/hairstyle/wavy.webp",
      },
    ],
  },
  {
    gender: "female",
    style: "realistic",
    category: "style",
    options: [
      {
        id: "realistic-female",
        imageUrl: "/character-options/creator/style/realistic-female.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "anime",
    category: "bodytype",
    options: [
      {
        id: "athletic",
        imageUrl:
          "/character-options/creator/male/anime/bodytype/athletic.webp",
      },
      {
        id: "chubby",
        imageUrl: "/character-options/creator/male/anime/bodytype/chubby.webp",
      },
      {
        id: "dadbod",
        imageUrl: "/character-options/creator/male/anime/bodytype/dadbod.webp",
      },
      {
        id: "muscular",
        imageUrl:
          "/character-options/creator/male/anime/bodytype/muscular.webp",
      },
      {
        id: "slim",
        imageUrl: "/character-options/creator/male/anime/bodytype/slim.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "anime",
    category: "ethnicity",
    options: [
      {
        id: "cold",
        imageUrl: "/character-options/creator/male/anime/ethnicity/cold.webp",
      },
      {
        id: "demon",
        imageUrl: "/character-options/creator/male/anime/ethnicity/demon.webp",
      },
      {
        id: "elf",
        imageUrl: "/character-options/creator/male/anime/ethnicity/elf.webp",
      },
      {
        id: "gentle",
        imageUrl: "/character-options/creator/male/anime/ethnicity/gentle.webp",
      },
      {
        id: "refined",
        imageUrl:
          "/character-options/creator/male/anime/ethnicity/refined.webp",
      },
      {
        id: "sunny",
        imageUrl: "/character-options/creator/male/anime/ethnicity/sunny.webp",
      },
      {
        id: "wild",
        imageUrl: "/character-options/creator/male/anime/ethnicity/wild.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "anime",
    category: "hairstyle",
    options: [
      {
        id: "bald",
        imageUrl: "/character-options/creator/male/anime/hairstyle/bald.webp",
      },
      {
        id: "curly",
        imageUrl: "/character-options/creator/male/anime/hairstyle/curly.webp",
      },
      {
        id: "fade",
        imageUrl: "/character-options/creator/male/anime/hairstyle/fade.webp",
      },
      {
        id: "longstraight",
        imageUrl:
          "/character-options/creator/male/anime/hairstyle/longstraight.webp",
      },
      {
        id: "manbun",
        imageUrl: "/character-options/creator/male/anime/hairstyle/manbun.webp",
      },
      {
        id: "mullet",
        imageUrl: "/character-options/creator/male/anime/hairstyle/mullet.webp",
      },
      {
        id: "pompadour",
        imageUrl:
          "/character-options/creator/male/anime/hairstyle/pompadour.webp",
      },
      {
        id: "short",
        imageUrl: "/character-options/creator/male/anime/hairstyle/short.webp",
      },
      {
        id: "slickedback",
        imageUrl:
          "/character-options/creator/male/anime/hairstyle/slickedback.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "anime",
    category: "style",
    options: [
      {
        id: "anime-male",
        imageUrl: "/character-options/creator/style/anime-male.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "realistic",
    category: "bodytype",
    options: [
      {
        id: "athletic",
        imageUrl:
          "/character-options/creator/male/realistic/bodytype/athletic.webp",
      },
      {
        id: "chubby",
        imageUrl:
          "/character-options/creator/male/realistic/bodytype/chubby.webp",
      },
      {
        id: "dadbod",
        imageUrl:
          "/character-options/creator/male/realistic/bodytype/dadbod.webp",
      },
      {
        id: "muscular",
        imageUrl:
          "/character-options/creator/male/realistic/bodytype/muscular.webp",
      },
      {
        id: "slim",
        imageUrl:
          "/character-options/creator/male/realistic/bodytype/slim.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "realistic",
    category: "ethnicity",
    options: [
      {
        id: "cold",
        imageUrl:
          "/character-options/creator/male/realistic/ethnicity/cold.webp",
      },
      {
        id: "demon",
        imageUrl:
          "/character-options/creator/male/realistic/ethnicity/demon.webp",
      },
      {
        id: "elf",
        imageUrl:
          "/character-options/creator/male/realistic/ethnicity/elf.webp",
      },
      {
        id: "gentle",
        imageUrl:
          "/character-options/creator/male/realistic/ethnicity/gentle.webp",
      },
      {
        id: "refined",
        imageUrl:
          "/character-options/creator/male/realistic/ethnicity/refined.webp",
      },
      {
        id: "sunny",
        imageUrl:
          "/character-options/creator/male/realistic/ethnicity/sunny.webp",
      },
      {
        id: "wild",
        imageUrl:
          "/character-options/creator/male/realistic/ethnicity/wild.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "realistic",
    category: "hairstyle",
    options: [
      {
        id: "bald",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/bald.webp",
      },
      {
        id: "curly",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/curly.webp",
      },
      {
        id: "fade",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/fade.webp",
      },
      {
        id: "longstraight",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/longstraight.webp",
      },
      {
        id: "manbun",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/manbun.webp",
      },
      {
        id: "mullet",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/mullet.webp",
      },
      {
        id: "pompadour",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/pompadour.webp",
      },
      {
        id: "short",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/short.webp",
      },
      {
        id: "slickedback",
        imageUrl:
          "/character-options/creator/male/realistic/hairstyle/slickedback.webp",
      },
    ],
  },
  {
    gender: "male",
    style: "realistic",
    category: "style",
    options: [
      {
        id: "realistic-male",
        imageUrl: "/character-options/creator/style/realistic-male.webp",
      },
    ],
  },
  ...(["female", "male"] as const).flatMap(gender =>
    (["realistic", "anime"] as const).map(style => ({
      gender,
      style,
      category: "templates" as const,
      options: CREATOR_TEMPLATES.filter(
        template => template.gender === gender && template.style === style
      ).map(({ id, imageUrl }) => ({ id, imageUrl })),
    }))
  ),
];

export const CREATOR_COLORS = {
  skin: [
    {
      id: "fair",
      color: "rgb(254, 228, 195)",
    },
    {
      id: "light",
      color: "rgb(255, 219, 173)",
    },
    {
      id: "olive",
      color: "rgb(207, 150, 95)",
    },
    {
      id: "tan",
      color: "rgb(147, 95, 55)",
    },
    {
      id: "dark",
      color: "rgb(115, 63, 23)",
    },
    {
      id: "darker",
      color: "rgb(61, 34, 13)",
    },
  ],
  eyes: [
    {
      id: "black",
      color: "rgb(26, 26, 26)",
    },
    {
      id: "brown",
      color: "rgb(139, 69, 19)",
    },
    {
      id: "red",
      color: "rgb(239, 68, 68)",
    },
    {
      id: "gold",
      color: "rgb(234, 179, 8)",
    },
    {
      id: "green",
      color: "rgb(34, 197, 94)",
    },
    {
      id: "blue",
      color: "rgb(59, 130, 246)",
    },
    {
      id: "purple",
      color: "rgb(168, 85, 247)",
    },
    {
      id: "pink",
      color: "rgb(236, 72, 153)",
    },
    {
      id: "white",
      color: "rgb(228, 228, 231)",
    },
    {
      id: "silver",
      color: "rgb(156, 163, 175)",
    },
  ],
  hair: [
    {
      id: "black",
      color: "rgb(26, 26, 26)",
    },
    {
      id: "brunette",
      color: "rgb(139, 69, 19)",
    },
    {
      id: "red",
      color: "rgb(239, 68, 68)",
    },
    {
      id: "blonde",
      color: "rgb(234, 179, 8)",
    },
    {
      id: "green",
      color: "rgb(34, 197, 94)",
    },
    {
      id: "blue",
      color: "rgb(59, 130, 246)",
    },
    {
      id: "purple",
      color: "rgb(168, 85, 247)",
    },
    {
      id: "pink",
      color: "rgb(236, 72, 153)",
    },
    {
      id: "white",
      color: "rgb(228, 228, 231)",
    },
    {
      id: "silver",
      color: "rgb(156, 163, 175)",
    },
  ],
} as const;
