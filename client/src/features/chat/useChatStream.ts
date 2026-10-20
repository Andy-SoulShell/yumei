import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatStreamDraftKey,
  readChatStreamDrafts,
  updateChatStreamDrafts,
  type StoredChatSubmission,
} from "@/lib/chatStreamDrafts";
import {
  isChatTurnTerminal,
  type ChatStreamError,
  type ChatTurnSnapshot,
} from "@shared/chatStreaming";

export type ChatStreamDraft = { content: string; transcriptionId?: string };
export type ChatStreamSubmission = StoredChatSubmission;
export type FailedStreamSubmission = {
  submission: ChatStreamSubmission;
  /** 未知网络结果必须复用 UUID；已明确拒绝的重试创建新请求。 */
  uncertain: boolean;
};
export type ChatStreamTransport = {
  create: (submission: ChatStreamSubmission) => Promise<ChatTurnSnapshot>;
  discover: (conversationId: number) => Promise<ChatTurnSnapshot | null>;
  stop: (turnId: string) => Promise<ChatTurnSnapshot>;
  subscribe: (
    turnId: string,
    receive: (snapshot: ChatTurnSnapshot) => void,
    disconnect: () => void
  ) => () => void;
};

/** 只保留受控业务码，界面不会把上游诊断直接展示给用户。 */
export class ChatStreamRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: ChatStreamError["error"]
  ) {
    super(detail?.code || "CHAT_REQUEST_FAILED");
  }
}

