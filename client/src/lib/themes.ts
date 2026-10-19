/** 八套配色的预览和语义色，显示模式由用户独立选择。 */
import type { ThemeId } from "@shared/preferences";

export const THEMES: Record<
  ThemeId,
  {
    name: string;
    description: string;
    hue: number;
    colors: [string, string, string];
    light: string;
    dark: string;
    foreground: string;
  }
> = {
  "tokyo-sunset": {
    name: "东京日落",
    description: "暖橙 · 默认",
    hue: 35,
    colors: ["#fb923c", "#fde68a", "#c2410c"],
    light: "#b94a0a",
    dark: "#fb923c",
    foreground: "#21130a",
  },
  sakura: {
    name: "樱粉",
    description: "浪漫粉调",
    hue: 350,
    colors: ["#f472b6", "#fb7185", "#be185d"],
    light: "#c2185b",
    dark: "#f472b6",
    foreground: "#2a101b",
  },
  midnight: {
    name: "午夜紫",
    description: "梦幻冷紫",
    hue: 295,
    colors: ["#a78bfa", "#60a5fa", "#6d28d9"],
    light: "#7040c0",
    dark: "#b39aff",
    foreground: "#1c1230",
  },
  "neon-mint": {
    name: "霓虹薄荷",
    description: "清新薄荷点缀",
    hue: 165,
    colors: ["#34d399", "#4ade80", "#0d9488"],
    light: "#087b60",
    dark: "#34d399",
    foreground: "#08271e",
  },
  crimson: {
    name: "深红丝绒",
    description: "大胆红 · 性感",
    hue: 20,
    colors: ["#e11d48", "#fb923c", "#7f1d1d"],
    light: "#b7183a",
    dark: "#fb7185",
    foreground: "#2d0b13",
  },
  sapphire: {
    name: "蓝宝石夜",
    description: "深蓝配金",
    hue: 260,
    colors: ["#3b82f6", "#fbbf24", "#1e3a8a"],
    light: "#2358bd",
    dark: "#7aaaff",
    foreground: "#0c1a35",
  },
  lava: {
    name: "熔岩流光",
    description: "赛博朋克霓虹",
    hue: 30,
    colors: ["#ff5b20", "#facc15", "#f472b6"],
    light: "#be4412",
    dark: "#ff915e",
    foreground: "#2c140a",
  },
  pearl: {
    name: "晨曦珠光",
    description: "明亮底色 · 柔和珠光",
    hue: 75,
    colors: ["#f5f0e9", "#fb923c", "#fbd38d"],
    light: "#9b5b19",
    dark: "#fbd38d",
    foreground: "#2c200e",
  },
};
