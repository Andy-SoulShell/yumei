/** 输入跨页面返回和刷新保留；切换账号或会话时立即读取各自的草稿。 */
import { useCallback, useState, type SetStateAction } from "react";
import {
  chatInputDraftKey,
  readChatInputDraft,
  writeChatInputDraft,
} from "@/lib/chatStreamDrafts";

export function useChatInputDraft(
  accountId: string | undefined,
  conversationId: number | null,
  maxChars?: number
) {
  const key = chatInputDraftKey(accountId, conversationId);
  const [draft, setDraft] = useState(() => ({
    key,
    text: readChatInputDraft(key),
  }));
  const text = draft.key === key ? draft.text : readChatInputDraft(key);
  const setText = useCallback(
    (value: SetStateAction<string>) => {
      setDraft(previous => {
        const current =
          previous.key === key ? previous.text : readChatInputDraft(key);
        const candidate = typeof value === "function" ? value(current) : value;
        const next =
          maxChars === undefined ? candidate : candidate.slice(0, maxChars);
        writeChatInputDraft(key, next);
        return { key, text: next };
      });
    },
    [key, maxChars]
  );
  return [text, setText] as const;
}