async function request<T>(url: string, body?: object): Promise<T> {
  const headers = new Headers();
  if (body) {
    headers.set("content-type", "application/json");
    const cookie = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    if (cookie) headers.set("x-csrf-token", decodeURIComponent(cookie[1]));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      credentials: "include",
      headers,
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as ChatStreamError | null;
      throw new ChatStreamRequestError(response.status, payload?.error);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** SSE 断开仅关闭订阅；用户点击停止才调用停止接口。 */
export const browserChatStreamTransport: ChatStreamTransport = {
  create: submission => request("/api/chat/turns", submission),
  discover: conversationId =>
    request(`/api/chat/turns?conversationId=${conversationId}`),
  stop: turnId =>
    request(`/api/chat/turns/${encodeURIComponent(turnId)}/stop`, {}),
  subscribe: (turnId, receive, disconnect) => {
    const source = new EventSource(
      `/api/chat/turns/${encodeURIComponent(turnId)}/events`,
      { withCredentials: true }
    );
    source.addEventListener("snapshot", event => {
      try {
        receive(JSON.parse((event as MessageEvent).data) as ChatTurnSnapshot);
      } catch {
        source.close();
        disconnect();
      }
    });
    source.onerror = () => {
      source.close();
      disconnect();
    };
    return () => source.close();
  },
};

type Options = {
  accountId?: string;
  transport?: ChatStreamTransport;
  onAccepted?: (snapshot: ChatTurnSnapshot) => void;
  onComplete?: (snapshot: ChatTurnSnapshot, draft: ChatStreamDraft) => void;
  onError?: (error: unknown) => void;
};

/** 恢复持久轮次、按版本合并快照；刷新和重复事件不会重复朗读或升级提示。 */
export function useChatStream(
  conversationId: number | null,
  options: Options = {}
) {
  const transport = options.transport ?? browserChatStreamTransport;
  const storageKey = chatStreamDraftKey(options.accountId, conversationId);
  const callbacks = useRef(options);
  callbacks.current = options;
  const [turns, setTurns] = useState<ChatTurnSnapshot[]>([]);
  const [snapshot, setSnapshot] = useState<ChatTurnSnapshot | null>(null);
  const [pending, setPending] = useState<ChatStreamSubmission | null>(null);
  const [failures, setFailures] = useState<FailedStreamSubmission[]>([]);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting"
  >("connecting");
  const [isStopping, setIsStopping] = useState(false);
  const latest = useRef<ChatTurnSnapshot | null>(null);
  const accepting = useRef(false);
  const mounted = useRef(false);
  const scope = useRef(0);
  const currentIdentity = useRef({
    conversationId,
    accountId: options.accountId,
  });
  if (
    currentIdentity.current.conversationId !== conversationId ||
    currentIdentity.current.accountId !== options.accountId
  )
    currentIdentity.current = { conversationId, accountId: options.accountId };
  const identity = currentIdentity.current;
  const readyIdentity = useRef(identity);
  const isCurrent = useCallback(
    () =>
      mounted.current &&
      currentIdentity.current === identity &&
      readyIdentity.current === identity,
    [identity]
  );
  const liveRequests = useRef(new Map<string, ChatStreamDraft>());
  const notified = useRef(new Set<string>());
  const stoppingRequest = useRef<Promise<boolean> | null>(null);

  const receive = useCallback(
    (candidate: ChatTurnSnapshot) => {
      if (!isCurrent() || candidate.conversationId !== conversationId)
        return false;
      const previous = latest.current;
      if (
        previous &&
        (candidate.userMessage.id < previous.userMessage.id ||
          (candidate.id === previous.id &&
            candidate.revision <= previous.revision) ||
          (candidate.id === previous.id &&
            isChatTurnTerminal(previous.status) &&
            candidate.status !== previous.status))
      )
        return false;
      latest.current = candidate;
      updateChatStreamDrafts(
        storageKey,
        conversationId,
        candidate.clientRequestId
      );
      setSnapshot(candidate);
      setTurns(current =>
        [...current.filter(turn => turn.id !== candidate.id), candidate].sort(
          (a, b) => a.userMessage.id - b.userMessage.id
        )
      );
      setFailures(current =>
        current.filter(
          item => item.submission.clientRequestId !== candidate.clientRequestId
        )
      );
      const draft = liveRequests.current.get(candidate.clientRequestId);
      if (
        draft &&
        isChatTurnTerminal(candidate.status) &&
        !notified.current.has(candidate.id)
      ) {
        notified.current.add(candidate.id);
        liveRequests.current.delete(candidate.clientRequestId);
        callbacks.current.onComplete?.(candidate, draft);
      }
      return true;
    },
    [conversationId, storageKey, isCurrent]
  );

  useEffect(() => {
    mounted.current = true;
    const epoch = ++scope.current;
    readyIdentity.current = identity;
    latest.current = null;
    accepting.current = false;
    stoppingRequest.current = null;
    liveRequests.current.clear();
    notified.current.clear();
    setTurns([]);
    setSnapshot(null);
    setPending(null);
    setFailures(
      readChatStreamDrafts(storageKey, conversationId).map(submission => ({
        submission,
        uncertain: true,
      }))
    );
    setIsStopping(false);
    setConnection("connecting");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const discover = async () => {
      if (!conversationId || !isCurrent()) return;
      try {
        const result = await transport.discover(conversationId);
        if (cancelled || scope.current !== epoch || !isCurrent()) return;
        if (result) receive(result);
        setConnection("connected");
      } catch {
        if (cancelled || scope.current !== epoch || !isCurrent()) return;
        setConnection("reconnecting");
        timer = setTimeout(
          () => void discover(),
          Math.min(1000 * 2 ** attempt++, 15000)
        );
      }
    };
    void discover();
    return () => {
      cancelled = true;
      mounted.current = false;
      if (timer) clearTimeout(timer);
      // 不停止生成，离开和网络中断均允许随后恢复。
    };
  }, [conversationId, transport, receive, storageKey, isCurrent, identity]);

  const turnId = snapshot?.id;
  const terminal = snapshot ? isChatTurnTerminal(snapshot.status) : true;
  useEffect(() => {
    if (!conversationId || !turnId || terminal) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const reconnect = () => {
      if (cancelled || !isCurrent()) return;
      unsubscribe?.();
      if (timer) clearTimeout(timer);
      setConnection("reconnecting");
      timer = setTimeout(
        async () => {
          if (cancelled || !isCurrent()) return;
          try {
            const resumed = await transport.discover(conversationId);
            if (cancelled || !isCurrent()) return;
            if (resumed) receive(resumed);
            if (
              latest.current?.id !== turnId ||
              isChatTurnTerminal(latest.current.status)
            )
              return;
            connect();
          } catch {
            reconnect();
          }
        },
        Math.min(1000 * 2 ** attempt++, 15000)
      );
    };
    const connect = () => {
      if (cancelled || !isCurrent()) return;
      unsubscribe = transport.subscribe(
        turnId,
        value => {
          if (cancelled || !isCurrent()) return;
          attempt = 0;
          setConnection("connected");
          receive(value);
        },
        reconnect
      );
    };
    connect();
    return () => {
      cancelled = true;
      unsubscribe?.();
      if (timer) clearTimeout(timer);
    };
  }, [conversationId, turnId, terminal, transport, receive, isCurrent]);

  const create = useCallback(
    async (submission: ChatStreamSubmission) => {
      if (
        !isCurrent() ||
        accepting.current ||
        !conversationId ||
        submission.conversationId !== conversationId
      )
        return null;
      accepting.current = true;
      const epoch = scope.current;
      // 补发后旧轮即使迟到完成，也不能重新开始朗读。
      liveRequests.current.clear();
      liveRequests.current.set(submission.clientRequestId, submission);
      setPending(submission);
      updateChatStreamDrafts(storageKey, conversationId, submission);
      setFailures(current =>
        current.filter(
          item => item.submission.clientRequestId !== submission.clientRequestId
        )
      );
      try {
        const result = await transport.create(submission);
        if (!isCurrent() || scope.current !== epoch) return null;
        updateChatStreamDrafts(
          storageKey,
          conversationId,
          submission.clientRequestId
        );
        receive(result);
        callbacks.current.onAccepted?.(result);
        return result;
      } catch (error) {
        if (!isCurrent() || scope.current !== epoch) return null;
        const uncertain =
          !(error instanceof ChatStreamRequestError) || error.status >= 500;
        setFailures(current => [...current, { submission, uncertain }]);
        if (!uncertain) {
          liveRequests.current.delete(submission.clientRequestId);
          updateChatStreamDrafts(
            storageKey,
            conversationId,
            submission.clientRequestId
          );
        }
        callbacks.current.onError?.(error);
        return null;
      } finally {
        if (isCurrent() && scope.current === epoch) {
          accepting.current = false;
          setPending(null);
        }
      }
    },
    [conversationId, transport, receive, storageKey, isCurrent]
  );

  const submit = useCallback(
    (draft: ChatStreamDraft) => {
      if (!conversationId || !isCurrent()) return Promise.resolve(null);
      return create({
        ...draft,
        conversationId,
        clientRequestId: crypto.randomUUID(),
      });
    },
    [conversationId, create, isCurrent]
  );
  const retry = useCallback(
    (failure: FailedStreamSubmission) => {
      if (!isCurrent() || accepting.current) return Promise.resolve(null);
      setFailures(current =>
        current.filter(
          item =>
            item.submission.clientRequestId !==
            failure.submission.clientRequestId
        )
      );
      return failure.uncertain
        ? create(failure.submission)
        : submit(failure.submission);
    },
    [create, submit, isCurrent]
  );
  const retryTurn = useCallback(
    (turn: ChatTurnSnapshot) => submit({ content: turn.userMessage.content }),
    [submit]
  );
  const stop = useCallback((): Promise<boolean> => {
    if (!isCurrent()) return Promise.resolve(false);
    if (stoppingRequest.current) return stoppingRequest.current;
    const current = latest.current;
    if (!current || isChatTurnTerminal(current.status))
      return Promise.resolve(true);
    const epoch = scope.current;
    liveRequests.current.delete(current.clientRequestId);
    setIsStopping(true);
    const operation = (async () => {
      try {
        const result = await transport.stop(current.id);
        if (!isCurrent() || scope.current !== epoch) return false;
        receive(result);
        return true;
      } catch (error) {
        if (!isCurrent() || scope.current !== epoch) return false;
        if (!(error instanceof ChatStreamRequestError) || error.status >= 500) {
          try {
            const recovered = await transport.discover(current.conversationId);
            if (!isCurrent() || scope.current !== epoch) return false;
            if (recovered) receive(recovered);
            // 停止请求可能已经成功，仅在确认原轮终态后允许后续媒体任务。
            if (
              recovered?.id === current.id &&
              isChatTurnTerminal(recovered.status)
            )
              return true;
          } catch {
            /* 无法核实时保留当前轮次，连接恢复后继续发现。 */
          }
        }
        if (!isCurrent() || scope.current !== epoch) return false;
        callbacks.current.onError?.(error);
        return false;
      } finally {
        if (isCurrent() && scope.current === epoch) {
          setIsStopping(false);
          stoppingRequest.current = null;
        }
      }
    })();
    stoppingRequest.current = operation;
    return operation;
  }, [transport, receive, isCurrent]);

  const visible = readyIdentity.current === identity;
  return {
    snapshot: visible ? snapshot : null,
    turns: visible ? turns : [],
    pending: visible ? pending : null,
    failures: visible ? failures : [],
    connection: visible ? connection : ("connecting" as const),
    isAccepting: visible && !!pending,
    isGenerating: visible && !!snapshot && !isChatTurnTerminal(snapshot.status),
    isStopping: visible && isStopping,
    submit,
    retry,
    retryTurn,
    stop,
  };
}
