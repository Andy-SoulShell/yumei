// @vitest-environment jsdom
/** 覆盖横竖屏、图片展开和向上阅读历史时的滚动意图。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatScrollAnchor } from "./useChatScrollAnchor";

let root: Root;
let container: HTMLDivElement;
let viewport: HTMLDivElement;
let content: HTMLDivElement;
let notify: () => void;
let dimensions: {
  width: number;
  height: number;
  contentHeight: number;
  top: number;
};
const disconnect = vi.fn();
const observe = vi.fn();

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  dimensions = { width: 800, height: 300, contentHeight: 1200, top: 900 };
  viewport = document.createElement("div");
  content = document.createElement("div");
  viewport.append(content);
  container = document.createElement("div");
  document.body.append(viewport, container);
  Object.defineProperties(viewport, {
    clientWidth: { get: () => dimensions.width },
    clientHeight: { get: () => dimensions.height },
    scrollHeight: { get: () => dimensions.contentHeight },
    scrollTop: {
      get: () => dimensions.top,
      set: (value: number) => {
        dimensions.top = Math.min(
          value,
          dimensions.contentHeight - dimensions.height
        );
      },
    },
  });
  disconnect.mockClear();
  observe.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
  const viewportRef = { current: viewport };
  const contentRef = { current: content };
  function Probe() {
    useChatScrollAnchor(viewportRef, contentRef);
    return null;
  }
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  viewport.remove();
  container.remove();
  vi.unstubAllGlobals();
});

describe("聊天滚动位置", () => {
  it("停在最新消息时，横竖屏或键盘改变尺寸后继续贴住末尾", () => {
    dimensions.width = 320;
    dimensions.height = 200;
    dimensions.contentHeight = 2400;
    viewport.dispatchEvent(new Event("scroll"));
    notify();
    expect(dimensions.top).toBe(2200);
  });

  it("用户向上查看历史时，窗口变化不会强行跳到末尾", () => {
    dimensions.top = 400;
    viewport.dispatchEvent(new Event("scroll"));
    dimensions.height = 200;
    notify();
    expect(dimensions.top).toBe(400);
  });

  it("图片加载改变内容高度时，同样保持最新消息可见", () => {
    expect(observe).toHaveBeenCalledWith(viewport);
    expect(observe).toHaveBeenCalledWith(content);
    dimensions.contentHeight = 2000;
    viewport.dispatchEvent(new Event("scroll"));
    notify();
    expect(dimensions.top).toBe(1700);
  });

  it("离开聊天后停止观察布局", async () => {
    await act(async () => root.render(null));
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
