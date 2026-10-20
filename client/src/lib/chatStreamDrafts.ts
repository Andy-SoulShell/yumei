/** 待核对提交仅保留在当前标签页，按账号和会话隔离。 */
export type StoredChatSubmission = {
  conversationId: number;
  clientRequestId: string;
  content: string;
  transcriptionId?: string;
};

const DRAFT_PREFIX = "yumei:chat-pending:";

/** 返回账号专属存储键，未登录时不持久化草稿。 */
export function chatStreamDraftKey(
  accountId: string | undefined,
  conversationId: number | null
) {
  return accountId && conversationId
    ? `${DRAFT_PREFIX}${accountId}:${conversationId}`
    : null;
}

/** 退出账号时清理本标签页的待核对消息，不保留私密聊天草稿。 */
export function clearChatStreamDrafts() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index)
    );
    for (const key of keys)
      if (key?.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* 浏览器禁用存储时仍允许聊天。 */
  }
}

/** 只读取有界且属于当前会话的提交，避免损坏数据进入重试。 */
export function readChatStreamDrafts(
  key: string | null,
  conversationId: number | null
): StoredChatSubmission[] {
  if (!key) return [];
  try {
    const values: unknown = JSON.parse(sessionStorage.getItem(key) || "[]");
    if (!Array.isArray(values)) return [];
    return values.filter(
      (item): item is StoredChatSubmission =>
        !!item &&
        typeof item === "object" &&
        item.conversationId === conversationId &&
        typeof item.clientRequestId === "string" &&
        /^[0-9a-f-]{36}$/i.test(item.clientRequestId) &&
        typeof item.content === "string" &&
        item.content.length > 0 &&
        item.content.length <= 8000 &&
        (item.transcriptionId === undefined ||
          typeof item.transcriptionId === "string")
    );
  } catch {
    return [];
  }
}

/** 写入发送前提交，或在明确接受/拒绝后按 UUID 删除。 */
export function updateChatStreamDrafts(
  key: string | null,
  conversationId: number | null,
  submission: StoredChatSubmission | string
) {
  if (!key) return;
  const id =
    typeof submission === "string" ? submission : submission.clientRequestId;
  const remaining = readChatStreamDrafts(key, conversationId).filter(
    item => item.clientRequestId !== id
  );
  if (typeof submission !== "string") remaining.push(submission);
  try {
    if (remaining.length)
      sessionStorage.setItem(key, JSON.stringify(remaining));
    else sessionStorage.removeItem(key);
  } catch {
    /* 存储不可用时以内存草稿提供当前页面恢复。 */
  }
}
