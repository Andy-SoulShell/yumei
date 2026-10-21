import {
  DEFAULT_COMPANION_BEHAVIOR,
  productFixture,
} from "../../../../server/testProductConfig";
// @vitest-environment jsdom
/** 通过真实控件验证四语标签、风格选择和示例编辑的数量及无障碍反馈。 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { LOCALES, type Locale } from "@shared/locales";
import { type CompanionBehavior } from "@shared/companionBehavior";
import { BehaviorEditor } from "./BehaviorEditor";

let root: Root;
let container: HTMLDivElement;
let currentBehavior: CompanionBehavior;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** 外层保留表单草稿，模拟页面传入的受控数据。 */
function Probe({
  locale = "en",
  initial = DEFAULT_COMPANION_BEHAVIOR,
  behaviorError = false,
  isPending = false,
}: {
  locale?: Locale;
  initial?: CompanionBehavior;
  behaviorError?: boolean;
  isPending?: boolean;
}) {
  const [behavior, setBehavior] = useState(() => structuredClone(initial));
  currentBehavior = behavior;
  return (
    <fieldset disabled={isPending}>
      <BehaviorEditor
        characterLimits={productFixture.characters.limits}
        behavior={behavior}
        setBehavior={setBehavior}
        behaviorError={behaviorError}
        isPending={isPending}
        t={i18n.getFixedT(locale) as Translator}
      />
    </fieldset>
  );
}

async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

async function key(element: Element, value: string) {
  await settle(() =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      })
    )
  );
}

async function fill(id: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `#${id}`
  )!;
  await act(async () => {
    const prototype =
      field instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      field,
      value
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it.each(LOCALES)("labels controls and example actions in %s", async locale => {
  await settle(() => root.render(<Probe locale={locale} />));
  const t = i18n.getFixedT(locale) as Translator;
  expect(container.textContent).toContain(t("setup:behaviorTitle"));
  expect(container.textContent).toContain(t("setup:behaviorExamplesHelp"));
  expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(5);
  for (const control of Array.from(
    container.querySelectorAll('[role="combobox"], input')
  )) {
    const label = container.querySelector(`label[for="${control.id}"]`);
    expect(label?.textContent?.trim()).toBeTruthy();
  }
  await settle(() =>
    Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent === t("setup:behaviorAddExample"))!
      .click()
  );
  expect(container.querySelectorAll("textarea")).toHaveLength(2);
  expect(container.textContent).toContain(
    t("setup:behaviorExampleNumber", { number: 1 })
  );
  expect(
    container.querySelector("button[aria-label]")?.getAttribute("aria-label")
  ).toBe(t("setup:behaviorRemoveExampleNumber", { number: 1 }));
  expect(container.textContent).not.toMatch(/setup:behavior/);
});

it("updates conversation style with the keyboard and retains nickname and other fields", async () => {
  await settle(() => root.render(<Probe />));
  await fill("behavior-user-nickname", "小雨");
  const trigger = container.querySelector("#behavior-expression")!;
  await key(trigger, "ArrowDown");
  const direct = Array.from(document.querySelectorAll('[role="option"]')).find(
    option => option.textContent === "Direct"
  )!;
  expect(direct).toBeDefined();
  await key(direct, "Enter");
  expect(currentBehavior.expression).toBe("direct");
  expect(currentBehavior.userNickname).toBe("小雨");
  expect(currentBehavior.verbosity).toBe(DEFAULT_COMPANION_BEHAVIOR.verbosity);
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it("edits and removes pairs, limits additions to five and enables them after removal", async () => {
  await settle(() => root.render(<Probe />));
  const add = () =>
    Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Add example"
    )!;
  for (let index = 0; index < 5; index++) await settle(() => add().click());
  expect(currentBehavior.examples).toHaveLength(5);
  expect(add().disabled).toBe(true);
  await settle(() => add().click());
  expect(currentBehavior.examples).toHaveLength(5);
  await fill("behavior-example-0-user", "今天好累");
  await fill("behavior-example-0-assistant", "坐一会儿，慢慢说。");
  expect(currentBehavior.examples[0]).toEqual({
    user: "今天好累",
    assistant: "坐一会儿，慢慢说。",
  });
  expect(
    container.querySelector<HTMLTextAreaElement>("textarea")?.maxLength
  ).toBe(300);
  expect(container.querySelector<HTMLInputElement>("input")?.maxLength).toBe(
    40
  );
  await settle(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Remove example 2"]')!
      .click()
  );
  expect(currentBehavior.examples).toHaveLength(4);
  expect(currentBehavior.examples[0].user).toBe("今天好累");
  expect(add().disabled).toBe(false);
});

it("identifies incomplete messages and clears feedback when the pair is completed", async () => {
  await settle(() =>
    root.render(
      <Probe
        initial={{
          ...DEFAULT_COMPANION_BEHAVIOR,
          examples: [{ user: "你好", assistant: "" }],
        }}
        behaviorError
      />
    )
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Complete both messages"
  );
  expect(
    container
      .querySelector("#behavior-example-0-user")
      ?.getAttribute("aria-invalid")
  ).toBe("false");
  const missing = container.querySelector("#behavior-example-0-assistant")!;
  expect(missing.getAttribute("aria-invalid")).toBe("true");
  expect(missing.getAttribute("aria-describedby")).toContain(
    "behavior-examples-error"
  );
  await fill("behavior-example-0-assistant", "你好呀");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("disables style selection and example additions during submission", async () => {
  await settle(() => root.render(<Probe isPending />));
  for (const trigger of Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')
  ))
    expect(trigger.disabled).toBe(true);
  const add = Array.from(container.querySelectorAll("button")).find(
    button => button.textContent === "Add example"
  )!;
  expect(add.disabled).toBe(true);
  await settle(() => add.click());
  expect(currentBehavior.examples).toHaveLength(0);
});
