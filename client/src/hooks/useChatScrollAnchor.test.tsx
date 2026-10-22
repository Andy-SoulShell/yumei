// @vitest-environment jsdom
/** 覆盖横竖屏、图片展开和向上阅读历史时的滚动意图。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_NAVIGATE_EVENT,
  useChatScrollAnchor,
} from "./useChatScrollAnchor";

let root: Root;
let container: HTMLDivElement;
let viewport: HTMLDivElement;
let content: HTMLDivElement;
let notify: () => void;
let render: (scope: number) => Promise<void>;
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
      configurable: true,
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
  function Probe({ scope }: { scope: number }) {
    useChatScrollAnchor(viewportRef, contentRef, scope);
    return null;
  }
  root = createRoot(container);
  render = async scope => {
    await act(async () => root.render(<Probe scope={scope} />));
  };
  await render(1);
});

afterEach(async () => {
  await act(async () => root.unmount());
  viewport.remove();
  container.remove();
  vi.unstubAllGlobals();
});

describe("聊天滚动位置", () => {
  it("引用跳转先解除末尾跟随，补取历史和新回复不会拉回底部", () => {
    viewport.dispatchEvent(new Event(CHAT_NAVIGATE_EVENT));
    dimensions.contentHeight += 200;
    notify();
    expect(dimensions.top).toBe(900);
    dimensions.top = 200;
    viewport.dispatchEvent(new Event("scroll"));
    dimensions.contentHeight += 100;
    notify();
    expect(dimensions.top).toBe(200);
  });
  it("分页补偿在末尾重新跟随后，实际跳转再次解除跟随", () => {
    viewport.dispatchEvent(new Event(CHAT_NAVIGATE_EVENT));
    dimensions.contentHeight += 200;
    dimensions.top = dimensions.contentHeight - dimensions.height;
    notify();
    viewport.dispatchEvent(new Event("scroll"));
    viewport.dispatchEvent(new Event(CHAT_NAVIGATE_EVENT));
    dimensions.top = 200;
    dimensions.height -= 50;
    notify();
    expect(dimensions.top).toBe(200);
  });
  it("向上滑动与回复增高同帧发生时，不抢回末尾", () => {
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -80 }));
    dimensions.top = 820;
    dimensions.contentHeight = 1300;
    viewport.dispatchEvent(new Event("scroll"));
    notify();
    expect(dimensions.top).toBe(820);
  });

  it("触摸上翻的惯性滚动期间，消息变化不打断阅读", () => {
    const touch = (name: string, y: number) => {
      const event = new Event(name);
      Object.defineProperty(event, "touches", { value: [{ clientY: y }] });
      viewport.dispatchEvent(event);
    };
    touch("touchstart", 200);
    touch("touchmove", 240);
    viewport.dispatchEvent(new Event("touchend"));
    dimensions.top = 880;
    viewport.dispatchEvent(new Event("scroll"));
    dimensions.contentHeight = 1400;
    notify();
    expect(dimensions.top).toBe(880);
  });

  it("布局未改变末尾位置时不重复写入 scrollTop", () => {
    const setter = vi.spyOn(viewport, "scrollTop", "set");
    notify();
    expect(setter).not.toHaveBeenCalled();
  });

  it("回到末尾后恢复跟随，新回复保持可见", () => {
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -80 }));
    dimensions.top = 400;
    viewport.dispatchEvent(new Event("scroll"));
    dimensions.top = 900;
    viewport.dispatchEvent(new Event("scroll"));
    dimensions.contentHeight = 1500;
    notify();
    expect(dimensions.top).toBe(1200);
  });

  it("捏合滚轮缩放和轻触不解除末尾跟随，也不阻止浏览器手势", () => {
    const wheel = new WheelEvent("wheel", {
      deltaY: -80,
      ctrlKey: true,
      cancelable: true,
    });
    viewport.dispatchEvent(wheel);
    const touch = new Event("touchstart", { cancelable: true });
    Object.defineProperty(touch, "touches", { value: [{ clientY: 200 }] });
    viewport.dispatchEvent(touch);
    const jitter = new Event("touchmove", { cancelable: true });
    Object.defineProperty(jitter, "touches", { value: [{ clientY: 203 }] });
    viewport.dispatchEvent(jitter);
    viewport.dispatchEvent(new Event("touchend"));
    dimensions.contentHeight = 1300;
    notify();
    expect(dimensions.top).toBe(1000);
    expect(wheel.defaultPrevented).toBe(false);
    expect(touch.defaultPrevented).toBe(false);
  });
  it("初次进入已有长记录的会话时定位到末尾", async () => {
    await act(async () => root.render(null));
    dimensions.top = 0;
    await render(1);
    expect(dimensions.top).toBe(900);
  });

  it("切换会话时重新定位末尾，不继承另一会话的历史阅读状态", async () => {
    dimensions.top = 400;
    viewport.dispatchEvent(new Event("scroll"));
    await render(2);
    expect(dimensions.top).toBe(900);
  });
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
