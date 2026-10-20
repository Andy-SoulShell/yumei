/** 八套配色的预览和语义色；名称与说明统一从本地化文案读取。 */
import type { ThemeId } from "@shared/preferences";

export const THEMES: Record<
  ThemeId,
  {
    hue: number;
    colors: [string, string, string];
    light: string;
    dark: string;
    background: { light: string; dark: string };
    foreground: string;
  }
> = {
  "tokyo-sunset": {
    background: { light: "#fffbf9", dark: "#0f0706" },
    hue: 35,
    colors: ["#fb923c", "#fde68a", "#c2410c"],
    light: "#b94a0a",
    dark: "#fb923c",
    foreground: "#21130a",
  },
  sakura: {
    background: { light: "#fffafc", dark: "#0e070a" },
    hue: 350,
    colors: ["#f472b6", "#fb7185", "#be185d"],
    light: "#c2185b",
    dark: "#f472b6",
    foreground: "#2a101b",
  },
  midnight: {
    background: { light: "#fcfbff", dark: "#09080f" },
    hue: 295,
    colors: ["#a78bfa", "#60a5fa", "#6d28d9"],
    light: "#7040c0",
    dark: "#b39aff",
    foreground: "#1c1230",
  },
  "neon-mint": {
    background: { light: "#f9fdfb", dark: "#040b08" },
    hue: 165,
    colors: ["#34d399", "#4ade80", "#0d9488"],
    light: "#087b60",
    dark: "#34d399",
    foreground: "#08271e",
  },
  crimson: {
    background: { light: "#fffafa", dark: "#0f0707" },
    hue: 20,
    colors: ["#e11d48", "#fb923c", "#7f1d1d"],
    light: "#b7183a",
    dark: "#fb7185",
    foreground: "#2d0b13",
  },
  sapphire: {
    background: { light: "#fafcff", dark: "#06090f" },
    hue: 260,
    colors: ["#3b82f6", "#fbbf24", "#1e3a8a"],
    light: "#2358bd",
    dark: "#7aaaff",
    foreground: "#0c1a35",
  },
  lava: {
    background: { light: "#fffbfa", dark: "#0f0706" },
    hue: 30,
    colors: ["#ff5b20", "#facc15", "#f472b6"],
    light: "#be4412",
    dark: "#ff915e",
    foreground: "#2c140a",
  },
  pearl: {
    background: { light: "#fefbf8", dark: "#0d0804" },
    hue: 75,
    colors: ["#f5f0e9", "#fb923c", "#fbd38d"],
    light: "#9b5b19",
    dark: "#fbd38d",
    foreground: "#2c200e",
  },
};
