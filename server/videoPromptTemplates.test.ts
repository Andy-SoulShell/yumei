/** 视频提示词按发布模板渲染，保留完整本次描述并在空描述时使用预设。 */
import { describe, expect, it } from "vitest";
import { productFixture } from "./testProductConfig";
import { buildVideoPrompt } from "./promptTemplates";
import { productConfigSchema } from "../shared/productConfig";

describe.each(["reference", "text"] as const)(
  "%s video prompts",
  generationMode => {
    const preset = productFixture.videos.presets[0];
    const appearance = "黑色长发，蓝色衬衫";
    it("gives the complete user description priority over the selected preset", () => {
      const request =
        "海边镜头。".repeat(300) + "\n最后转身，穿红色长裙。{{scene}}";
      const prompt = buildVideoPrompt(productFixture, {
        userContext: request,
        generationMode,
        appearance,
        preset,
      });
      expect(prompt.endsWith(request)).toBe(true);
      expect(prompt).not.toContain(preset.promptFragment);
      expect(prompt.includes(appearance)).toBe(generationMode === "text");
    });
    it("uses the published preset only for a blank description", () => {
      const config = structuredClone(productFixture);
      config.prompts.video[generationMode] =
        generationMode === "text" ? "{{appearance}} / {{scene}}" : "{{scene}}";
      const prompt = buildVideoPrompt(config, {
        userContext: " \n ",
        generationMode,
        appearance,
        preset,
      });
      expect(prompt.endsWith(preset.promptFragment)).toBe(true);
      expect(() =>
        buildVideoPrompt(config, {
          userContext: "",
          generationMode,
          appearance,
        })
      ).toThrow();
    });
  }
);
it("rejects templates with missing or unsupported video variables", () => {
  const config = structuredClone(productFixture);
  config.prompts.video.text = "{{scene}}";
  expect(productConfigSchema.safeParse(config).success).toBe(false);
  config.prompts.video.text = productFixture.prompts.video.text;
  config.prompts.video.reference = "{{scene}} {{appearance}}";
  expect(productConfigSchema.safeParse(config).success).toBe(false);
});
