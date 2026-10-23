// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  chatInputDraftKey,
  chatStreamDraftKey,
  clearConversationChatDrafts,
} from "./chatStreamDrafts";
afterEach(() => sessionStorage.clear());
it("deleting one conversation does not erase other conversations or accounts' drafts", () => {
  for (const owner of ["a", "b"])
    for (const id of [1, 2])
      for (const key of [
        chatInputDraftKey(owner, id),
        chatStreamDraftKey(owner, id),
      ])
        sessionStorage.setItem(key!, "draft");
  clearConversationChatDrafts("a", 1);
  expect(sessionStorage.getItem(chatInputDraftKey("a", 1)!)).toBeNull();
  expect(sessionStorage.getItem(chatStreamDraftKey("a", 1)!)).toBeNull();
  expect(sessionStorage.getItem(chatInputDraftKey("a", 2)!)).toBe("draft");
  expect(sessionStorage.getItem(chatInputDraftKey("b", 1)!)).toBe("draft");
});
