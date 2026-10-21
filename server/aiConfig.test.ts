/** 提示词占位符、初始数据和跨领域记忆配置校验。 */
import { describe, expect, it } from "vitest";
import { renderPrompt } from "../shared/aiConfig";
import { productConfigSchema } from "../shared/productConfig";
import { productFixture } from "./testProductConfig";

describe("AI configuration contract", () => {
  it("imports existing prompt templates and memory rules without client defaults", () => {
    const config = productConfigSchema.parse(productFixture);
    expect(config.prompts.quickTemplates).toHaveLength(6);
    expect(config.prompts.chat.system).toContain("{{characterData}}");
    expect(config.prompts.extraction).toContain("{{maxLength}}");
    expect(config.memory.levelRules[0]).toEqual({
      minLevel: 1,
      capacity: 30,
      recallCount: 5,
    });
    expect(config.memory.extraction.everyRounds).toBe(5);
    expect(config.memory.maxExtractedLength).toBe(200);
  });
  it("rejects unknown, malformed or omitted prompt variables", () => {
    for (const image of [
      "missing scene",
      "{{scene}} {{unknown}}",
      "{{scene}} {{broken",
    ]) {
      const config = structuredClone(productFixture);
      config.prompts.image.reference = image;
      expect(productConfigSchema.safeParse(config).success).toBe(false);
    }
    expect(
      renderPrompt("Scene {{scene}}", { scene: "literal {{scene}} $&" })
    ).toBe("Scene literal {{scene}} $&");
    expect(() => renderPrompt("{{missing}}", {})).toThrow(
      "Unknown prompt variable"
    );
  });
  it("validates complete memory categories, ranking, capacity and context budgets", () => {
    const mutations = [
      (c: typeof productFixture) => {
        c.memory.categories[0].id = c.memory.categories[1].id;
      },
      (c: typeof productFixture) => {
        c.memory.levelRules[0].recallCount = 31;
      },
      (c: typeof productFixture) => {
        c.memory.ranking.decayDays = 0;
      },
      (c: typeof productFixture) => {
        c.memory.jobs.retryMaxMs = 100;
      },
      (c: typeof productFixture) => {
        c.prompts.context.platform = 1000;
      },
      (c: typeof productFixture) => {
        c.prompts.context.total = 20000;
      },
    ];
    for (const mutate of mutations) {
      const config = structuredClone(productFixture);
      mutate(config);
      expect(productConfigSchema.safeParse(config).success).toBe(false);
    }
  });
});
