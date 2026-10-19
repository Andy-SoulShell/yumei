/**
 * Intimacy-gated selfie pose library (M4-1).
 *
 * The intimacy levels have promised these unlocks since v3.0
 * (`shared/intimacy.ts` → unlocks: 撒娇 Lv2 / 亲密 Lv3 / 诱惑 Lv5) — this
 * module makes them real. Each pose contributes an English prompt
 * fragment consumed by `buildSmartPrompt`; all content is intentionally
 * tasteful/SFW.
 */

export interface SelfiePose {
  id: string;
  label: string;
  emoji: string;
  /** Minimum intimacy level (1-10) required to use this pose. */
  minLevel: number;
  /** English scene fragment appended into the image prompt. */
  promptFragment: string;
  /** Force a selfie mode; "auto" keeps keyword detection. */
  mode: "mirror" | "direct" | "auto";
}

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

export function getPose(id: string): SelfiePose | undefined {
  return SELFIE_POSES.find(p => p.id === id);
}

export function posesForLevel(level: number): SelfiePose[] {
  return SELFIE_POSES.filter(p => p.minLevel <= level);
}
