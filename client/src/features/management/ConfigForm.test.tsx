// @vitest-environment jsdom
/** 管理控件修改同一份草稿：颜色双向同步、固定色卡与数组排序。 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { themesConfigSchema } from "@shared/productConfig";
import { productFixture } from "../../../../server/testProductConfig";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { ThemeEditor } from "./ThemeEditor";
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
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
  expect(container.querySelector("select")!.textContent).toContain("小桃");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="home.featuredIds 第 1 项下移"]'
      )!
      .click()
  );
  expect(value).toEqual(["two", "one"]);
  await change(container.querySelector("select")!, "one");
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
