/** 使用实际认证配置和内存适配器验证访问来源，避免全局令牌清理干扰并行数据库回归。 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

const mail = vi.hoisted(() => ({
  verify: vi.fn(),
  reset: vi.fn(),
  magic: vi.fn(),
}));
vi.mock("./_core/email", () => ({
  sendVerificationEmail: mail.verify,
  sendPasswordResetEmail: mail.reset,
  sendMagicLinkEmail: mail.magic,
}));
let auth: ReturnType<typeof betterAuth>;
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("PORT", "3000");
  vi.stubEnv("VITE_EXTRA_ALLOWED_HOST", "yumei-dev.local,192.168.0.38");
  const { auth: configured } = await import("./_core/auth");
  const options: BetterAuthOptions = configured.options;
  auth = betterAuth<BetterAuthOptions>({
    ...options,
    database: memoryAdapter({
      user: [],
      account: [],
      session: [],
      verification: [],
    }),
    // Better-Auth 在测试环境默认跳过来源检查，此处显式启用以覆盖真实浏览器保护。
    advanced: {
      ...options.advanced,
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
  });
});
afterAll(() => vi.unstubAllEnvs());

function post(
  origin: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return auth.handler(
    new Request(`${origin}/api/auth/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...headers,
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

describe("multi-host authentication on port 3000", () => {
  it.each(["localhost", "127.0.0.1", "yumei-dev.local", "192.168.0.38"])(
    "keeps verification, password login, reset and magic links on %s",
    async host => {
      const origin = `http://${host}:3000`;
      const email = `local-access-${crypto.randomUUID()}@example.com`;
      const password = "original-password-123";
      const signup = await post(origin, "sign-up/email", {
        email,
        name: "本地访问回归",
        password,
        callbackURL: `${origin}/verify-email`,
      });
      expect(signup.status).toBe(200);
      const verification = mail.verify.mock.calls.at(-1)![0].url;
      expect(new URL(verification).origin).toBe(origin);
      const verified = await auth.handler(new Request(verification));
      expect(new URL(verified.headers.get("location")!).origin).toBe(origin);
      const signedIn = await post(origin, "sign-in/email", { email, password });
      expect(signedIn.status).toBe(200);
      expect(signedIn.headers.get("set-cookie")).not.toMatch(
        /;\s*Secure(?:;|$)/i
      );
      const headers = { host: `${host}:3000`, cookie: cookies(signedIn) };
      expect((await auth.api.getSession({ headers }))?.user.email).toBe(email);
      expect(
        (
          await post(origin, "request-password-reset", {
            email,
            redirectTo: `${origin}/reset-password`,
          })
        ).status
      ).toBe(200);
      const resetLink = mail.reset.mock.calls.at(-1)![0].url;
      expect(new URL(resetLink).origin).toBe(origin);
      const resetCallback = await auth.handler(new Request(resetLink));
      const resetPage = new URL(resetCallback.headers.get("location")!);
      expect(resetPage.origin).toBe(origin);
      expect(
        (
          await post(origin, "reset-password", {
            token: resetPage.searchParams.get("token"),
            newPassword: "replacement-password-456",
          })
        ).status
      ).toBe(200);
      expect(await auth.api.getSession({ headers })).toBeNull();
      expect(
        (
          await post(origin, "sign-in/email", {
            email,
            password: "replacement-password-456",
          })
        ).status
      ).toBe(200);
      expect(
        (await post(origin, "sign-in/magic-link", { email, callbackURL: "/" }))
          .status
      ).toBe(200);
      const magicLink = mail.magic.mock.calls.at(-1)![0].magicLinkUrl;
      expect(new URL(magicLink).origin).toBe(origin);
      const magicLogin = await auth.handler(new Request(magicLink));
      expect(new URL(magicLogin.headers.get("location")!).origin).toBe(origin);
      expect(
        (
          await auth.api.getSession({
            headers: { host: `${host}:3000`, cookie: cookies(magicLogin) },
          })
        )?.user.email
      ).toBe(email);
    }
  );

  it("rejects untrusted origins and external mail callbacks", async () => {
    const before = mail.magic.mock.calls.length;
    const email = `rejected-origin-${crypto.randomUUID()}@example.com`;
    expect(
      (
        await post(
          "http://localhost:3000",
          "sign-in/magic-link",
          { email },
          { Origin: "http://evil.example:3000" }
        )
      ).status
    ).toBe(403);
    expect(
      (
        await post("http://localhost:3000", "sign-in/magic-link", {
          email,
          callbackURL: "http://evil.example:3000/",
        })
      ).status
    ).toBe(403);
    expect(mail.magic.mock.calls.length).toBe(before);
  });

  it("ignores untrusted forwarded hosts when generating local mail links", async () => {
    const email = `proxy-origin-${crypto.randomUUID()}@example.com`;
    expect(
      (
        await post(
          "http://127.0.0.1:3000",
          "sign-in/magic-link",
          { email },
          {
            "x-forwarded-host": "evil.example:3000",
            "x-forwarded-proto": "https",
          }
        )
      ).status
    ).toBe(200);
    expect(new URL(mail.magic.mock.calls.at(-1)![0].magicLinkUrl).origin).toBe(
      "http://127.0.0.1:3000"
    );
  });
});
