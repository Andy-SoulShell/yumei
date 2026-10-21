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
  return (
    <>
      <input aria-label="消息" />
      <input type="checkbox" />
    </>
  );
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
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
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
  it("桌面用户调整窗口高度时，不把仍有焦点的输入框当作键盘", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    container.querySelector("input")!.focus();
    vi.stubGlobal("innerHeight", 480);
    resize(480);
    expect(height()).toBe("");
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(
      false
    );
  });
  it("安卓同时缩小布局与视觉视口时也识别键盘，返回键收起后恢复", () => {
    container.querySelector("input")!.focus();
    vi.stubGlobal("innerHeight", 480);
    resize(480);
    window.dispatchEvent(new Event("resize"));
    expect(height()).toBe("480px");
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(
      true
    );
    vi.stubGlobal("innerHeight", 800);
    resize(800);
    expect(height()).toBe("");
  });

  it("键盘关闭动画中切换输入框不丢失原来的布局高度", () => {
    const input = container.querySelector("input")!;
    input.focus();
    vi.stubGlobal("innerHeight", 480);
    resize(480);
    input.blur();
    expect(height()).toBe("");
    viewport.dispatchEvent(new Event("resize"));
    input.focus();
    expect(height()).toBe("480px");
  });

  it("横屏后重新记录布局基线，工具栏变化和复选框不触发键盘模式", () => {
    vi.stubGlobal("innerWidth", 844);
    vi.stubGlobal("innerHeight", 390);
    resize(390);
    container.querySelector("input")!.focus();
    resize(330);
    expect(height()).toBe("");
    container
      .querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .focus();
    resize(200);
    expect(height()).toBe("");
  });
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
