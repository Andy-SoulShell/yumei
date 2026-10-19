/** 使用真实邮箱链接登录流程验证注销撤销和 HTTPS Cookie 清理。 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("./_core/email", () => ({ sendMagicLinkEmail: sendEmail }));

beforeAll(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://yumei.test");
});
afterAll(() => vi.unstubAllEnvs());

describe("session revocation", () => {
  it("invalidates a replayed session token and clears secure cookies", async () => {
    const { auth, getSessionUser } = await import("./_core/auth");
    const { appRouter } = await import("./routers");
    if (!auth) throw new Error("This regression requires DATABASE_URL");
    const email = `logout-${crypto.randomUUID()}@example.com`;
    const sent = await auth.handler(
      new Request("https://yumei.test/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://yumei.test",
        },
        body: JSON.stringify({ email }),
      })
    );
    expect(sent.status).toBe(200);
    const link = sendEmail.mock.calls.at(-1)?.[0].magicLinkUrl;
    expect(link).toBeTruthy();
    const login = await auth.handler(new Request(link));
    const cookie = login.headers
      .getSetCookie()
      .map(value => value.split(";")[0])
      .join("; ");
    expect(cookie).toContain("__Secure-better-auth.session_token=");
    const headers = { cookie, origin: "https://yumei.test" };
    const sessionUser = await getSessionUser({ headers });
    expect(sessionUser?.email).toBe(email);
    const append = vi.fn();
    const clearCookie = vi.fn();
    const ctx = {
      user: null,
      req: { headers, protocol: "https" },
      res: { append, clearCookie },
    } as unknown as TrpcContext;
    const failedSignOut = vi
      .spyOn(auth.api, "signOut")
      .mockResolvedValue(new Response("{}") as never);
    await expect(
      appRouter.createCaller(ctx).auth.logout()
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect((await getSessionUser({ headers }))?.email).toBe(email);
    failedSignOut.mockRestore();
    await expect(appRouter.createCaller(ctx).auth.logout()).resolves.toEqual({
      success: true,
    });
    expect(append.mock.calls.flat(2).join(" ")).toContain(
      "__Secure-better-auth.session_token="
    );
    expect(clearCookie).toHaveBeenCalledWith(
      "__Secure-better-auth.session_token",
      expect.objectContaining({ secure: true, path: "/" })
    );
    expect(await getSessionUser({ headers })).toBeNull();
    await expect(appRouter.createCaller(ctx).auth.logout()).resolves.toEqual({
      success: true,
    });
  });
});
