/** 真实 HTTP 验证单密码会话、CSRF、限流和与普通用户权限的隔离。 */
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { csrfCookieMiddleware, csrfVerifyMiddleware } from "./_core/csrf";
import { getDb } from "./database";
import { managementSessions, rateWindows } from "../drizzle/schema";
import type { Server } from "node:http";
let server: Server, origin: string;
const secret = "synthetic-management-password";
beforeEach(async () => {
  vi.stubEnv("ADMIN_PASSWORD", secret);
  await (await getDb())!
    .delete(rateWindows)
    .where(eq(rateWindows.action, "management"));
  const app = express();
  app.use(csrfCookieMiddleware, express.json(), csrfVerifyMiddleware);
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function request(
  path: string,
  input?: object,
  cookie = "",
  csrf?: string
) {
  return fetch(origin + "/api/trpc/" + path, {
    method: input ? "POST" : "GET",
    headers: {
      ...(input ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    ...(input ? { body: JSON.stringify({ json: input }) } : {}),
  });
}
async function session() {
  const initial = await request("management.status");
  const csrfCookie = initial.headers
    .getSetCookie()
    .find(item => item.startsWith("csrf_token="))!
    .split(";")[0];
  const csrf = csrfCookie.split("=")[1];
  const login = await request(
    "management.login",
    { password: secret },
    csrfCookie,
    csrf
  );
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .find(item => item.startsWith("yumei_management="))!;
  return {
    cookie: csrfCookie + "; " + cookie.split(";")[0],
    csrf,
    raw: cookie,
    token: cookie.split(";")[0].split("=")[1],
  };
}
it("logs in without a user, calls the existing admin APIs and revokes the server session on logout", async () => {
  const auth = await session();
  expect(auth.raw).toMatch(/HttpOnly/);
  expect(auth.raw).toMatch(/SameSite=Strict/);
  expect(auth.raw).not.toContain(secret);
  const status = await request("management.status", undefined, auth.cookie);
  expect((await status.json()).result.data.json).toEqual({
    configured: true,
    authenticated: true,
  });
  expect(
    (await request("productConfig.admin.getDraft", undefined, auth.cookie))
      .status
  ).toBe(200);
  expect(
    (await request("discovery.admin.getDraft", undefined, auth.cookie)).status
  ).toBe(200);
  expect(
    (await request("girlfriend.list", undefined, auth.cookie)).status
  ).toBe(401);
  expect(
    (
      await request(
        "productConfig.admin.publish",
        { expectedRevision: 1 },
        auth.cookie
      )
    ).status
  ).toBe(403);
  const hash = createHash("sha256").update(auth.token).digest("hex");
  expect(
    (
      await (await getDb())!
        .select()
        .from(managementSessions)
        .where(eq(managementSessions.id, hash))
    )[0]
  ).toBeTruthy();
  expect(
    (await request("management.logout", {}, auth.cookie, auth.csrf)).status
  ).toBe(200);
  expect(
    (await request("productConfig.admin.getDraft", undefined, auth.cookie))
      .status
  ).toBe(403);
  expect(
    await (await getDb())!
      .select()
      .from(managementSessions)
      .where(eq(managementSessions.id, hash))
  ).toHaveLength(0);
});
it("rejects password rotation, expiration and role-only admin access", async () => {
  const auth = await session();
  vi.stubEnv("ADMIN_PASSWORD", "different-management-password");
  expect(
    (await request("productConfig.admin.getDraft", undefined, auth.cookie))
      .status
  ).toBe(403);
  vi.stubEnv("ADMIN_PASSWORD", secret);
  await (await getDb())!
    .update(managementSessions)
    .set({ expiresAt: new Date(Date.now() - 60000) })
    .where(
      eq(
        managementSessions.id,
        createHash("sha256").update(auth.token).digest("hex")
      )
    );
  expect(
    (await request("discovery.admin.getDraft", undefined, auth.cookie)).status
  ).toBe(403);
  const roleOnly = appRouter.createCaller({
    user: { id: "role-only", role: "admin" },
    req: {},
    res: {},
  } as never);
  await expect(roleOnly.productConfig.admin.getDraft()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("disables authentication when unconfigured and enforces a shared password attempt window", async () => {
  vi.stubEnv("ADMIN_PASSWORD", "");
  const initial = await request("management.status");
  expect((await initial.json()).result.data.json).toEqual({
    configured: false,
    authenticated: false,
  });
  const cookie = initial.headers.getSetCookie()[0].split(";")[0],
    csrf = cookie.split("=")[1];
  expect(
    (await request("management.login", { password: secret }, cookie, csrf))
      .status
  ).toBe(412);
  vi.stubEnv("ADMIN_PASSWORD", secret);
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request(
          "management.login",
          { password: "incorrect" },
          cookie,
          csrf
        )
      ).status
    ).toBe(401);
  expect(
    (await request("management.login", { password: secret }, cookie, csrf))
      .status
  ).toBe(429);
});
