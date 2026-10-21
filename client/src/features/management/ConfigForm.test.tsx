// @vitest-environment jsdom
/** 管理控件修改同一份草稿：颜色双向同步、固定色卡与数组排序。 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { themesConfigSchema, productConfigSchema } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { ThemeEditor } from "./ThemeEditor";
let root: Root, container: HTMLDivElement;
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
  vi.unstubAllGlobals();
});
async function change(
  element: HTMLInputElement | HTMLSelectElement,
  value: string
) {
  await act(async () => {
    const proto =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(trigger: HTMLElement, label: string) {
  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  const option = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]')
  ).find(item => item.textContent?.includes(label))!;
  expect(option).toBeTruthy();
  await act(async () =>
    option.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
}
it("synchronizes the color picker, hex input and preview while keeping invalid text editable", async () => {
  let color = "";
  function Probe() {
    const [value, setValue] = useState("#123456");
    color = value;
    return (
      <ConfigForm
        value={value}
        path="theme.light"
        schema={{ type: "string", pattern: "^#[0-9a-fA-F]{6}$" }}
        onChange={next => setValue(String(next))}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  const picker = container.querySelector<HTMLInputElement>(
      'input[type="color"]'
    )!,
    text = container.querySelector<HTMLInputElement>(
      'input:not([type="color"])'
    )!;
  await change(picker, "#abcdef");
  expect(color).toBe("#abcdef");
  expect(text.value).toBe("#abcdef");
  await change(text, "#654321");
  expect(picker.value).toBe("#654321");
  await change(text, "#bad");
  expect(color).toBe("#bad");
  expect(text.getAttribute("aria-invalid")).toBe("true");
});
it("offers role references by label, retains the ID and reorders the same array", async () => {
  let value = ["one", "two"];
  function Probe() {
    const [ids, setIds] = useState(value);
    value = ids;
    return (
      <ConfigForm
        value={ids}
        path="home.featuredIds"
        schema={{ type: "array", items: { type: "string" } }}
        choices={() => [
          { value: "one", label: "小桃 · one" },
          { value: "two", label: "凛 · two" },
        ]}
        onChange={next => setIds(next as string[])}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  expect(container.querySelector('[role="combobox"]')!.textContent).toContain(
    "小桃"
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="home.featuredIds 第 1 项下移"]'
      )!
      .click()
  );
  expect(value).toEqual(["two", "one"]);
  await choose(container.querySelector('[role="combobox"]')!, "小桃");
  expect(value[0]).toBe("one");
});
it("previews the draft theme and edits the fixed three-color palette without array deletion", async () => {
  let value = structuredClone(productFixture.themes);
  const schema = z.toJSONSchema(themesConfigSchema, {
    unrepresentable: "any",
  }) as FormSchema;
  function Probe() {
    const [themes, setThemes] = useState(value);
    value = themes;
    return (
      <ThemeEditor
        value={themes}
        schema={schema}
        disabled={false}
        onChange={setThemes}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  expect(
    container.querySelector('[aria-label="主题明暗预览"]')!.textContent
  ).toContain("深色预览");
  expect(container.querySelectorAll('input[type="color"]')).toHaveLength(8);
  expect(
    container.querySelector('[aria-label="浅色背景 颜色选择器"]')
  ).not.toBeNull();
  expect(
    container.querySelectorAll('[aria-label="浅色主色 颜色选择器"]')
  ).toHaveLength(1);
  expect(
    container.querySelector('[aria-label^="删除 themes.items.0.colors"]')
  ).toBeNull();
  const first = container.querySelector<HTMLInputElement>(
    'input[type="color"]'
  )!;
  await change(first, "#336699");
  expect(value.items[0].colors[0]).toBe("#336699");
  expect(container.querySelector('[aria-pressed="true"]')!.innerHTML).toContain(
    "rgb(51, 102, 153)"
  );
});

it("adds and removes workflow record entries while keeping fixed object fields", async () => {
  let value: Record<string, { class_type: string }> = {
    encoder: { class_type: "TextEncoder" },
  };
  function Probe() {
    const [nodes, setNodes] = useState(value);
    value = nodes;
    return (
      <ConfigForm
        value={nodes}
        path="models.image.workflows.text.nodes"
        schema={{
          type: "object",
          additionalProperties: {
            type: "object",
            properties: { class_type: { type: "string" } },
          },
        }}
        onChange={next => setNodes(next as typeof nodes)}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  expect(container.querySelectorAll('[aria-label^="删除 "]')).toHaveLength(1);
  await change(
    container.querySelector('input[placeholder="新标识"]')!,
    "sampler"
  );
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent === "添加")!
      .click()
  );
  expect(value.sampler).toEqual({ class_type: "" });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="删除 models.image.workflows.text.nodes.sampler"]'
      )!
      .click()
  );
  expect(value).toEqual({ encoder: { class_type: "TextEncoder" } });
});

it("changes duration display units without changing the draft and never turns an empty value into zero", async () => {
  let value = 1500;
  function Probe() {
    const [duration, setDuration] = useState(value);
    value = duration;
    return (
      <ConfigForm
        path="runtime.chat.replyTimeoutMs"
        value={duration}
        schema={{ type: "integer", minimum: 100, maximum: 300000 }}
        onChange={next => setDuration(next as number)}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  const input = container.querySelector<HTMLInputElement>(
    'input[type="number"]'
  )!;
  expect(input.value).toBe("1.5");
  expect(container.textContent).toContain("最多 300 秒");
  await change(container.querySelector("select")!, "1");
  expect(value).toBe(1500);
  expect(input.value).toBe("1500");
  await change(input, "300001");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(value).toBe(300001);
  await change(input, "");
  expect(value).toBeNaN();
  expect(container.textContent).toContain("请填写有效数值");
});

it("uses a local clock for quiet hours and keeps the stored minute value", async () => {
  let value = 1380;
  function Probe() {
    const [minute, setMinute] = useState(value);
    value = minute;
    return (
      <ConfigForm
        path="proactive.defaults.quietStart"
        value={minute}
        schema={{ type: "integer", minimum: 0, maximum: 1439 }}
        onChange={next => setMinute(next as number)}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  const input =
    container.querySelector<HTMLInputElement>('input[type="time"]')!;
  expect(input.value).toBe("23:00");
  await change(input, "06:30");
  expect(value).toBe(390);
  expect(container.textContent).toContain("支持跨午夜");
});

it("offers constrained format checkboxes and retains at least one allowed upload type", async () => {
  let value = ["image/jpeg"];
  const schema = (
    z.toJSONSchema(productConfigSchema, {
      unrepresentable: "any",
    }) as FormSchema
  ).properties!.uploads.properties!.avatar.properties!.mimeTypes;
  function Probe() {
    const [formats, setFormats] = useState(value);
    value = formats;
    return (
      <ConfigForm
        path="uploads.avatar.mimeTypes"
        value={formats}
        schema={schema}
        onChange={next => setFormats(next as string[])}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  const boxes =
    container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
  expect(boxes).toHaveLength(4);
  expect(boxes[0].disabled).toBe(true);
  await act(async () => boxes[1].click());
  expect(value).toEqual(["image/jpeg", "image/png"]);
  expect(boxes[0].disabled).toBe(false);
  await act(async () => boxes[0].click());
  expect(value).toEqual(["image/png"]);
});

it("preserves numeric enum values rather than sending strings", async () => {
  let value = 1;
  function Probe() {
    const [speed, setSpeed] = useState(value);
    value = speed;
    return (
      <ConfigForm
        path="experience.playback.defaultSpeed"
        value={speed}
        schema={{ type: "number", enum: [1, 1.5, 2] }}
        onChange={next => setSpeed(next as number)}
      />
    );
  }
  await act(async () => root.render(<Probe />));
  await choose(container.querySelector('[role="combobox"]')!, "1.5");
  expect(value).toBe(1.5);
});
