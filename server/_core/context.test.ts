/** 区分未登录与基础设施故障，验证关联日志不会包含凭据或请求正文。 */
import { afterEach, expect, it, vi } from "vitest";
import * as usersDb from "../repositories/users";
import * as auth from "./auth";
import { createContext } from "./context";
import { publicProcedure, router } from "./trpc";

afterEach(() => vi.restoreAllMocks());
it("returns an anonymous user for no session and attaches a request identifier", async () => {
  vi.spyOn(auth, "getSessionUser").mockResolvedValue(null);
  const setHeader = vi.fn();
  const ctx = await createContext({
    req: { headers: {} },
    res: { setHeader },
  } as never);
  expect(ctx.user).toBeNull();
  expect(ctx.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(setHeader).toHaveBeenCalledWith("X-Request-ID", ctx.requestId);
});
it("does not turn database outages into an unauthenticated response", async () => {
  vi.spyOn(auth, "getSessionUser").mockResolvedValue({ id: "test" } as never);
  vi.spyOn(usersDb, "getUserById").mockRejectedValue(
    new Error("private-content fake-secret")
  );
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    createContext({
      req: { headers: {} },
      res: { setHeader: vi.fn() },
    } as never)
  ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  const line = JSON.parse(output.mock.calls[0][0]);
  expect(line.details[0].requestId).toBeTruthy();
  expect(JSON.stringify(line)).not.toMatch(/fake-secret|private-content/);
});
it("logs procedure failures with path and request id while omitting input", async () => {
  const output = vi.spyOn(console, "warn").mockImplementation(() => {});
  const app = router({
    fail: publicProcedure.query(() => {
      throw new Error("private-content fake-secret");
    }),
  });
  await expect(
    app.createCaller({ requestId: "audit-request" } as never).fail()
  ).rejects.toThrow();
  const line = JSON.parse(output.mock.calls[0][0]);
  expect(line.details[0]).toMatchObject({
    requestId: "audit-request",
    path: "fail",
    trpcCode: "INTERNAL_SERVER_ERROR",
  });
  expect(JSON.stringify(line)).not.toMatch(/fake-secret|private-content/);
});
