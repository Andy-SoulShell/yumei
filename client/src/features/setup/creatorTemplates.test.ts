/** 验证独立模板覆盖全部分支，并能回填有效的完整外观与人设。 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { CREATOR_COLORS } from "./creatorAssets";
import { creatorOptions, describeCreator } from "./creatorOptions";
import { CREATOR_TEMPLATES } from "./creatorTemplates";

const t = i18n.getFixedT("zh-CN") as Translator;
describe("independent creator templates", () => {
  it.each(["female", "male"] as const)(
    "provides six complete templates for each %s style",
    gender => {
      for (const style of ["anime", "realistic"] as const) {
        const templates = CREATOR_TEMPLATES.filter(
          template => template.gender === gender && template.style === style
        );
        expect(templates).toHaveLength(6);
        expect(
          creatorOptions(gender, style, "templates").map(option => option.id)
        ).toEqual(templates.map(template => template.id));
        for (const template of templates) {
          expect(template.name.length).toBeGreaterThan(1);
          expect(template.personality.length).toBeGreaterThan(25);
          expect(template.interests.split("、").length).toBeGreaterThanOrEqual(
            3
          );
          expect(
            existsSync(
              path.resolve("client/public", template.imageUrl.slice(1))
            )
          ).toBe(true);
          expect(template.selection.age).toBeGreaterThanOrEqual(18);
          expect(template.selection.age).toBeLessThanOrEqual(100);
          for (const [category, value] of Object.entries(
            template.selection.options
          )) {
            const valid =
              category in CREATOR_COLORS
                ? CREATOR_COLORS[category as keyof typeof CREATOR_COLORS]
                : creatorOptions(gender, style, category as "templates");
            expect(
              valid.some(option => option.id === value),
              `${template.id}/${category}/${value}`
            ).toBe(true);
          }
          const appearance = describeCreator(template.selection, t);
          expect(appearance).toContain(
            `${template.selection.age} 岁成年${gender === "male" ? "男性" : "女性"}`
          );
          expect(appearance).not.toContain("模板：");
          expect(appearance).toContain(template.selection.details);
          if (gender === "male") expect(appearance).not.toMatch(/胸部|臀部/);
        }
      }
    }
  );
});
