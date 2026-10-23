// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MemoryChatNotice } from "./MemoryChatNotice";
const mock = vi.hoisted(() => ({ search: "", navigate: vi.fn() }));
vi.mock("wouter", () => ({
  useLocation: () => ["/chat/81", mock.navigate],
  useSearch: () => mock.search,
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
it("only shows for a memory return and dismisses without changing other parameters or the chat draft", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryChatNotice />));
    expect(container.textContent).toBe("");
    mock.search = "memoryUpdated=1&keep=topic";
    await act(async () => root.render(<MemoryChatNotice />));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "memoryFlow:handoff"
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button")!.click()
    );
    expect(mock.navigate).toHaveBeenCalledExactlyOnceWith(
      "/chat/81?keep=topic",
      { replace: true }
    );
    expect(container.querySelector("textarea")).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
