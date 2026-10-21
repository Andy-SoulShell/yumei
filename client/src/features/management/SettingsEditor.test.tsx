// @vitest-environment jsdom
/** 使用真实 Radix 分区和表单测试全页面可达性、预览及草稿保护。 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { productConfigSchema, type ProductConfig } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import { SettingsEditor } from "./SettingsEditor";
import { settingsPanels, type SettingsSection } from "./settingsModel";
import type { FormSchema } from "./ConfigForm";
let root: Root, container: HTMLDivElement, current: ProductConfig;
const schema = z.toJSONSchema(productConfigSchema, {
  unrepresentable: "any",
}) as FormSchema;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  current = structuredClone(productFixture);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Probe({
  section,
  disabled = false,
}: {
  section: SettingsSection;
  disabled?: boolean;
}) {
  const [config, setConfig] = useState(current);
  current = config;
  const parsed = productConfigSchema.safeParse(config),
    issues: Record<string, string> = {};
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      issues[issue.path.join(".")] = issue.message;
  return (
    <SettingsEditor
      config={config}
      section={section}
      schema={schema.properties![section]}
      issues={issues}
      disabled={disabled}
      onChange={setConfig}
    />
  );
}
async function tab(name: string) {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  ).find(item => item.textContent?.startsWith(name))!;
  expect(button).toBeTruthy();
  await act(async () =>
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
}
async function change(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
it.each(Object.keys(settingsPanels) as SettingsSection[])(
  "opens every task in %s with real controls and a draft-only preview",
  async section => {
    await act(async () => root.render(<Probe section={section} />));
    expect(
      container.querySelector('[aria-label="当前草稿效果预览"]')
    ).not.toBeNull();
    for (const item of settingsPanels[section]) {
      await tab(item.title);
      expect(
        container.querySelector('[role="tabpanel"][data-state="active"] h2')
          ?.textContent
      ).toBe(item.title);
      expect(
        container.querySelectorAll(
          '[role="tabpanel"][data-state="active"] input,[role="tabpanel"][data-state="active"] textarea,[role="tabpanel"][data-state="active"] button,[role="tabpanel"][data-state="active"] select'
        ).length
      ).toBeGreaterThan(0);
    }
    expect(current).toEqual(productFixture);
  }
);
it("copies a plan into an independent inactive draft and edits its price using its currency", async () => {
  await act(async () => root.render(<Probe section="billing" />));
  const button = Array.from(container.querySelectorAll("button")).find(
    item => item.textContent === "复制为新套餐"
  )!;
  await act(async () => button.click());
  expect(current.billing.plans).toHaveLength(
    productFixture.billing.plans.length + 1
  );
  expect(current.billing.plans.at(-1)!.enabled).toBe(false);
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="金额"]'
  )!;
  await change(input, "12.34");
  expect(current.billing.plans.at(-1)!.price.amount).toBe(12.34);
  expect(current.billing.plans[0]).toEqual(productFixture.billing.plans[0]);
  expect(
    container.querySelector('[aria-label="编辑套餐"]')!.textContent
  ).toContain("USD");
  expect(productConfigSchema.safeParse(current).success).toBe(true);
  await change(
    container.querySelector<HTMLInputElement>('[aria-label="搜索套餐"]')!,
    "新套餐"
  );
  await tab("订阅与默认");
  await tab("套餐管理");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="搜索套餐"]')!.value
  ).toBe("新套餐");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="金额"]')!.value
  ).toBe("12.34");
});
it("keeps malformed workflow input through tab changes and blocks the shared save contract until repaired", async () => {
  await act(async () => root.render(<Probe section="models" />));
  await tab("文生图工作流");
  await change(
    container.querySelector<HTMLTextAreaElement>(
      '[aria-label="工作流节点 JSON"]'
    )!,
    "{broken"
  );
  expect(productConfigSchema.safeParse(current).success).toBe(false);
  await tab("聊天服务");
  await tab("文生图工作流");
  expect(
    container.querySelector<HTMLTextAreaElement>(
      '[aria-label="工作流节点 JSON"]'
    )!.value
  ).toBe("{broken");
  await change(
    container.querySelector<HTMLTextAreaElement>(
      '[aria-label="工作流节点 JSON"]'
    )!,
    JSON.stringify(productFixture.models.image.workflows.text.nodes)
  );
  expect(productConfigSchema.safeParse(current).success).toBe(true);
});
it("updates upload previews immediately while preserving all other upload limits", async () => {
  await act(async () => root.render(<Probe section="uploads" />));
  await change(
    container.querySelector<HTMLInputElement>('input[aria-label="文件上限"]')!,
    "2"
  );
  expect(
    container.querySelector('[aria-label="当前草稿效果预览"]')!.textContent
  ).toContain("2 MiB");
  expect(current.uploads.avatar.maxBytes).toBe(2 * 1048576);
  expect(current.uploads.reference).toEqual(productFixture.uploads.reference);
  expect(current.uploads.audio).toEqual(productFixture.uploads.audio);
});
it("disables task navigation and content controls while a save or publication is in progress", async () => {
  await act(async () => root.render(<Probe section="billing" disabled />));
  expect(
    Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).every(item => item.disabled)
  ).toBe(true);
  expect(
    Array.from(container.querySelectorAll<HTMLInputElement>("input")).every(
      item => item.disabled
    )
  ).toBe(true);
});

it("keeps image quotas mutually exclusive when switching day, month and unlimited", async () => {
  await act(async () => root.render(<Probe section="billing" />));
  const selectMode = async (label: string) => {
    const option = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    ).find(item => item.textContent === label)!;
    await act(async () => option.click());
    expect(productConfigSchema.safeParse(current).success).toBe(true);
  };
  await selectMode("按月");
  expect(current.billing.plans[0].limits).toMatchObject({
    dailySelfies: null,
    monthlySelfies: 1,
  });
  await change(
    container.querySelector<HTMLInputElement>('[aria-label="每月图片额度"]')!,
    "8"
  );
  const imageGroup = container.querySelector('[aria-label="图片额度周期"]')!;
  await act(async () =>
    Array.from(imageGroup.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
      .find(item => item.textContent === "不限量")!
      .click()
  );
  expect(current.billing.plans[0].limits).toMatchObject({
    dailySelfies: null,
    monthlySelfies: null,
  });
  await selectMode("按日");
  expect(current.billing.plans[0].limits).toMatchObject({
    dailySelfies: 8,
    monthlySelfies: null,
  });
});
