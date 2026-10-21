import { expect, it } from "vitest";
import { sameConfigValue } from "./editorState";

it("ignores database object key order while retaining meaningful configuration edits", () => {
  const database = {
    name: { en: "Name", "zh-CN": "名称" },
    limits: { amount: 3, enabled: true },
    references: ["first", "second"],
  };
  const validated = {
    references: ["first", "second"],
    limits: { enabled: true, amount: 3 },
    name: { "zh-CN": "名称", en: "Name" },
  };
  expect(sameConfigValue(database, validated)).toBe(true);
  expect(
    sameConfigValue(database, { ...validated, references: ["second", "first"] })
  ).toBe(false);
  expect(
    sameConfigValue(database, {
      ...validated,
      limits: { amount: 4, enabled: true },
    })
  ).toBe(false);
  expect(sameConfigValue({ value: NaN }, { value: null })).toBe(false);
  expect(sameConfigValue({ optional: undefined }, {})).toBe(false);
  expect(sameConfigValue([], {})).toBe(false);
});
