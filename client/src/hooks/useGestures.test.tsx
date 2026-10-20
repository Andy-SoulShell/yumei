// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePullToRefresh, useSwipeBack } from "./useGestures";
const { back } = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("./usePageBack", () => ({ usePageBack: () => back }));
let root: Root, main: HTMLDivElement;
let state: ReturnType<typeof usePullToRefresh>;
const refresh = vi.fn();
function Harness() {
  state = usePullToRefresh({ onRefresh: () => refresh() });
  useSwipeBack();
  return null;
}
function touch(type: string, x: number, y: number, target: Element = main) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", {
    value:
      type === "touchend" || type === "touchcancel"
        ? []
        : [{ clientX: x, clientY: y }],
  });
  act(() => {
    target.dispatchEvent(event);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  main = document.createElement("div");
  main.className = "app-main";
  document.body.append(main);
  const node = document.createElement("div");
  main.append(node);
  root = createRoot(node);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  main.remove();
  document.querySelector("[role=dialog]")?.remove();
});
it("only pulls from the top of the actual scroll container", async () => {
  main.scrollTop = 100;
  touch("touchstart", 100, 100);
  touch("touchmove", 100, 350);
  touch("touchend", 100, 350);
  expect(refresh).not.toHaveBeenCalled();
  expect(state.pullDistance).toBe(0);
  main.scrollTop = 0;
  touch("touchstart", 100, 100);
  touch("touchmove", 100, 350);
  expect(state.pullDistance).toBe(100);
  await act(async () => touch("touchend", 100, 350));
  expect(refresh).toHaveBeenCalledOnce();
});
it("cancels a pull and does not reuse its distance on the next touch", () => {
  touch("touchstart", 100, 100);
  touch("touchmove", 100, 350);
  touch("touchcancel", 100, 350);
  touch("touchstart", 100, 100);
  touch("touchend", 100, 100);
  expect(refresh).not.toHaveBeenCalled();
  expect(state.pullDistance).toBe(0);
});
it("does not navigate from a modal, interactive control, or a cancelled edge swipe", () => {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  touch("touchstart", 10, 100);
  touch("touchmove", 160, 100);
  touch("touchend", 160, 100);
  expect(back).not.toHaveBeenCalled();
  dialog.remove();
  const button = document.createElement("button");
  main.append(button);
  touch("touchstart", 10, 100, button);
  touch("touchmove", 160, 100, button);
  touch("touchend", 160, 100, button);
  expect(back).not.toHaveBeenCalled();
  touch("touchstart", 10, 100);
  touch("touchmove", 160, 100);
  touch("touchcancel", 160, 100);
  touch("touchstart", 10, 100);
  touch("touchend", 10, 100);
  expect(back).not.toHaveBeenCalled();
  touch("touchstart", 10, 100);
  touch("touchmove", 160, 100);
  touch("touchend", 160, 100);
  expect(back).toHaveBeenCalledOnce();
});
