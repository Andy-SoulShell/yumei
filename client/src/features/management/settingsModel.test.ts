import { expect, it } from "vitest";
import { z } from "zod";
import { productConfigSchema } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import {
  settingsPanels,
  getSetting,
  setSetting,
  settingsChoices,
  type SettingsSection,
} from "./settingsModel";
import { newCollectionItem } from "./SettingsCollection";
import type { FormSchema } from "./ConfigForm";

it("assigns every settings field to exactly one task so no contract field becomes unreachable", () => {
  const schema = z.toJSONSchema(productConfigSchema, {
    unrepresentable: "any",
  }) as FormSchema;
  const problems: string[] = [];
  for (const section of Object.keys(settingsPanels) as SettingsSection[]) {
    const paths = settingsPanels[section].flatMap(panel => panel.fields);
    const visit = (s: FormSchema, path: string) => {
      if (s.properties) {
        for (const [key, child] of Object.entries(s.properties))
          visit(child, path ? `${path}.${key}` : key);
        return;
      }
      if (
        paths.filter(field => path === field || path.startsWith(`${field}.`))
          .length !== 1
      )
        problems.push(`${section}.${path}`);
    };
    visit(schema.properties![section], "");
  }
  expect(problems).toEqual([]);
});
it("updates a nested setting without altering sibling workflows, locales or the original snapshot", () => {
  const old = structuredClone(productFixture.models);
  const next = setSetting(
    old,
    "image.workflows.text.promptNode",
    "new-node"
  ) as typeof old;
  expect(getSetting(next, "image.workflows.text.promptNode")).toBe("new-node");
  expect(next.image.workflows.reference).toEqual(old.image.workflows.reference);
  expect(next.chat).toBe(old.chat);
  expect(old).toEqual(productFixture.models);
});
it("creates a new inactive plan with a stable independent ID and no copied payment mapping", () => {
  const old = structuredClone(productFixture.billing.plans[1]);
  old.lemonVariantId = "12345678901234567890";
  const next = newCollectionItem("plans", [old], old);
  expect(next.id).not.toBe(old.id);
  expect(next.enabled).toBe(false);
  expect(next.lemonVariantId).toBeNull();
  expect(next.checkoutUrl).toBeNull();
  expect(next.limits).toEqual(old.limits);
  expect(next.limits).not.toBe(old.limits);
  expect(old.lemonVariantId).toBe("12345678901234567890");
});
it("adds only the next intimacy level with a strictly larger experience threshold", () => {
  const levels = structuredClone(productFixture.intimacy.levels);
  const next = newCollectionItem("levels", levels, levels[0]);
  expect(next.level).toBe(levels.length + 1);
  expect(Number(next.requiredPoints)).toBeGreaterThan(
    levels.at(-1)!.requiredPoints
  );
  expect(levels).toEqual(productFixture.intimacy.levels);
});
it("offers only valid default references and preserves numeric playback choices", () => {
  const value = structuredClone(productFixture);
  value.billing.plans[1].enabled = false;
  expect(
    settingsChoices(value, "billing.defaultTierId")!.some(
      item => item.value === value.billing.plans[1].id
    )
  ).toBe(false);
  const defaults = settingsChoices(value, "selfies.defaultPoseId")!;
  expect(
    defaults.every(item =>
      value.selfies.poses.some(
        pose => pose.id === item.value && pose.enabled && pose.minLevel === 1
      )
    )
  ).toBe(true);
  expect(
    settingsChoices(value, "experience.playback.defaultSpeed")!.map(item =>
      Number(item.value)
    )
  ).toEqual(value.experience.playback.speeds);
});
