// @vitest-environment jsdom
/** 消息操作覆盖点击、长按、滚动取消和引用后的输入焦点。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { ChatMessageMenu } from "./ChatMessageMenu";

const copy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/copyText", () => ({ copyText: copy }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let root: Root;
let container: HTMLDivElement;
const quote = vi.fn();
const speak = vi.fn();
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  copy.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <ChatMessageMenu
        content={"第一句。\n第二句。"}
        author="小雨"
        messageId={12}
        t={i18n.getFixedT("zh-CN") as Translator}
        isPlaying={false}
        audioLabel="朗读"
        onSpeak={speak}
        onQuote={quote}
      >
        <p>第一句。第二句。</p>
        <button type="button" data-photo>
          照片
        </button>
      </ChatMessageMenu>
    )
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function pointer(
  type: string,
  x = 20,
  y = 20,
  target: Element = container.querySelector("p")!
) {
  await act(async () => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, {
      pointerType: { value: "touch" },
      isPrimary: { value: true },
    });
    target.dispatchEvent(event);
  });
}
async function openMenu() {
  await act(async () =>
    container
      .querySelector('[aria-label="消息操作"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      )
  );
}
const menuItem = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    item => item.textContent === label
  )!;

it("opens by keyboard and copies the complete message across segments", async () => {
  await openMenu();
  await act(async () => menuItem("复制文字").click());
  expect(copy).toHaveBeenCalledWith("第一句。\n第二句。");
});
it("opens after a stationary long press and leaves text unsent", async () => {
  await pointer("pointerdown");
  await act(async () => vi.advanceTimersByTime(499));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await act(async () => vi.advanceTimersByTime(1));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(quote).not.toHaveBeenCalled();
});
it("keeps a touch-opened menu after the opening finger is released", async () => {
  await pointer("pointerdown");
  await act(async () => vi.advanceTimersByTime(500));
  await pointer("pointerup");
  await act(async () => document.body.click());
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
});
it.each(["pointermove", "pointercancel", "pointerup"])(
  "cancels long press on %s so scrolling or tapping does not open a menu",
  async type => {
    await pointer("pointerdown");
    await pointer(type, 20, 55);
    await act(async () => vi.advanceTimersByTime(600));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  }
);
it("does not intercept a long press on a photo or another button", async () => {
  await pointer(
    "pointerdown",
    20,
    20,
    container.querySelector("[data-photo]")!
  );
  await act(async () => vi.advanceTimersByTime(600));
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
it("quotes the whole message with its author and does not steal restored input focus", async () => {
  const field = document.createElement("textarea");
  document.body.append(field);
  quote.mockImplementation(() => field.focus());
  await openMenu();
  await act(async () => menuItem("引用到草稿").click());
  await act(async () => vi.runOnlyPendingTimers());
  expect(quote).toHaveBeenCalledWith("第一句。\n第二句。", "小雨", 12);
  expect(document.activeElement).toBe(field);
  field.remove();
});
it("retains the direct audio action and exposes it in the menu", async () => {
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="朗读"]')!.click()
  );
  await openMenu();
  await act(async () => menuItem("朗读").click());
  expect(speak).toHaveBeenCalledTimes(2);
});
