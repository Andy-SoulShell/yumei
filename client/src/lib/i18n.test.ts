/** 偏好解析和翻译边界，避免损坏缓存、语言切换或插值改变用户内容。 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  resolveLocale,
  THEME_IDS,
} from "@shared/preferences";
import { translate } from "./i18n";
import { THEMES } from "./themes";
import { en } from "@/locales/messages";
import { INTIMACY_LEVELS } from "@shared/intimacy";
import { SELFIE_POSES } from "@shared/selfiePoses";
import { MEMORY_CATEGORY_LABELS } from "@shared/memory";
import { CHARACTER_PRESETS } from "@shared/characterPresets";

describe("interface localization", () => {
  it("covers shared interface labels and preserves every interpolation parameter", () => {
    const labels = [
      ...Object.values(THEMES).flatMap(theme => [
        theme.name,
        theme.description,
      ]),
      ...INTIMACY_LEVELS.flatMap(level => [
        level.name,
        level.description,
        ...level.unlocks,
      ]),
      ...SELFIE_POSES.map(pose => pose.label),
      ...Object.values(MEMORY_CATEGORY_LABELS),
      ...CHARACTER_PRESETS.flatMap(preset => [preset.label, preset.tagline]),
    ];
    for (const label of labels) expect(en[label], label).toBeTypeOf("string");
    const parameters = (value: string) =>
      Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g))
        .map(match => match[1])
        .sort();
    for (const [source, target] of Object.entries(en))
      expect(parameters(target), source).toEqual(parameters(source));
  });
  it("follows supported browser languages and respects explicit choices", () => {
    expect(resolveLocale("system", ["zh-TW", "en-US"])).toBe("zh-CN");
    expect(resolveLocale("system", ["fr-FR", "en-GB", "zh-CN"])).toBe("en");
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveLocale("system", [])).toBe("en");
  });
  it("rejects invalid persisted values without losing supported fields", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(
      parsePreferences({
        theme: "<script>",
        language: "en",
        colorMode: "invalid",
      })
    ).toEqual({ ...DEFAULT_PREFERENCES, language: "en" });
    expect(THEME_IDS.every(id => THEMES[id])).toBe(true);
  });
  it("translates both original English and Chinese pages without translating parameters", () => {
    expect(translate("设置", "en")).toBe("Settings");
    expect(translate("Sign in to continue", "zh-CN")).toBe("登录以继续");
    expect(
      translate("与 {v0} 的对话", "en", { v0: "用户原名 <YUMEI> {v1}" })
    ).toBe("Conversation with 用户原名 <YUMEI> {v1}");
    expect(translate("unsaved private content", "en")).toBe(
      "unsaved private content"
    );
  });
});
