/** 视频动作独立校验、发布展示与解锁规则，不读取自拍姿势。 */
import { expect, it } from "vitest";
import {
  localizeProductConfig,
  productConfigSchema,
} from "../shared/productConfig";
import { getVideoPreset } from "../shared/video";
import { productFixture } from "./testProductConfig";

it("seeds motion-specific presets and localizes only enabled video actions", () => {
  const config = structuredClone(productFixture);
  expect(config.videos.presets.map(preset => preset.id)).toEqual(
    expect.arrayContaining(["wave", "heart", "turn"])
  );
  config.videos.presets[0].label = { "zh-CN": "自定义招手", en: "Custom wave" };
  config.videos.presets[1].enabled = false;
  const view = localizeProductConfig(config, "en");
  expect(view.videos.presets[0].label).toBe("Custom wave");
  expect(view.videos.presets.some(preset => preset.id === "heart")).toBe(false);
  expect(getVideoPreset("heart", config.videos.presets)).toBeUndefined();
  expect(getVideoPreset("casual", config.videos.presets)).toBeUndefined();
  expect(config.selfies).toEqual(productFixture.selfies);
});
it("rejects duplicate IDs, missing action text and nonexistent unlock levels", () => {
  for (const edit of [
    (config: typeof productFixture) => {
      config.videos.presets[1].id = config.videos.presets[0].id;
    },
    (config: typeof productFixture) => {
      config.videos.presets[0].promptFragment = "  ";
    },
    (config: typeof productFixture) => {
      config.videos.presets[0].minLevel = config.intimacy.levels.length + 1;
    },
  ]) {
    const config = structuredClone(productFixture);
    edit(config);
    expect(productConfigSchema.safeParse(config).success).toBe(false);
  }
});
it("allows an empty video library for description-only generation and shows new video unlocks at their own levels", () => {
  const config = structuredClone(productFixture);
  config.videos.presets = [];
  expect(productConfigSchema.safeParse(config).success).toBe(true);
  config.videos.presets = [
    { ...productFixture.videos.presets[0], minLevel: 3 },
  ];
  const view = localizeProductConfig(config, "zh-CN");
  expect(view.intimacy.levels[0].unlocks).not.toContain("招手");
  expect(view.intimacy.levels[2].unlocks).toContain("招手");
});
