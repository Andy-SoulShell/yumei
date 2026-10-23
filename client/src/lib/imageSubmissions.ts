/** 只保留待核对提交的编号和小型输入，不把合照原图写入浏览器存储。 */
import type { ImageTaskInput } from "@shared/imageTasks";
import { formDraftKey, readFormDraft, writeFormDraft } from "./formDrafts";
import { createUuid } from "./uuid";

export type PendingImageSubmission = {
  clientRequestId: string;
  conversationId: number;
  signature: string;
  kind: "selfie" | "couple" | "chat";
  input: Omit<ImageTaskInput, "clientRequestId">;
  transcriptionId?: string;
};
export const imageSubmissionEvent = "yumei:image-submissions";
/** 连接中断或服务端异常不代表任务未接收，不能据此宣称生成失败。 */
export function isImageSubmissionUncertain(error: {
  data?: { code?: string } | null;
}) {
  return ![
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "PRECONDITION_FAILED",
    "TOO_MANY_REQUESTS",
  ].includes(error.data?.code ?? "");
}
const key = (accountId: string | undefined) =>
  formDraftKey(accountId, "image-submissions");
export function pendingImageSubmissions(accountId: string | undefined) {
  const items = readFormDraft(key(accountId))?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (item): item is PendingImageSubmission =>
        !!item &&
        typeof item === "object" &&
        typeof item.clientRequestId === "string" &&
        /^[0-9a-f-]{36}$/i.test(item.clientRequestId) &&
        Number.isInteger(item.conversationId) &&
        ["selfie", "couple", "chat"].includes(item.kind) &&
        typeof item.input?.userContext === "string" &&
        item.input.userContext.length <= 8000 &&
        item.input.conversationId === item.conversationId
    )
    .slice(-30);
}
function save(accountId: string | undefined, items: PendingImageSubmission[]) {
  writeFormDraft(key(accountId), { items });
  window.dispatchEvent(new Event(imageSubmissionEvent));
}
export function finishImageSubmission(
  accountId: string | undefined,
  clientRequestId: string
) {
  save(
    accountId,
    pendingImageSubmissions(accountId).filter(
      item => item.clientRequestId !== clientRequestId
    )
  );
}
/** 哈希仅用于匹配本地待核对操作；服务端另以 SHA-256 验证完整负载。 */
export function beginImageSubmission(
  accountId: string | undefined,
  submission: Omit<PendingImageSubmission, "clientRequestId" | "signature">,
  photo = ""
) {
  const value = JSON.stringify(submission) + photo;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  const signature = `${value.length}:${hash >>> 0}`;
  const items = pendingImageSubmissions(accountId);
  const existing = items.find(
    item =>
      item.signature === signature &&
      item.conversationId === submission.conversationId &&
      item.kind === submission.kind
  );
  if (existing) return existing.clientRequestId;
  const clientRequestId = createUuid();
  save(
    accountId,
    [...items, { ...submission, signature, clientRequestId }].slice(-30)
  );
  return clientRequestId;
}
