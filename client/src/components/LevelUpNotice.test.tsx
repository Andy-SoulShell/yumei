// @vitest-environment jsdom
/** 输入期间的重渲染不应延长升级提示，也不应创建全屏覆盖层。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LevelUpNotice } from "./LevelUpNotice";
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
it("dismisses on schedule despite typing rerenders and keeps input focused", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const host = document.createElement("div");
  const input = document.createElement("textarea");
  document.body.append(host, input);
  const root = createRoot(host);
  const close = vi.fn();
  const render = () =>
    act(async () =>
      root.render(<LevelUpNotice show newLevel={4} onClose={() => close()} />)
    );
  try {
    input.focus();
    await render();
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('[role="dialog"], .fixed')).toBeNull();
    expect(document.activeElement).toBe(input);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await render();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(input);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    input.remove();
    vi.useRealTimers();
  }
});
