// @vitest-environment jsdom
/** 复制兼容局域网 HTTP，并在失败时清理临时字段、恢复输入焦点。 */
import { afterEach, expect, it, vi } from "vitest";
import { copyText } from "./copyText";

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard"
);
const originalExec = Object.getOwnPropertyDescriptor(document, "execCommand");
afterEach(() => {
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (originalExec)
    Object.defineProperty(document, "execCommand", originalExec);
  else Reflect.deleteProperty(document, "execCommand");
  document.body.replaceChildren();
});

it("copies the whole text through Clipboard API", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  await copyText("第一行\n第二行");
  expect(writeText).toHaveBeenCalledWith("第一行\n第二行");
});

it.each([false, true])(
  "falls back on HTTP or permission refusal and restores the focused field (%s)",
  async denied => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: denied
        ? { writeText: vi.fn().mockRejectedValue(new Error("denied")) }
        : undefined,
    });
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    const exec = vi.fn(() => {
      expect(document.querySelector("textarea")?.value).toBe("完整消息");
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: exec,
    });
    await copyText("完整消息");
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(field);
  }
);

it("reports a failed fallback and still removes its temporary field", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: () => false,
  });
  await expect(copyText("未复制")).rejects.toThrow("Copy unavailable");
  expect(document.querySelector("textarea")).toBeNull();
});
