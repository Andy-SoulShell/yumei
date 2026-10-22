import { expect, it } from "vitest";
import { z } from "zod";
import { productConfigSchema } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import { taskEntries } from "./settingsTaskEntries";
import {
  getSetting,
  setSetting,
  settingSchema,
  settingsPanels,
  type SettingsSection,
} from "./settingsModel";
import type { FormSchema } from "./ConfigForm";
const schema = z.toJSONSchema(productConfigSchema, {
  unrepresentable: "any",
}) as FormSchema;

it("keeps every editable settings value reachable after splitting tasks into documents", () => {
  const missing: string[] = [];
  for (const section of Object.keys(settingsPanels) as SettingsSection[])
    for (const task of settingsPanels[section]) {
      const entries = taskEntries(
        section,
        task.id,
        productFixture,
        schema.properties?.[section]
      );
      if (!entries) continue;
      const paths = entries.flatMap(entry => entry.fields);
      const visit = (value: unknown, path: string) => {
        if (value && typeof value === "object") {
          for (const [key, item] of Object.entries(value))
            visit(item, `${path}.${key}`);
          return;
        }
        if (/^categories\.\d+\.id$/.test(path)) return; // 固定的四种类别标识不作为运营编辑项。
        if (
          !paths.some(field => path === field || path.startsWith(`${field}.`))
        )
          missing.push(`${section}.${path}`);
      };
      for (const field of task.fields)
        visit(getSetting(productFixture[section], field), field);
    }
  expect(missing).toEqual([]);
});
it("edits an indexed relationship stage without turning its array into an object or altering siblings", () => {
  const original = structuredClone(productFixture.prompts);
  const path = "chat.relationshipStages.gradual.1.instruction";
  const next = setSetting(
    original,
    path,
    "这个阶段的相处指令"
  ) as typeof original;
  expect(Array.isArray(next.chat.relationshipStages.gradual)).toBe(true);
  expect(next.chat.relationshipStages.gradual[0]).toBe(
    original.chat.relationshipStages.gradual[0]
  );
  expect(next.chat.relationshipStages.natural).toBe(
    original.chat.relationshipStages.natural
  );
  expect(getSetting(next, path)).toBe("这个阶段的相处指令");
  expect(settingSchema(schema.properties?.prompts, path)?.type).toBe("string");
  expect(
    productConfigSchema.safeParse({ ...productFixture, prompts: next }).success
  ).toBe(true);
  expect(original).toEqual(productFixture.prompts);
});
