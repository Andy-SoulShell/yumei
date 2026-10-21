/** 自拍姿势定义及基于亲密度的解锁查询。 */

/** 自拍姿势的稳定标识、展示文案、提示词片段和最低解锁等级。 */

export interface SelfiePose {
  id: string;
  label: string;
  emoji: string;
  /** 使用该姿势所需的最低亲密度等级，范围为 1 至 10。 */
  minLevel: number;
  /** 输入框为空时使用的英文场景片段。 */
  promptFragment: string;
  /** 空输入时的相册构图标签，auto 使用通用直拍标签，不决定实际画面。 */
  mode: "mirror" | "direct" | "auto";
}

/** 按解锁阶段排列的姿势列表，服务端仍需校验实际权限。 */
export const SELFIE_POSES: SelfiePose[] = [
  {
    id: "casual",
    label: "随手一拍",
    emoji: "🤳",
    minLevel: 1,
    promptFragment: "a casual relaxed selfie, natural genuine smile",
    mode: "auto",
  },
  {
    id: "sweet_smile",
    label: "甜甜微笑",
    emoji: "😊",
    minLevel: 1,
    promptFragment: "a bright sweet smile, cheerful sunny mood, close-up",
    mode: "direct",
  },
  {
    id: "aegyo",
    label: "撒娇",
    emoji: "🥺",
    minLevel: 2,
    promptFragment:
      "a cute playful aegyo pose, puffed cheeks and a V sign, adorable pleading expression",
    mode: "direct",
  },
  {
    id: "intimate",
    label: "亲密",
    emoji: "💞",
    minLevel: 3,
    promptFragment:
      "an intimate close-up selfie, soft warm gaze into the camera, cozy affectionate atmosphere",
    mode: "direct",
  },
  {
    id: "elegant",
    label: "优雅",
    emoji: "🌹",
    minLevel: 4,
    promptFragment:
      "an elegant graceful full-body pose in a refined outfit, soft flattering lighting",
    mode: "mirror",
  },
  {
    id: "alluring",
    label: "诱惑",
    emoji: "😏",
    minLevel: 5,
    promptFragment:
      "an alluring charming look, confident smoldering gaze, stylish tasteful outfit",
    mode: "direct",
  },
  {
    id: "pov_date",
    label: "恋人视角",
    emoji: "🫶",
    minLevel: 6,
    promptFragment:
      "a POV girlfriend-view photo, reaching one hand toward the camera as if holding hands with the viewer, walking together",
    mode: "direct",
  },
  {
    id: "morning",
    label: "睡眼惺忪",
    emoji: "🌅",
    minLevel: 7,
    promptFragment:
      "a just-woke-up cozy morning selfie in bed, soft natural window light, casual homewear, sleepy warm smile",
    mode: "direct",
  },
  {
    id: "date_night",
    label: "约会夜",
    emoji: "🌃",
    minLevel: 8,
    promptFragment:
      "a dressed-up date night look, evening city lights bokeh in the background, romantic mood",
    mode: "direct",
  },
];

/** 按姿势标识查找定义，未知标识返回 undefined。 */
export function getPose(id: string): SelfiePose | undefined {
  return SELFIE_POSES.find(p => p.id === id);
}

/** 返回给定亲密度等级已解锁的全部姿势。 */
export function posesForLevel(level: number): SelfiePose[] {
  return SELFIE_POSES.filter(p => p.minLevel <= level);
}
