// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  clearFormDrafts,
  formDraftKey,
  readDraftFile,
  readFormDraft,
  removeFormDraft,
  writeDraftFile,
  writeFormDraft,
} from "./formDrafts";
afterEach(() => {
  vi.restoreAllMocks();
  clearFormDrafts();
  sessionStorage.clear();
});
it("retains the latest draft when browser quota rejects a write", () => {
  const key = formDraftKey("a", "character")!;
  writeFormDraft(key, { name: "old" });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  writeFormDraft(key, { name: "latest" });
  expect(readFormDraft(key)).toEqual({ name: "latest" });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  removeFormDraft(key);
  expect(readFormDraft(key)).toBeNull();
});
it("clears account drafts and in-memory files on logout without removing unrelated preferences", () => {
  const a = formDraftKey("a", "edit:1")!,
    b = formDraftKey("b", "edit:1")!;
  writeFormDraft(a, { name: "a" });
  writeFormDraft(b, { name: "b" });
  writeDraftFile(a, "reference", new File(["private"], "ref.png"));
  sessionStorage.setItem("unrelated", "keep");
  clearFormDrafts();
  expect(readFormDraft(a)).toBeNull();
  expect(readFormDraft(b)).toBeNull();
  expect(readDraftFile(a, "reference")).toBeNull();
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
});
