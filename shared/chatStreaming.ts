/** 流式聊天使用的客户端与服务端快照契约，不依赖浏览器连接生命周期。 */
import type { BusinessErrorDetails } from "./errors";
import type { Message } from "../drizzle/schema";

/** 一轮任务的可恢复状态，终态不会因重连重新生成。 */
export type ChatTurnStatus =
  "queued" | "running" | "succeeded" | "stopped" | "failed";
/** SSE 和 JSON 使用 ISO 时间，供前端恢复为展示消息。 */
export type StreamMessage = Omit<Message, "createdAt"> & { createdAt: string };
/** 持久片段和稳定消息标识组成的完整快照；无正文错误仅返回有限错误码。 */
export type ChatTurnSnapshot = {
  id: string;
  conversationId: number;
  clientRequestId: string;
  status: ChatTurnStatus;
  revision: number;
  userMessage: StreamMessage;
  assistantMessage: StreamMessage;
  safetyNotice: boolean;
  errorCode?: "GENERATION_FAILED";
  relationship?: { leveledUp: boolean; intimacyLevel: number } | null;
};

/** 判断服务端是否已经完成或停止该轮。 */
export function isChatTurnTerminal(status: ChatTurnStatus) {
  return status === "succeeded" || status === "stopped" || status === "failed";
}

/** HTTP 错误仅包含有限业务码和请求标识，前端按本地语言显示说明。 */
export type ChatStreamError = {
  error: {
    code: string;
    message: string;
    business?: BusinessErrorDetails | null;
  };
  requestId?: string;
};
