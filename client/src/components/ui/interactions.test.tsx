// @vitest-environment jsdom
/** 验证组合控件的输入法、独立操作、日期序列化与录音取消行为。 */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchSelect } from "./search-select";
import { DatePicker } from "./date-picker";
import { Button } from "./button";
import { VoiceRecordButton } from "../VoiceRecordButton";

let root: Root;
let container: HTMLDivElement;
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
/** 让 Radix 的异步焦点转移完成后再断言。 */
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}
async function render(node: ReactNode) {
  await settle(() => root.render(node));
}
async function key(node: Element, value: string) {
  await settle(() =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      })
    )
  );
}

const choose = vi.fn();
const action = vi.fn();
/** 搜索由外层控制，模拟设置页面在筛选后仍保留业务标识。 */
function Picker() {
  const [search, setSearch] = useState("");
  return (
    <SearchSelect
      value="a"
      label="选择模型"
      placeholder="搜索模型"
      emptyText="没有结果"
      search={search}
      onSearchChange={setSearch}
      onValueChange={choose}
      options={[
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]}
      renderActions={id => (
        <Button type="button" onClick={() => action(id)}>
          试听
        </Button>
      )}
    />
  );
}

describe("搜索选择器", () => {
  beforeEach(() => {
    choose.mockReset();
    action.mockReset();
  });
  it("方向键选择并把焦点归还触发器", async () => {
    await render(<Picker />);
    const trigger = container.querySelector("button")!;
    await settle(() => trigger.click());
    const input = document.querySelector("[cmdk-input]")!;
    await key(input, "ArrowDown");
    await key(input, "Enter");
    expect(choose).toHaveBeenCalledWith("b");
    expect(document.querySelector("[cmdk-input]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("试听是独立操作，不选中条目或嵌套按钮", async () => {
    await render(<Picker />);
    await settle(() => container.querySelector("button")!.click());
    const preview = Array.from(document.querySelectorAll("button")).find(
      button => button.textContent === "试听"
    )!;
    await settle(() => preview.click());
    expect(action).toHaveBeenCalledWith("a");
    expect(choose).not.toHaveBeenCalled();
    expect(
      document.querySelector("button button, [role=option] button")
    ).toBeNull();
    expect(document.querySelector("[cmdk-input]")).not.toBeNull();
  });
  it("中文选词和刚结束组合的 Enter、Escape 不会误选择或关闭", async () => {
    await render(<Picker />);
    await settle(() => container.querySelector("button")!.click());
    const input = document.querySelector("[cmdk-input]")!;
    await settle(() =>
      input.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true })
      )
    );
    await key(input, "Enter");
    await key(input, "Escape");
    expect(choose).not.toHaveBeenCalled();
    expect(document.querySelector("[cmdk-input]")).not.toBeNull();
    await settle(() =>
      input.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true })
      )
    );
    await key(input, "Enter");
    expect(choose).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 170));
    });
    await key(input, "Enter");
    expect(choose).toHaveBeenCalledWith("a");
  });
});

it("日历在本地时区输出 yyyy-MM-dd，并使用公共年月选择器", async () => {
  const change = vi.fn();
  await render(
    <DatePicker
      value="1990-01-01"
      onValueChange={change}
      label="出生日期"
      maxDate={new Date(2026, 9, 19)}
    />
  );
  await settle(() => container.querySelector("button")!.click());
  const day = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button[data-day]")
  ).find(
    button => button.dataset.day === new Date(1990, 0, 15).toLocaleDateString()
  )!;
  expect(day).toBeDefined();
  expect(document.querySelectorAll('button[role="combobox"]').length).toBe(2);
  expect(document.querySelector('input[type="date"]')).toBeNull();
  await settle(() => day.click());
  expect(change).toHaveBeenCalledWith("1990-01-15");
});

describe("录音按钮", () => {
  const start = vi.fn(),
    end = vi.fn(),
    cancel = vi.fn();
  beforeEach(async () => {
    start.mockReset();
    end.mockReset();
    cancel.mockReset();
    await render(
      <VoiceRecordButton
        isRecording
        duration={2}
        isTranscribing={false}
        onStart={start}
        onEnd={end}
        onCancel={cancel}
      />
    );
  });
  it("键盘按住开始、松开发送，重复按键不会重复开始", async () => {
    const button = container.querySelector("button")!;
    await key(button, " ");
    await key(button, " ");
    await settle(() =>
      button.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", bubbles: true })
      )
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
  it("Escape 取消，不会在随后松开时发送", async () => {
    const button = container.querySelector("button")!;
    await key(button, "Enter");
    await key(button, "Escape");
    await settle(() =>
      button.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", bubbles: true })
      )
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });
  it("系统中断指针时取消，指针捕获绑定在公共按钮上", async () => {
    const button = container.querySelector("button")!;
    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(event, {
      pointerId: 7,
      clientY: 100,
      pointerType: "touch",
      button: 0,
    });
    await settle(() => button.querySelector("span")!.dispatchEvent(event));
    expect(button.setPointerCapture).toHaveBeenCalledWith(7);
    await settle(() =>
      button.dispatchEvent(new Event("pointercancel", { bubbles: true }))
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });
});
