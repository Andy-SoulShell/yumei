// @vitest-environment jsdom
/** 删除真实任务中的当前对象时，退出编辑器并保留相邻对象及待保存草稿。 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { productConfigSchema, type ProductConfig } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import { ProductExperience } from "./ProductExperience";
import { newCollectionItem, type CollectionKind } from "./SettingsCollection";
import type { FormSchema } from "./ConfigForm";
import type { SettingsViewState } from "./settingsModel";

let root: Root, container: HTMLDivElement, current: ProductConfig;
const schema = z.toJSONSchema(productConfigSchema, {
  unrepresentable: "any",
}) as FormSchema;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollTo = vi.fn();
  window.scrollTo = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const cases = [
  ["selfies", "poses", "poses"],
  ["prompts", "quickTemplates", "quick"],
  ["intimacy", "levels", "levels"],
] as const;
it.each(cases)(
  "deletes the current %s object without switching the editor to its neighbor",
  async (section, field, task) => {
    const config = structuredClone(productFixture);
    const items = (config[section] as unknown as Record<string, unknown>)[
      field
    ] as Record<string, unknown>[];
    const neighbors = structuredClone(items);
    const added = newCollectionItem(field as CollectionKind, items, items[0]);
    items.push(added);
    const id = String(added.id ?? added.level);
    window.history.replaceState(
      null,
      "",
      `/admin/${section}?edit=${task}&item=${id}`
    );
    function Probe() {
      const [value, setValue] = useState(config);
      const [view, setView] = useState<SettingsViewState>({
        task,
        selections: { [`${section}.${field}`]: id },
        searches: {},
      });
      current = value;
      return (
        <ProductExperience
          section={section}
          config={value}
          rootSchema={schema}
          issues={{}}
          busy={false}
          dirty
          error=""
          onChange={setValue}
          onSave={vi.fn()}
          view={view}
          onViewChange={setView}
        />
      );
    }
    const click = async (text: string) => {
      const button = Array.from(document.querySelectorAll("button")).find(
        item => item.textContent?.trim() === text
      );
      expect(button, text).toBeTruthy();
      expect(button!.disabled).toBe(false);
      await act(async () => button!.click());
    };
    await act(async () => root.render(<Probe />));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    await click("删除");
    await click("删除草稿中的条目");
    expect(
      (current[section] as unknown as Record<string, unknown>)[field]
    ).toEqual(neighbors);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(window.location.search).toBe("");
    expect(container.textContent).toContain("预览来自当前草稿");
  }
);
