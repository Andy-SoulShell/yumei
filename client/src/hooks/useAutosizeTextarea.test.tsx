// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAutosizeTextarea } from "./useAutosizeTextarea";
it("resizes on the next frame after a width change and cancels pending work on unmount", () => {
  let notify: () => void = () => {};
  let next: FrameRequestCallback | undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  const cancel = vi.fn();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((fn: FrameRequestCallback) => {
      next = fn;
      return 3;
    })
  );
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const textarea = document.createElement("textarea");
  let width = 300,
    height = 48;
  Object.defineProperties(textarea, {
    clientWidth: { get: () => width },
    scrollHeight: { get: () => height },
  });
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Harness() {
    useAutosizeTextarea({ current: textarea }, "draft");
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    expect(textarea.style.height).toBe("48px");
    width = 200;
    height = 96;
    notify();
    expect(textarea.style.height).toBe("48px");
    expect(next).toBeTypeOf("function");
    next!(0);
    expect(textarea.style.height).toBe("96px");
    width = 100;
    notify();
    act(() => root.unmount());
    expect(cancel).toHaveBeenLastCalledWith(3);
  } finally {
    node.remove();
    vi.unstubAllGlobals();
  }
});
