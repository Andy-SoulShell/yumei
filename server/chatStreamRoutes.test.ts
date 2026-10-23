/** 通过真实本地 HTTP 验证流式路由的认证、CSRF、只读恢复和断线行为。 */
import express from "express";
import { createServer, type Server } from "node:http";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ChatTurnSnapshot, StreamMessage } from "../shared/chatStreaming";
import { csrfCookieMiddleware } from "./_core/csrf";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  submit: vi.fn(),
  latest: vi.fn(),
  snapshot: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("./chatStreaming", () => ({
  submitChatTurn: mocks.submit,
  getLatestChatTurn: mocks.latest,
  getChatTurnSnapshot: mocks.snapshot,
  stopChatTurn: mocks.stop,
}));
vi.mock("./_core/context", () => ({
  createContext: async ({ req, res }: { req: unknown; res: unknown }) => ({
    req,
    res,
    requestId: "qa-request",
    user: mocks.authenticated
      ? { id: "qa-user", birthDate: new Date("1990-01-01") }
      : null,
  }),
}));
import { registerChatStreamRoutes } from "./_core/chatStreamRoutes";

const turnId = "aa29d121-0b49-4a0b-9bf9-b3ae72bbfabb";
const clientRequestId = "d236454e-1b13-47a6-99d5-ce6c2421634a";
const message: StreamMessage = {
  id: 1,
  conversationId: 1,
  role: "user",
  content: "你好",
  imageUrl: null,
  imageKey: null,
  generationRequestId: turnId,
  generationStatus: "succeeded",
  segments: null,
  selfieMode: null,
  createdAt: "2026-10-20T10:00:00Z",
};
function snapshot(
  status: ChatTurnSnapshot["status"] = "succeeded"
): ChatTurnSnapshot {
  return {
    id: turnId,
    clientRequestId,
    conversationId: 1,
    revision: 2,
    status,
    userMessage: message,
    assistantMessage: {
      ...message,
      id: 2,
      role: "assistant",
      content: "我在。",
      segments: [{ id: `${turnId}:1`, sequence: 1, content: "我在。" }],
    },
    safetyNotice: false,
  };
}
let server: Server, base: string;
const csrfHeaders = {
  "content-type": "application/json",
  cookie: "csrf_token=qa-csrf-value",
  "x-csrf-token": "qa-csrf-value",
};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(csrfCookieMiddleware);
  registerChatStreamRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected TCP server");
  base = `http://127.0.0.1:${address.port}/api/chat/turns`;
});
beforeEach(() => {
  mocks.authenticated = true;
  mocks.submit.mockResolvedValue(snapshot("queued"));
  mocks.latest.mockResolvedValue(snapshot());
  mocks.snapshot.mockResolvedValue(snapshot());
  mocks.stop.mockResolvedValue(snapshot("stopped"));
});
afterEach(() => {
  vi.clearAllMocks();
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("chat HTTP boundaries", () => {
  it("rejects writes without matching CSRF before invoking a charged service", async () => {
    const result = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId,
        conversationId: 1,
        content: "你好",
      }),
    });
    expect(result.status).toBe(403);
    const stop = await fetch(`${base}/${turnId}/stop`, { method: "POST" });
    expect(stop.status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  it("authenticates discovery, event subscriptions and writes", async () => {
    mocks.authenticated = false;
    for (const url of [`${base}?conversationId=1`, `${base}/${turnId}/events`])
      expect((await fetch(url)).status).toBe(401);
    expect(
      (
        await fetch(base, {
          method: "POST",
          headers: csrfHeaders,
          body: JSON.stringify({
            clientRequestId,
            conversationId: 1,
            content: "你好",
          }),
        })
      ).status
    ).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("submits a stable client key and confines read discovery to the authenticated user", async () => {
    const result = await fetch(base, {
      method: "POST",
      headers: csrfHeaders,
      body: JSON.stringify({
        clientRequestId,
        conversationId: 1,
        content: "你好",
      }),
    });
    expect(result.status).toBe(202);
    expect((await result.json()).clientRequestId).toBe(clientRequestId);
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "qa-user" }),
      expect.objectContaining({
        clientRequestId,
        conversationId: 1,
        content: "你好",
      })
    );
    await fetch(`${base}?conversationId=1`);
    expect(mocks.latest).toHaveBeenCalledWith("qa-user", 1);
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  it("sends persisted revision and stable segments as SSE with proxy buffering disabled", async () => {
    const result = await fetch(`${base}/${turnId}/events`);
    expect(result.headers.get("content-type")).toContain("text/event-stream");
    expect(result.headers.get("cache-control")).toMatch(/no-cache|no-store/);
    expect(result.headers.get("x-accel-buffering")).toBe("no");
    const body = await result.text();
    expect(body).toContain("event: snapshot");
    expect(body).toMatch(/id:\s*2/);
    expect(body).toContain(`${turnId}:1`);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  it("a disconnected subscriber never stops the persisted turn", async () => {
    mocks.snapshot.mockResolvedValue(snapshot("running"));
    const result = await fetch(`${base}/${turnId}/events`);
    const reader = result.body!.getReader();
    expect((await reader.read()).value?.length).toBeGreaterThan(0);
    await reader.cancel();
    expect(mocks.stop).not.toHaveBeenCalled();
  });
});

it("preserves public quota and rate reasons across HTTP without exposing diagnostic text", async () => {
  const { TRPCError } = await import("@trpc/server");
  const { BusinessRuleError } = await import("./_core/businessError");
  const reasons = [
    {
      reason: "QUOTA_EXCEEDED" as const,
      meter: "chat",
      period: "day" as const,
      limit: 30,
      resetAt: "2026-10-24T00:00:00.000Z",
    },
    { reason: "RATE_LIMITED" as const, retryAt: "2026-10-23T12:00:20.000Z" },
    { reason: "CONCURRENCY_LIMIT" as const },
  ];
  for (const details of reasons) {
    mocks.submit.mockRejectedValueOnce(
      new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "private-provider-diagnostic",
        cause: new BusinessRuleError(details),
      })
    );
    const response = await fetch(base, {
      method: "POST",
      headers: csrfHeaders,
      body: JSON.stringify({
        clientRequestId,
        conversationId: 1,
        content: "你好",
      }),
    });
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.business).toEqual(details);
    expect(JSON.stringify(body)).not.toContain("private-provider-diagnostic");
  }
});
