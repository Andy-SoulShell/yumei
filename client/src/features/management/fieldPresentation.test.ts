import { expect, it } from "vitest";
import { z } from "zod";
import { productConfigSchema } from "@shared/productConfig";
import { homepageSchema, officialCharacterSchema } from "@shared/discovery";
import type { FormSchema } from "./ConfigForm";
import {
  defaultUnit,
  nullableLabel,
  numericError,
  numericRange,
  storedNumber,
  valueUnits,
} from "./fieldPresentation";

it("assigns meaningful units and shared-schema bounds to every numeric admin field", () => {
  const missing: string[] = [];
  function visit(s: FormSchema, path: string) {
    if (s.anyOf)
      return s.anyOf
        .filter(item => item.type !== "null")
        .forEach(item => visit(item, path));
    if (s.type === "number" || s.type === "integer") {
      if (
        !valueUnits(path).length ||
        (s.minimum === undefined && s.exclusiveMinimum === undefined) ||
        s.maximum === undefined
      )
        missing.push(path);
    }
    for (const [key, child] of Object.entries(s.properties ?? {}))
      visit(child, path ? `${path}.${key}` : key);
    if (s.items) visit(s.items, `${path}.0`);
    if (typeof s.additionalProperties === "object")
      visit(s.additionalProperties, `${path}.text_message`);
  }
  visit(
    z.toJSONSchema(productConfigSchema, {
      unrepresentable: "any",
    }) as FormSchema,
    ""
  );
  visit(z.toJSONSchema(homepageSchema) as FormSchema, "home");
  visit(z.toJSONSchema(officialCharacterSchema) as FormSchema, "character");
  expect(missing).toEqual([]);
});
it("converts duration, capacity and percent without clamping invalid or empty input", () => {
  expect(storedNumber("1.001", 1000, true)).toBe(1001);
  expect(storedNumber("2.5", 1048576, true)).toBe(2621440);
  expect(storedNumber("35", 0.01, false)).toBeCloseTo(0.35);
  expect(storedNumber("", 1, true)).toBeNaN();
  expect(storedNumber("-1", 1000, true)).toBe(-1000);
  expect(storedNumber("0.0001", 1000, true)).toBeCloseTo(0.1);
  expect(storedNumber("1e-11", 1, true)).toBe(1e-11);
  expect(storedNumber("1.000000000000000001", 1, true)).toBeNaN();
  expect(storedNumber("1.001e0", 1000, true)).toBe(1001);
  expect(storedNumber("35", 0.01, false)).toBe(0.35);
});
it("respects exclusive bounds, storage precision and whole-day multiples", () => {
  expect(numericError(0, { exclusiveMinimum: 0, maximum: 1 })).toContain(
    "低于"
  );
  expect(
    numericError(0.1, { exclusiveMinimum: 0, maximum: 1 })
  ).toBeUndefined();
  expect(
    numericError(1.5, { type: "integer", minimum: 0, maximum: 2 })
  ).toContain("完整");
  expect(
    numericError(86400001, {
      type: "integer",
      minimum: 86400000,
      maximum: 7776000000,
      multipleOf: 86400000,
    })
  ).toContain("步长");
  expect(
    numericRange(
      { minimum: 0, maximum: 7776000000, multipleOf: 86400000 },
      { label: "天", factor: 86400000 },
      valueUnits("billing.pastDueGraceMs")
    )
  ).toContain("每次 1 天");
});
it("distinguishes quota, provider defaults and reward thresholds", () => {
  expect(nullableLabel("billing.plans.0.limits.dailyMessages")).toBe("不限量");
  expect(nullableLabel("runtime.chat.temperature")).toBe("使用模型默认值");
  expect(nullableLabel("intimacy.rules.selfie.bonusThreshold")).toBe(
    "不使用额外奖励阈值"
  );
  expect(
    defaultUnit(
      "intimacy.rules.voice_message.bonusThreshold",
      30000,
      valueUnits("intimacy.rules.voice_message.bonusThreshold")
    ).label
  ).toBe("秒");
  expect(
    valueUnits("intimacy.rules.text_message.bonusThreshold")[0].label
  ).toBe("字符");
  expect(valueUnits("intimacy.rules.daily_first.bonusThreshold")[0].label).toBe(
    "连续天数"
  );
});
