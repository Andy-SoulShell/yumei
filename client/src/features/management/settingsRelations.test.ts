import { expect, it } from "vitest";
import { z } from "zod";
import { productConfigSchema } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import {
  settingsPanels,
  getSetting,
  type SettingsSection,
} from "./settingsModel";
import {
  settingsJourneys,
  taskFieldGroups,
  visibleFieldGroup,
} from "./settingsRelations";
import { rewardCondition } from "./RewardRuleEditor";
import type { FormSchema } from "./ConfigForm";

it("keeps every contract field in exactly one semantic group and every related action on a real task", () => {
  const schema = z.toJSONSchema(productConfigSchema, {
    unrepresentable: "any",
  }) as FormSchema;
  const problems: string[] = [];
  for (const section of Object.keys(settingsPanels) as SettingsSection[]) {
    const journey = settingsJourneys[section];
    expect(journey.steps).toHaveLength(3);
    for (const target of journey.related)
      expect(
        settingsPanels[target.section].some(task => task.id === target.task)
      ).toBe(true);
    for (const task of settingsPanels[section]) {
      const groups = taskFieldGroups[section]?.[task.id];
      if (!groups) continue;
      const fields = groups.flatMap(group => group.fields);
      for (const field of fields)
        expect(
          getSetting(productFixture[section], field),
          `${section}.${field}`
        ).not.toBeUndefined();
      const visit = (s: FormSchema, path: string) => {
        if (s.properties) {
          for (const [key, child] of Object.entries(s.properties))
            visit(child, path ? `${path}.${key}` : key);
          return;
        }
        if (
          task.fields.some(
            field => path === field || path.startsWith(field + ".")
          ) &&
          fields.filter(field => path === field || path.startsWith(field + "."))
            .length !== 1
        )
          problems.push(`${section}.${task.id}:${path}`);
      };
      visit(schema.properties![section], "");
    }
  }
  expect(problems).toEqual([]);
});
it("shows only the active image and chat provider fields by default without removing standby values", () => {
  const value = structuredClone(productFixture);
  value.models.chat.provider = "openrouter";
  expect(visibleFieldGroup("models", "chat.deepseekModel", value)).toBe(false);
  value.models.image.provider = "fal";
  expect(visibleFieldGroup("models", "image.falSelfie", value)).toBe(true);
  expect(visibleFieldGroup("models", "image.comfyuiBaseUrl", value)).toBe(
    false
  );
  value.models.image.provider = "comfyui";
  expect(visibleFieldGroup("models", "image.falSelfie", value)).toBe(false);
  expect(visibleFieldGroup("models", "image.comfyuiBaseUrl", value)).toBe(true);
  expect(value.models.image.falSelfie).toBe(
    productFixture.models.image.falSelfie
  );
});
it("explains strict bonus thresholds and the exact long-conversation trigger used by reward settlement", () => {
  const rule = {
    ...productFixture.intimacy.rules.text_message,
    bonusThreshold: 20,
    bonusPoints: 3,
  };
  expect(rewardCondition("text_message", rule, productFixture)).toContain(
    "超过 20 字符"
  );
  expect(rewardCondition("long_conversation", rule, productFixture)).toContain(
    "恰好达到第 21 轮"
  );
  expect(rewardCondition("daily_first", rule, productFixture)).toContain(
    "达到 20 天"
  );
  expect(rewardCondition("selfie", rule, productFixture)).toContain(
    "当天首次自拍"
  );
});
