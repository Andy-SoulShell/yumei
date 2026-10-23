// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  beginImageSubmission,
  finishImageSubmission,
  pendingImageSubmissions,
} from "./imageSubmissions";
import { clearFormDrafts } from "./formDrafts";
beforeEach(() => clearFormDrafts());
const input = {
  conversationId: 42,
  userContext: "海边散步",
  generationMode: "text" as const,
};
it("reuses the original request ID until acceptance, then permits a deliberate new image", () => {
  const a = beginImageSubmission("alice", {
    conversationId: 42,
    kind: "selfie",
    input,
  });
  expect(
    beginImageSubmission("alice", { conversationId: 42, kind: "selfie", input })
  ).toBe(a);
  finishImageSubmission("alice", a);
  expect(
    beginImageSubmission("alice", { conversationId: 42, kind: "selfie", input })
  ).not.toBe(a);
});
it("keeps accounts and conversations separate and clears them on logout", () => {
  const a = beginImageSubmission("alice", {
    conversationId: 42,
    kind: "selfie",
    input,
  });
  expect(pendingImageSubmissions("bob")).toEqual([]);
  expect(
    beginImageSubmission("alice", {
      conversationId: 43,
      kind: "selfie",
      input: { ...input, conversationId: 43 },
    })
  ).not.toBe(a);
  clearFormDrafts();
  expect(pendingImageSubmissions("alice")).toEqual([]);
});
it("does not store couple photo bytes in session storage", () => {
  beginImageSubmission(
    "alice",
    { conversationId: 42, kind: "couple", input },
    "private-photo-base64"
  );
  expect(JSON.stringify(pendingImageSubmissions("alice"))).not.toContain(
    "private-photo-base64"
  );
  expect(JSON.stringify({ ...sessionStorage })).not.toContain(
    "private-photo-base64"
  );
});
