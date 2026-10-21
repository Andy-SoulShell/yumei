// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAutosizeTextarea } from "./useAutosizeTextarea";
it("追加文字未换行时不重置高度，换行和删除时仍正确伸缩", () => {
  const textarea = document.createElement("textarea");
  let height = 44;
  Object.defineProperties(textarea, {
    clientHeight: { get: () => Number.parseFloat(textarea.style.height) || 44 },
    scrollHeight: { get: () => height },
  });
  const ref = { current: textarea };
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Harness({ value }: { value: string }) {
    useAutosizeTextarea(ref, value);
    return null;
  }
  try {
    act(() => root.render(<Harness value="原文" />));
    const writes = vi.spyOn(textarea.style, "height", "set");
    act(() => root.render(<Harness value="原文继续输入" />));
    expect(writes).not.toHaveBeenCalled();
    height = 68;
    act(() => root.render(<Harness value="原文继续输入并换行" />));
    expect(writes.mock.calls).toEqual([["68px"]]);
    height = 44;
    act(() => root.render(<Harness value="原" />));
    expect(textarea.style.height).toBe("44px");
    writes.mockRestore();
  } finally {
    act(() => root.unmount());
    node.remove();
  }
});
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
