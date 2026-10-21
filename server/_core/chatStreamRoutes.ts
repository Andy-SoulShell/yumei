import { getPublishedProductConfig } from "../repositories/productConfig";
/** 经过 Cookie 鉴权及 CSRF 检查的聊天接收、观察和停止 HTTP 路由。 */
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  isChatTurnTerminal,
  type ChatStreamError,
} from "../../shared/chatStreaming";
import {
  getChatTurnSnapshot,
  getLatestChatTurn,
  stopChatTurn,
  submitChatTurn,
} from "../chatStreaming";
import { ensureAgeConfirmed } from "../routers/guards";
import { BusinessRuleError } from "./businessError";
import { createContext } from "./context";
import { csrfVerifyMiddleware } from "./csrf";
import { log, providerErrorSummary } from "./log";

/** 公开说明按有限错误码选择，不回传数据库或供应商错误消息。 */
function respondError(res: Response, error: unknown) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const code =
    error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR";
  const ageRequired =
    error instanceof TRPCError && error.message === "AGE_CONFIRMATION_REQUIRED";
  const result: ChatStreamError = {
    error: {
      code,
      message: ageRequired ? "AGE_CONFIRMATION_REQUIRED" : code,
      business:
        error instanceof TRPCError && error.cause instanceof BusinessRuleError
          ? error.cause.details
          : null,
    },
    requestId: String(res.getHeader("X-Request-ID") ?? ""),
  };
  log.warn("[chat-stream] request failed", {
    requestId: result.requestId,
    errorCode: code,
    ...providerErrorSummary(error),
  });
  res
    .status(
      error instanceof TRPCError ? getHTTPStatusCodeFromError(error) : 500
    )
    .json(result);
}

async function authenticated(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const ctx = await createContext({ req, res, info: {} as never });
  if (!ctx.user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  ensureAgeConfirmed(ctx.user);
  return ctx.user;
}

/** 注册持久轮次接口；SSE 关闭只清理订阅，不影响任务状态。 */
export function registerChatStreamRoutes(app: Express) {
  app.post("/api/chat/turns", csrfVerifyMiddleware, async (req, res) => {
    try {
      const user = await authenticated(req, res);
      const result = await submitChatTurn(user, req.body);
      res.status(202).json(result);
    } catch (error) {
      respondError(res, error);
    }
  });
  app.get("/api/chat/turns", async (req, res) => {
    try {
      const user = await authenticated(req, res);
      const parsed = z.coerce
        .number()
        .int()
        .positive()
        .safeParse(req.query.conversationId);
      if (!parsed.success)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid conversation ID",
        });
      res.setHeader("Cache-Control", "no-store");
      res.json(await getLatestChatTurn(user.id, parsed.data));
    } catch (error) {
      respondError(res, error);
    }
  });
  app.post(
    "/api/chat/turns/:id/stop",
    csrfVerifyMiddleware,
    async (req, res) => {
      try {
        const user = await authenticated(req, res);
        if (!z.string().uuid().safeParse(req.params.id).success)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid turn ID",
          });
        res.json(await stopChatTurn(user.id, req.params.id));
      } catch (error) {
        respondError(res, error);
      }
    }
  );
  app.get("/api/chat/turns/:id/events", async (req, res) => {
    try {
      const user = await authenticated(req, res);
      if (!z.string().uuid().safeParse(req.params.id).success)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid turn ID",
        });
      const transport = (await getPublishedProductConfig()).experience
        .transport;
      let snapshot = await getChatTurnSnapshot(user.id, req.params.id);
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      let closed = false,
        lastRevision = -1,
        lastSent = Date.now();
      res.on("close", () => {
        closed = true;
      });
      while (!closed) {
        if (snapshot.revision !== lastRevision) {
          const accepted = res.write(
            `event: snapshot\nid: ${snapshot.revision}\ndata: ${JSON.stringify(snapshot)}\n\n`
          );
          lastRevision = snapshot.revision;
          lastSent = Date.now();
          // A stalled observer can reconnect from canonical state; do not accumulate snapshots in memory.
          if (!accepted) break;
        } else if (Date.now() - lastSent >= transport.observerHeartbeatMs) {
          if (!res.write(": heartbeat\n\n")) break;
          lastSent = Date.now();
        }
        if (isChatTurnTerminal(snapshot.status)) break;
        await new Promise(resolve =>
          setTimeout(resolve, transport.observerPollMs)
        );
        if (closed) break;
        snapshot = await getChatTurnSnapshot(user.id, req.params.id);
      }
      res.end();
    } catch (error) {
      respondError(res, error);
    }
  });
}
