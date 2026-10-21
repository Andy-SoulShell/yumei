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
import { setLevelMemory } from "./LevelBenefitsEditor";
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
      rootSchema={schema}
      issues={issues}
      disabled={disabled}
      onChange={setConfig}
    />
  );
}
async function tab(name: string) {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  ).find(item => item.getAttribute("aria-label")?.startsWith(name))!;
  expect(button).toBeTruthy();
  await act(async () =>
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
}
async function change(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function clickText(text: string, scope: ParentNode = document) {
  const button = Array.from(
    scope.querySelectorAll<HTMLButtonElement>("button")
  ).find(item => item.textContent?.startsWith(text))!;
  expect(button, text).toBeTruthy();
  await act(async () => button.click());
}
it("opens a focused capability dialog for the selected level and saves all dependencies into the same draft", async () => {
  await act(async () => root.render(<Probe section="intimacy" />));
  const selected = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find(button => button.textContent?.includes("第 3 级 ·"))!;
  await act(async () => selected.click());
  const benefits = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
  ).find(button => button.textContent === "解锁与能力")!;
  await act(async () => benefits.click());
  await clickText("记忆能力");
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
    "第 3 级 ·"
  );
  expect(
    document.querySelector(
      '[role="dialog"] select[aria-label="查看哪个等级的记忆能力"]'
    )
  ).toBeNull();
  await change(
    document.querySelector<HTMLInputElement>('[aria-label="本级记忆容量"]')!,
    "78"
  );
  await clickText("完成能力编辑");
  expect(
    current.memory.levelRules.find(rule => rule.minLevel === 3)!.capacity
  ).toBe(78);
  expect(
    container.querySelector('[aria-label="第 3 级的解锁能力"]')!.textContent
  ).toContain("78 条容量");
  await clickText("自拍姿势");
  const select = document.querySelector<HTMLSelectElement>(
    '[aria-label="移到本级的姿势"]'
  )!;
  expect(
    Array.from(select.options).some(
      option => option.value === current.selfies.defaultPoseId
    )
  ).toBe(false);
  const pose = current.selfies.poses.find(
    pose => pose.id !== current.selfies.defaultPoseId && pose.minLevel !== 3
  )!;
  await change(select, pose.id);
  await clickText("在第 3 级开放");
  expect(current.selfies.poses.find(item => item.id === pose.id)).toMatchObject(
    { minLevel: 3, enabled: true }
  );
  await clickText("完成能力编辑");
  expect(current.intimacy).toEqual(productFixture.intimacy);
  expect(productConfigSchema.safeParse(current).success).toBe(true);
});
it("creates or removes an inherited relationship override for the current level without changing the other pace", async () => {
  current.prompts.chat.relationshipStages.gradual = [
    { minLevel: 1, instruction: "保持自然交流" },
  ];
  const natural = structuredClone(
    current.prompts.chat.relationshipStages.natural
  );
  await act(async () => root.render(<Probe section="intimacy" />));
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.includes("第 3 级 ·"))!
      .click()
  );
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
      .find(button => button.textContent === "解锁与能力")!
      .click()
  );
  await clickText("相处指令");
  const toggle = document.querySelector<HTMLButtonElement>(
    '[aria-label="第 3 级单独设置相处指令"]'
  )!;
  expect(
    document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!
      .disabled
  ).toBe(true);
  await act(async () => toggle.click());
  await change(
    document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!,
    "更熟悉地关心对方"
  );
  expect(current.prompts.chat.relationshipStages.gradual).toEqual([
    { minLevel: 1, instruction: "保持自然交流" },
    { minLevel: 3, instruction: "更熟悉地关心对方" },
  ]);
  await act(async () => toggle.click());
  expect(current.prompts.chat.relationshipStages.gradual).toEqual([
    { minLevel: 1, instruction: "保持自然交流" },
  ]);
  expect(current.prompts.chat.relationshipStages.natural).toEqual(natural);
});
it("splits an inherited memory boundary and constrains recall with capacity without altering neighboring levels", () => {
  const config = structuredClone(productFixture);
  config.memory.levelRules = [
    { minLevel: 1, capacity: 30, recallCount: 5 },
    { minLevel: 4, capacity: 60, recallCount: 8 },
  ];
  const next = setLevelMemory(config, 3, "capacity", 2);
  expect(next.memory.levelRules).toEqual([
    { minLevel: 1, capacity: 30, recallCount: 5 },
    { minLevel: 3, capacity: 2, recallCount: 2 },
    { minLevel: 4, capacity: 60, recallCount: 8 },
  ]);
  expect(config.memory.levelRules).toHaveLength(2);
  expect(next.selfies).toBe(config.selfies);
  expect(productConfigSchema.safeParse(next).success).toBe(true);
});
it("merges related edits into the full draft and returns to the original task without losing changes", async () => {
  await act(async () => root.render(<Probe section="memory" />));
  await change(
    container.querySelector<HTMLInputElement>('[aria-label="容量"]')!,
    "55"
  );
  await clickText("记忆依赖的等级");
  const dialog = document.querySelector('[role="dialog"]')!;
  const name = Array.from(
    dialog.querySelectorAll<HTMLInputElement>("input")
  ).find(input => input.value === current.intimacy.levels[0].name["zh-CN"])!;
  await change(name, "一起成长");
  await clickText("完成，回到当前任务");
  expect(current.memory.levelRules[0].capacity).toBe(55);
  expect(current.intimacy.levels[0].name["zh-CN"]).toBe("一起成长");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="容量"]')!.value
  ).toBe("55");
  expect(current.billing).toEqual(productFixture.billing);
  expect(productConfigSchema.safeParse(current).success).toBe(true);
  await clickText("提取和召回的提示词");
  expect(
    document
      .querySelector('[role="dialog"] [role="tab"][aria-selected="true"]')!
      .getAttribute("aria-label")
  ).toBe("记忆与语音提示");
  await clickText("完成，回到当前任务");
  await clickText("回复上下文预算");
  expect(
    document
      .querySelector('[role="dialog"] [role="tab"][aria-selected="true"]')!
      .getAttribute("aria-label")
  ).toBe("上下文预算");
});
it("keeps malformed workflow text when a related editor closes and reopens", async () => {
  await act(async () => root.render(<Probe section="selfies" />));
  await clickText("图片服务");
  const workflowTab = () =>
    document.querySelector<HTMLButtonElement>(
      '[role="dialog"] [role="tab"][aria-label^="文生图工作流"]'
    )!;
  await act(async () =>
    workflowTab().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
  await change(
    document.querySelector<HTMLTextAreaElement>(
      '[aria-label="工作流节点 JSON"]'
    )!,
    "{unfinished"
  );
  await clickText("完成，回到当前任务");
  expect(productConfigSchema.safeParse(current).success).toBe(false);
  await clickText("图片服务");
  await act(async () =>
    workflowTab().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
  expect(
    document.querySelector<HTMLTextAreaElement>(
      '[aria-label="工作流节点 JSON"]'
    )!.value
  ).toBe("{unfinished");
});
it("creates a capacity boundary for an inherited level without modifying earlier levels", async () => {
  current.memory.levelRules = [{ minLevel: 1, capacity: 20, recallCount: 3 }];
  await act(async () => root.render(<Probe section="memory" />));
  await change(
    container.querySelector<HTMLSelectElement>(
      '[aria-label="查看哪个等级的记忆能力"]'
    )!,
    "2"
  );
  await clickText("从第 2 级开始单独设置");
  await change(
    container.querySelector<HTMLInputElement>('[aria-label="容量"]')!,
    "35"
  );
  expect(current.memory.levelRules).toEqual([
    { minLevel: 1, capacity: 20, recallCount: 3 },
    { minLevel: 2, capacity: 35, recallCount: 3 },
  ]);
  expect(productConfigSchema.safeParse(current).success).toBe(true);
});
it("evaluates opt-in, quiet hours, active chat and unread backoff using the current draft", async () => {
  current.proactive.enabled = true;
  Object.assign(current.proactive.defaults, {
    timeZone: "UTC",
    quietStart: 22 * 60,
    quietEnd: 8 * 60,
    frequencyDays: 1,
  });
  await act(async () => root.render(<Probe section="proactive" />));
  const output = () => container.querySelector("output")!.textContent;
  expect(output()).toContain("未获得联系资格");
  const switchByText = (name: string) => {
    const label = Array.from(container.querySelectorAll("label")).find(
      item => item.textContent === name
    )!;
    return document.getElementById(label.htmlFor) as HTMLButtonElement;
  };
  await change(
    container.querySelector<HTMLInputElement>(
      '[aria-label="检查时间（UTC）"]'
    )!,
    "2026-10-21T23:00"
  );
  await act(async () => switchByText("模拟用户已主动开启").click());
  expect(output()).toContain("处于免打扰");
  await change(
    container.querySelector<HTMLInputElement>(
      '[aria-label="检查时间（UTC）"]'
    )!,
    "2026-10-21T12:00"
  );
  expect(output()).toContain("已满足时间与授权条件");
  await act(async () => {
    const date = container.querySelector<HTMLInputElement>(
      '[aria-label="检查时间（UTC）"]'
    )!;
    date.value = "2026-10-21T23:00";
    date.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(output()).toContain("处于免打扰");
  await change(
    container.querySelector<HTMLInputElement>(
      '[aria-label="检查时间（UTC）"]'
    )!,
    "2026-10-21T12:00"
  );
  await act(async () => switchByText("模拟正在聊天").click());
  expect(output()).toContain("正在聊天");
  await act(async () => switchByText("模拟正在聊天").click());
  await change(
    container.querySelector<HTMLInputElement>(
      '[aria-label="上次联系（UTC，可留空）"]'
    )!,
    "2026-10-20T12:00"
  );
  await change(
    container.querySelector<HTMLInputElement>('[aria-label="未读联系数"]')!,
    "3"
  );
  expect(output()).toContain("退避间隔未满足");
  expect(current.proactive.defaults.proactiveEnabled).toBe(false);
});
it("shows live level unlocks and rejects a disallowed upload in the rule rehearsal", async () => {
  await act(async () => root.render(<Probe section="intimacy" />));
  expect(container.textContent).not.toContain(
    "末级仍被姿势、记忆或关系阶段引用"
  );
  const library = container.querySelector('[aria-label="编辑等级"]')!;
  expect(library).not.toBeNull();
  expect(
    Array.from(container.querySelectorAll('[role="tabpanel"] button')).filter(
      item => item.textContent?.includes("默认")
    ).length
  ).toBe(0);
  const stage = current.intimacy.levels[1];
  await change(
    container.querySelector<HTMLInputElement>('[aria-label="模拟累计积分"]')!,
    String(stage.requiredPoints)
  );
  expect(container.querySelector("output")!.textContent).toContain(
    `2 级 · ${stage.name["zh-CN"]}`
  );
  expect(current).toEqual(productFixture);
  await act(async () => root.render(<Probe section="uploads" />));
  await change(
    container.querySelector<HTMLInputElement>(
      '[aria-label="模拟文件大小（MiB）"]'
    )!,
    "200"
  );
  expect(container.querySelector("output")!.textContent).toContain(
    "文件不符合"
  );
});
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
