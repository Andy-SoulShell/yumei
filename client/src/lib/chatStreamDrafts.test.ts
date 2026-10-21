// @vitest-environment jsdom
/** 未确认送达的草稿按账号隔离，退出清理不影响其他应用存储。 */
import { beforeEach, expect, it } from "vitest";
import { CHAT_INPUT_CAPACITY } from "@shared/const";
import {
  chatStreamDraftKey,
  clearChatStreamDrafts,
  readChatStreamDrafts,
  updateChatStreamDrafts,
} from "./chatStreamDrafts";

beforeEach(() => sessionStorage.clear());
it("isolates drafts by account and conversation and removes them after acceptance", () => {
  const key = chatStreamDraftKey("account-a", 42);
  const draft = {
    conversationId: 42,
    clientRequestId: crypto.randomUUID(),
    content: "你好",
  };
  updateChatStreamDrafts(key, 42, draft);
  expect(readChatStreamDrafts(key, 42)).toEqual([draft]);
  expect(readChatStreamDrafts(chatStreamDraftKey("account-b", 42), 42)).toEqual(
    []
  );
  expect(readChatStreamDrafts(key, 43)).toEqual([]);
  expect(chatStreamDraftKey(undefined, 42)).toBeNull();
  updateChatStreamDrafts(key, 42, draft.clientRequestId);
  expect(sessionStorage.getItem(key!)).toBeNull();
});
it("clears all pending account drafts on sign out and preserves unrelated preferences", () => {
  sessionStorage.setItem("other", "keep");
  for (const account of ["a", "b"])
    updateChatStreamDrafts(chatStreamDraftKey(account, 42), 42, {
      conversationId: 42,
      clientRequestId: crypto.randomUUID(),
      content: "私密消息",
    });
  clearChatStreamDrafts();
  expect(sessionStorage.length).toBe(1);
  expect(sessionStorage.getItem("other")).toBe("keep");
});
it("ignores malformed or out-of-bounds stored values", () => {
  const key = chatStreamDraftKey("a", 42)!;
  sessionStorage.setItem(key, "not json");
  expect(readChatStreamDrafts(key, 42)).toEqual([]);
  sessionStorage.setItem(
    key,
    JSON.stringify([
      {
        conversationId: 42,
        clientRequestId: crypto.randomUUID(),
        content: "x".repeat(CHAT_INPUT_CAPACITY + 1),
      },
    ])
  );
  expect(readChatStreamDrafts(key, 42)).toEqual([]);
});
it("retains a long submission for UUID reconciliation after reload", () => {
  const key = chatStreamDraftKey("long-input", 42);
  const submission = {
    conversationId: 42,
    clientRequestId: crypto.randomUUID(),
    content: "x".repeat(12000),
  };
  updateChatStreamDrafts(key, 42, submission);
  expect(readChatStreamDrafts(key, 42)).toEqual([submission]);
});
