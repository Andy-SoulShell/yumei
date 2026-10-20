/** 使用独立 MySQL 和真实认证入口验证邮箱密码、令牌消费、会话撤销与失败回滚。 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  accounts,
  users,
  userPreferences,
  verifications,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const mail = vi.hoisted(() => ({
  verification: vi.fn(),
  reset: vi.fn(),
  magic: vi.fn(),
}));
vi.mock("./_core/email", () => ({
  sendVerificationEmail: mail.verification,
  sendPasswordResetEmail: mail.reset,
  sendMagicLinkEmail: mail.magic,
}));
let auth: typeof import("./_core/auth").auth;
let getSessionUser: typeof import("./_core/auth").getSessionUser;
let db: NonNullable<Awaited<ReturnType<typeof import("./database").getDb>>>;
const origin = "https://yumei.test";
const password = "original-password-123";
const replacement = "replacement-password-456";
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", origin);
  ({ auth, getSessionUser } = await import("./_core/auth"));
  const { getDb } = await import("./database");
  db = (await getDb())!;
  if (!auth || !db)
    throw new Error("This regression requires a migrated test database");
});
afterAll(() => vi.unstubAllEnvs());

/** 通过公开 HTTP 接口发起请求，邮件发送使用测试替身。 */
function post(
  path: string,
  body: unknown,
  cookie = "",
  instance: Pick<typeof auth, "handler"> = auth
) {
  return instance.handler(
    new Request(`${origin}/api/auth/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: cookie,
        "x-yumei-locale": "zh-CN",
        "x-forwarded-for": "192.0.2.43",
      },
      body: JSON.stringify(body),
    })
  );
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map(value => value.split(";")[0])
    .join("; ");
}
async function register() {
  const email = `password-${crypto.randomUUID()}@example.com`;
  const response = await post("sign-up/email", {
    email,
    password,
    name: "测试用户",
    callbackURL: `${origin}/verify-email?next=%2Fsettings`,
  });
  expect(response.status).toBe(200);
  expect(cookies(response)).not.toContain("session_token=");
  const user = (await db.select().from(users).where(eq(users.email, email)))[0];
  expect(user.emailVerified).toBe(false);
  return { email, user, response };
}
async function verifiedUser() {
  const result = await register();
  const message = mail.verification.mock.calls.at(-1)![0];
  expect(message).toMatchObject({ to: result.email, locale: "zh-CN" });
  const response = await auth.handler(new Request(message.url));
  expect(response.status).toBe(302);
  const cookie = cookies(response);
  expect((await getSessionUser({ headers: { cookie } }))?.email).toBe(
    result.email
  );
  return { ...result, cookie };
}
async function resetToken(email: string) {
  const response = await post("request-password-reset", {
    email,
    redirectTo: `${origin}/reset-password?next=%2Fsettings`,
  });
  expect(response.status).toBe(200);
  const message = mail.reset.mock.calls.at(-1)![0];
  expect(message).toMatchObject({ to: email, locale: "zh-CN" });
  const callback = await auth.handler(new Request(message.url));
  const location = new URL(callback.headers.get("location")!);
  expect(location.pathname).toBe("/reset-password");
  expect(location.searchParams.get("next")).toBe("/settings");
  return { token: location.searchParams.get("token")!, response };
}

describe("email and password authentication", () => {
  it("requires verification, stores only a hash and keeps existing credentials on duplicate registration", async () => {
    const { email, user } = await register();
    const denied = await post("sign-in/email", { email, password });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    const credentials = (
      await db.select().from(accounts).where(eq(accounts.userId, user.id))
    )[0];
    expect(credentials.providerId).toBe("credential");
    expect(credentials.password).toBeTruthy();
    expect(credentials.password).not.toBe(password);
    const duplicate = await post("sign-up/email", {
      email,
      password: replacement,
      name: "重复账号",
    });
    expect(duplicate.status).toBe(200);
    expect(
      (await db.select().from(accounts).where(eq(accounts.userId, user.id)))[0]
        .password
    ).toBe(credentials.password);
    const verification = await auth.handler(
      new Request(
        mail.verification.mock.calls.find(call => call[0].to === email)![0].url
      )
    );
    expect(verification.status).toBe(302);
    const login = await post("sign-in/email", { email, password });
    expect(login.status).toBe(200);
    expect(
      (await getSessionUser({ headers: { cookie: cookies(login) } }))?.id
    ).toBe(user.id);
    const wrong = await post("sign-in/email", { email, password: replacement });
    const unknown = await post("sign-in/email", {
      email: `missing-${crypto.randomUUID()}@example.com`,
      password: replacement,
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("uses generic reset responses, enforces expiry and does not consume a token for invalid passwords", async () => {
    const { email } = await verifiedUser();
    const { token, response } = await resetToken(email);
    const count = mail.reset.mock.calls.length;
    const unknown = await post("request-password-reset", {
      email: `missing-${crypto.randomUUID()}@example.com`,
      redirectTo: `${origin}/reset-password`,
    });
    expect(await unknown.json()).toEqual(await response.json());
    expect(mail.reset.mock.calls.length).toBe(count);
    const record = (
      await db
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, `reset-password:${token}`))
    )[0];
    expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      14 * 60_000
    );
    // MySQL TIMESTAMP 按秒保存并可能向上舍入，允许一秒精度差异。
    expect(record.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      15 * 60_000 + 1000
    );
    expect(
      (await post("reset-password", { token, newPassword: "short" })).status
    ).toBe(400);
    expect(
      (await post("reset-password", { token, newPassword: replacement })).status
    ).toBe(200);
    const expired = await resetToken(email);
    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(verifications.identifier, `reset-password:${expired.token}`));
    expect(
      (
        await post("reset-password", {
          token: expired.token,
          newPassword: password,
        })
      ).status
    ).toBe(400);
    expect(
      (await post("sign-in/email", { email, password: replacement })).status
    ).toBe(200);
  });

  it("allows one concurrent reset, revokes all old sessions and rejects token replay", async () => {
    const { email, cookie } = await verifiedUser();
    const second = await post("sign-in/email", { email, password });
    const secondCookie = cookies(second);
    const { token } = await resetToken(email);
    const results = await Promise.all([
      post("reset-password", { token, newPassword: replacement }),
      post("reset-password", { token, newPassword: replacement }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
    for (const sessionCookie of [cookie, secondCookie])
      expect(
        await getSessionUser({ headers: { cookie: sessionCookie } })
      ).toBeNull();
    expect(
      (await post("reset-password", { token, newPassword: password })).status
    ).toBe(400);
    expect((await post("sign-in/email", { email, password })).status).toBe(401);
    expect(
      (await post("sign-in/email", { email, password: replacement })).status
    ).toBe(200);
  });

  it("rolls back token consumption and session revocation if the password write fails", async () => {
    const { email, cookie } = await verifiedUser();
    const { token } = await resetToken(email);
    const context = await auth.$context;
    const failure = vi
      .spyOn(context.internalAdapter, "updatePassword")
      .mockRejectedValueOnce(new Error("injected password write failure"));
    try {
      expect(
        (await post("reset-password", { token, newPassword: replacement }))
          .status
      ).toBe(500);
    } finally {
      failure.mockRestore();
    }
    expect((await getSessionUser({ headers: { cookie } }))?.email).toBe(email);
    expect((await post("sign-in/email", { email, password })).status).toBe(200);
    expect(
      (await post("reset-password", { token, newPassword: replacement })).status
    ).toBe(200);
    expect(await getSessionUser({ headers: { cookie } })).toBeNull();
  });

  it("adds a password to the original magic-link account while preserving its identity and preferences", async () => {
    const email = `legacy-${crypto.randomUUID()}@example.com`;
    expect((await post("sign-in/magic-link", { email })).status).toBe(200);
    const login = await auth.handler(
      new Request(mail.magic.mock.calls.at(-1)![0].magicLinkUrl)
    );
    const cookie = cookies(login);
    const sessionUser = (await getSessionUser({ headers: { cookie } }))!;
    const { hasCredentialPassword, getUserById } =
      await import("./repositories/users");
    expect(await hasCredentialPassword(sessionUser.id)).toBe(false);
    await db.insert(userPreferences).values({
      userId: sessionUser.id,
      language: "ja",
      theme: "sakura",
      colorMode: "dark",
    });
    const { token } = await resetToken(email);
    expect(
      (await post("reset-password", { token, newPassword: replacement })).status
    ).toBe(200);
    expect(await hasCredentialPassword(sessionUser.id)).toBe(true);
    const next = await post("sign-in/email", { email, password: replacement });
    expect(
      (await getSessionUser({ headers: { cookie: cookies(next) } }))?.id
    ).toBe(sessionUser.id);
    expect(
      (
        await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, sessionUser.id))
      )[0]
    ).toMatchObject({ language: "ja", theme: "sakura", colorMode: "dark" });
    const { appRouter } = await import("./routers");
    const ctx = {
      user: await getUserById(sessionUser.id),
      req: { headers: {} },
      res: {},
    } as TrpcContext;
    expect(await appRouter.createCaller(ctx).auth.passwordStatus()).toEqual({
      hasPassword: true,
    });
    await expect(
      appRouter.createCaller({ ...ctx, user: null }).auth.passwordStatus()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires the current password for changes and revokes other sessions", async () => {
    const { email, cookie } = await verifiedUser();
    const other = cookies(await post("sign-in/email", { email, password }));
    expect(
      (
        await post(
          "change-password",
          {
            currentPassword: "incorrect-password",
            newPassword: replacement,
            revokeOtherSessions: true,
          },
          cookie
        )
      ).status
    ).toBe(400);
    expect((await getSessionUser({ headers: { cookie: other } }))?.email).toBe(
      email
    );
    const changed = await post(
      "change-password",
      {
        currentPassword: password,
        newPassword: replacement,
        revokeOtherSessions: true,
      },
      cookie
    );
    expect(changed.status).toBe(200);
    expect(await getSessionUser({ headers: { cookie: other } })).toBeNull();
    expect(
      (await getSessionUser({ headers: { cookie: cookies(changed) } }))?.email
    ).toBe(email);
    expect((await post("sign-in/email", { email, password })).status).toBe(401);
    expect(
      (await post("sign-in/email", { email, password: replacement })).status
    ).toBe(200);
  });

  it("limits reset mail requests when production rate limiting is enabled", async () => {
    const { email } = await verifiedUser();
    const { betterAuth } = await import("better-auth");
    const limited = betterAuth({
      ...auth.options,
      rateLimit: { ...auth.options.rateLimit, enabled: true },
    });
    for (let i = 0; i < 3; i++)
      expect(
        (await post("request-password-reset", { email }, "", limited)).status
      ).toBe(200);
    expect(
      (await post("request-password-reset", { email }, "", limited)).status
    ).toBe(429);
  });
});
