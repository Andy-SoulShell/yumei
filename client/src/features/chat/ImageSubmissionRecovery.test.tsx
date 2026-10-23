// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@shared/i18n";
import {
  beginImageSubmission,
  pendingImageSubmissions,
} from "@/lib/imageSubmissions";
import { clearFormDrafts } from "@/lib/formDrafts";
import { ImageSubmissionRecovery } from "./ImageSubmissionRecovery";
const mock = vi.hoisted(() => ({
  accountId: "alice",
  find: vi.fn(),
  camera: vi.fn(),
  chat: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN"), locale: "zh-CN" }),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: mock.accountId } }),
}));
vi.mock("@/lib/trpc", () => {
  const utils = {
    selfie: {
      findTask: { fetch: mock.find },
      tasks: { invalidate: mock.invalidate },
      quota: { invalidate: mock.invalidate },
    },
    conversation: { getMessages: { invalidate: mock.invalidate } },
  };
  return {
    trpc: {
      useUtils: () => utils,
      selfie: {
        createTask: { useMutation: () => ({ mutateAsync: mock.camera }) },
      },
      chat: {
        sendMessage: { useMutation: () => ({ mutateAsync: mock.chat }) },
      },
    },
  };
});
let root: Root;
let host: HTMLDivElement;
const input = {
  conversationId: 42,
  userContext: "海边",
  generationMode: "text" as const,
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  clearFormDrafts();
  mock.accountId = "alice";
  mock.find.mockResolvedValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render() {
  await act(async () =>
    root.render(<ImageSubmissionRecovery conversationId={42} />)
  );
}
it("finds an accepted task after refresh without submitting another generation", async () => {
  const id = beginImageSubmission("alice", {
    kind: "selfie",
    conversationId: 42,
    input,
  });
  mock.find.mockResolvedValue({ id: "accepted-task" });
  await render();
  expect(mock.find).toHaveBeenCalledWith({ clientRequestId: id });
  expect(mock.camera).not.toHaveBeenCalled();
  expect(mock.chat).not.toHaveBeenCalled();
  expect(pendingImageSubmissions("alice")).toEqual([]);
});
it("resubmits an absent camera request only on explicit action and with its original ID", async () => {
  const id = beginImageSubmission("alice", {
    kind: "selfie",
    conversationId: 42,
    input,
  });
  mock.camera.mockResolvedValue({ id: "accepted-task", conversationId: 42 });
  await render();
  expect(mock.camera).not.toHaveBeenCalled();
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find(button => button.textContent === "继续这次提交")!
      .click()
  );
  expect(mock.camera).toHaveBeenCalledWith({ ...input, clientRequestId: id });
  expect(pendingImageSubmissions("alice")).toEqual([]);
});
it("keeps an unknown submission on lookup failure and does not issue a replacement", async () => {
  beginImageSubmission("alice", { kind: "selfie", conversationId: 42, input });
  mock.find.mockRejectedValue(new Error("offline"));
  await render();
  expect(host.textContent).toContain("提交结果暂未确认");
  expect(host.textContent).not.toContain("继续这次提交");
  expect(mock.camera).not.toHaveBeenCalled();
  expect(pendingImageSubmissions("alice")).toHaveLength(1);
});
it("does not expose or automatically resend a couple photo after leaving", async () => {
  beginImageSubmission(
    "alice",
    { kind: "couple", conversationId: 42, input },
    "private-photo"
  );
  await render();
  expect(host.textContent).toContain("请重新选择照片");
  expect(host.textContent).not.toContain("private-photo");
  expect(mock.camera).not.toHaveBeenCalled();
  mock.accountId = "bob";
  await render();
  expect(host.textContent).toBe("");
});
