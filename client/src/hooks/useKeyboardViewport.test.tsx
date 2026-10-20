// @vitest-environment jsdom
/** 验证视觉视口、输入焦点和缩放之间的交互，避免软键盘遮挡与高度残留。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardViewport } from "./useKeyboardViewport";

let root: Root;
let container: HTMLDivElement;
let viewport: EventTarget & {
  height: number;
  scale: number;
  offsetTop: number;
};

function Form() {
  useKeyboardViewport();
  return <input aria-label="消息" />;
}

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  viewport = Object.assign(new EventTarget(), {
    height: 800,
    scale: 1,
    offsetTop: 0,
  });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 800);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Form />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const height = () =>
  document.documentElement.style.getPropertyValue("--keyboard-viewport-height");
const top = () =>
  document.documentElement.style.getPropertyValue("--keyboard-viewport-top");
function resize(value: number, scale = 1) {
  viewport.height = value;
  viewport.scale = scale;
  viewport.dispatchEvent(new Event("resize"));
}

describe("软键盘视觉视口", () => {
  it("输入时跟随视觉视口缩小，键盘关闭后恢复 CSS 的正常高度", () => {
    container.querySelector("input")!.focus();
    resize(480.4);
    expect(height()).toBe("480px");
    expect(top()).toBe("0px");
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(
      true
    );
    resize(800);
    expect(height()).toBe("");
    expect(top()).toBe("");
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(
      false
    );
  });

  it("视觉视口平移而高度不变时，仍跟随键盘上方的可见区域", () => {
    container.querySelector("input")!.focus();
    resize(480);
    viewport.offsetTop = 110.4;
    viewport.dispatchEvent(new Event("scroll"));
    expect(height()).toBe("480px");
    expect(top()).toBe("110px");
    viewport.offsetTop = -12;
    viewport.dispatchEvent(new Event("scroll"));
    expect(top()).toBe("0px");
  });

  it("没有输入焦点时不把窗口变化当成软键盘，失焦也清除临时高度", () => {
    resize(450);
    expect(height()).toBe("");
    const input = container.querySelector("input")!;
    input.focus();
    expect(height()).toBe("450px");
    input.blur();
    expect(height()).toBe("");
    expect(top()).toBe("");
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(
      false
    );
  });

  it("工具栏的小幅变化和捏合缩放沿用浏览器布局", () => {
    container.querySelector("input")!.focus();
    resize(730);
    expect(height()).toBe("");
    resize(400, 2);
    expect(height()).toBe("");
    expect(top()).toBe("");
  });

  it("卸载后释放事件和高度，后续视口事件不会影响其他页面", async () => {
    container.querySelector("input")!.focus();
    resize(450);
    expect(height()).toBe("450px");
    await act(async () => root.render(null));
    expect(height()).toBe("");
    expect(top()).toBe("");
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(
      false
    );
    resize(420);
    viewport.offsetTop = 100;
    viewport.dispatchEvent(new Event("scroll"));
    expect(height()).toBe("");
    expect(top()).toBe("");
  });
});
