// @vitest-environment jsdom
/** 草稿恢复、账号/会话隔离、发送清理和浏览器存储受限的回归。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useChatInputDraft } from "./useChatInputDraft";
import { clearChatStreamDrafts } from "@/lib/chatStreamDrafts";
let root: Root;
let account = "a";
let conversation = 1;
let maxChars = 12000;
let draft: ReturnType<typeof useChatInputDraft>;
function Probe() {
  draft = useChatInputDraft(account, conversation, maxChars);
  return null;
}
const render = () => act(async () => root.render(<Probe />));
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  account = "a";
  conversation = 1;
  maxChars = 12000;
  root = createRoot(document.createElement("div"));
});
it("preserves long configured input on remount and applies updated published limits to edits", async () => {
  await render();
  const text = "长".repeat(9000);
  await act(async () => draft[1](text));
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  expect(draft[0]).toBe(text);
  maxChars = 5;
  await render();
  expect(draft[0]).toBe(text);
  await act(async () => draft[1]("新修改内容超出五字"));
  expect(draft[0]).toBe("新修改内容");
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
});
it("restores input after remount and clears it after submission", async () => {
  await render();
  await act(async () => draft[1]("尚未发送"));
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  expect(draft[0]).toBe("尚未发送");
  await act(async () => draft[1](""));
  expect(sessionStorage.length).toBe(0);
});
it("keeps conversations and accounts isolated, and clears private input on logout", async () => {
  await render();
  await act(async () => draft[1]("账号 a 会话 1"));
  conversation = 2;
  await render();
  expect(draft[0]).toBe("");
  await act(async () => draft[1]("账号 a 会话 2"));
  account = "b";
  await render();
  expect(draft[0]).toBe("");
  account = "a";
  conversation = 1;
  await render();
  expect(draft[0]).toBe("账号 a 会话 1");
  clearChatStreamDrafts();
  expect(sessionStorage.length).toBe(0);
});
it("still edits and clears text when session storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "QuotaExceededError");
  });
  await render();
  await act(async () => draft[1]("仍能输入"));
  expect(draft[0]).toBe("仍能输入");
  await act(async () => draft[1](current => `${current}和补充`));
  expect(draft[0]).toBe("仍能输入和补充");
  await act(async () => draft[1](""));
  expect(draft[0]).toBe("");
});
