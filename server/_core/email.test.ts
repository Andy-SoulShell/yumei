/** 覆盖登录邮件驱动选择、错误与正文。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const resendSendMock = vi.fn();
const nodemailerSendMailMock = vi.fn();
const nodemailerCreateTransportMock = vi.fn((_options: unknown) => ({
  sendMail: nodemailerSendMailMock,
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: resendSendMock },
  })),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: nodemailerCreateTransportMock },
  createTransport: nodemailerCreateTransportMock,
}));

beforeEach(() => {
  vi.resetModules();
  resendSendMock.mockReset();
  nodemailerSendMailMock.mockReset();
  nodemailerCreateTransportMock.mockClear();
  // Clean env baseline; tests opt-in.
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "a".repeat(40);
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("provider selection by env", () => {
  it("prints complete login links in local Docker stdout mode without sending mail", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "stdout";
    process.env.DATABASE_URL = "mysql://x";
    process.env.KEY_ENCRYPTION_KEY = "k".repeat(40);
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    // Explicit stdout must also take precedence over a stale mail API key.
    process.env.RESEND_API_KEY = "re_unused";
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const url = `http://localhost:3000/api/auth/magic-link/verify?token=${"x".repeat(1024)}&callbackURL=%2F`;
    try {
      const { sendMagicLinkEmail } = await import("./email");
      await sendMagicLinkEmail({ to: "user@example.com", magicLinkUrl: url });
      expect(info).toHaveBeenCalledWith("[email:stdout]", expect.any(String));
      expect(JSON.parse(info.mock.calls[0][1])).toMatchObject({
        magicLinkUrl: url,
      });
      expect(resendSendMock).not.toHaveBeenCalled();
      expect(nodemailerCreateTransportMock).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });

  it("uses Resend when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "noreply@example.com";
    resendSendMock.mockResolvedValue({ data: { id: "x" }, error: null });

    const { sendMagicLinkEmail } = await import("./email");
    await sendMagicLinkEmail({
      to: "user@example.com",
      magicLinkUrl: "https://example.com/verify?token=abc",
    });

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(nodemailerCreateTransportMock).not.toHaveBeenCalled();
    expect(resendSendMock.mock.calls[0][0]).toMatchObject({
      from: "noreply@example.com",
      to: "user@example.com",
    });
  });

  it("uses SMTP when EMAIL_PROVIDER=smtp", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.EMAIL_FROM = "noreply@example.com";

    const { sendMagicLinkEmail } = await import("./email");
    await sendMagicLinkEmail({
      to: "user@example.com",
      magicLinkUrl: "https://example.com/verify?token=abc",
    });

    expect(nodemailerCreateTransportMock).toHaveBeenCalledTimes(1);
    expect(nodemailerCreateTransportMock.mock.calls[0][0]).toMatchObject({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "user", pass: "pass" },
    });
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("uses port 465 secure mode automatically", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";

    const { sendMagicLinkEmail } = await import("./email");
    await sendMagicLinkEmail({
      to: "user@example.com",
      magicLinkUrl: "https://x/v",
    });

    expect(nodemailerCreateTransportMock.mock.calls[0][0]).toMatchObject({
      port: 465,
      secure: true,
    });
  });

  it("throws when EMAIL_PROVIDER=smtp but SMTP_* are incomplete", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    // SMTP_USER / SMTP_PASS missing on purpose.

    const { sendMagicLinkEmail } = await import("./email");
    await expect(
      sendMagicLinkEmail({ to: "u@x", magicLinkUrl: "https://x/v" })
    ).rejects.toThrow(/SMTP_HOST \/ SMTP_USER \/ SMTP_PASS/);
  });

  it("falls back to stdout in non-production when nothing is configured", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "mysql://x";
    process.env.KEY_ENCRYPTION_KEY = "k".repeat(40);

    const { sendMagicLinkEmail } = await import("./email");
    // Should not throw and should not touch real transports.
    await sendMagicLinkEmail({
      to: "user@example.com",
      magicLinkUrl: "https://example.com/v",
    });

    expect(resendSendMock).not.toHaveBeenCalled();
    expect(nodemailerCreateTransportMock).not.toHaveBeenCalled();
  });

  it("blocks startup in production when no driver is configured (env.ts gate)", async () => {
    // Defense-in-depth: env.ts refuses to load in production without a
    // driver, *before* email.ts's own getDriver() guard can fire. We
    // verify the outer gate here — importing email.ts (which imports env)
    // must throw at module-load time.
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mysql://x";
    process.env.KEY_ENCRYPTION_KEY = "k".repeat(40);
    process.env.EMAIL_FROM = "noreply@example.com";
    // No RESEND_API_KEY, no SMTP_*.

    await expect(import("./email")).rejects.toThrow(
      /Production requires either RESEND_API_KEY/
    );
  });
});

describe("ResendDriver error handling", () => {
  it("throws when Resend returns an error object", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@example.com";
    resendSendMock.mockResolvedValue({
      data: null,
      error: { message: "domain not verified" },
    });

    const { sendMagicLinkEmail } = await import("./email");
    await expect(
      sendMagicLinkEmail({ to: "u@x", magicLinkUrl: "https://x/v" })
    ).rejects.toThrow(/Resend send failed: domain not verified/);
  });
});

describe("magic-link email body", () => {
  it.each([
    ["ja", "YUMEI にログイン"],
    ["ko", "YUMEI 로그인"],
  ] as const)(
    "uses %s for the subject, body and document language",
    async (locale, subject) => {
      process.env.RESEND_API_KEY = "re_test";
      resendSendMock.mockResolvedValue({ data: { id: "x" }, error: null });
      const { sendMagicLinkEmail } = await import("./email");
      const url = "https://example.com/verify?token=locale-test";
      await sendMagicLinkEmail({
        to: "user@example.com",
        magicLinkUrl: url,
        locale,
      });
      const mail = resendSendMock.mock.calls[0][0];
      expect(mail.subject).toBe(subject);
      expect(mail.html).toContain(`lang="${locale}"`);
      expect(mail.text).toContain(url);
      expect(mail.html).toContain(url);
    }
  );
  it("uses the selected Chinese language without changing the login URL", async () => {
    process.env.RESEND_API_KEY = "re_test";
    resendSendMock.mockResolvedValue({ data: { id: "x" }, error: null });
    const { sendMagicLinkEmail } = await import("./email");
    const url = "https://example.com/verify?token=localized-test";
    await sendMagicLinkEmail({
      to: "user@example.com",
      magicLinkUrl: url,
      locale: "zh-CN",
    });
    const mail = resendSendMock.mock.calls[0][0];
    expect(mail.subject).toBe("登录 YUMEI");
    expect(mail.text).toContain("15 分钟");
    expect(mail.html).toContain('lang="zh-CN"');
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
  });
  it("includes the URL in both text and html bodies", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@example.com";
    resendSendMock.mockResolvedValue({ data: { id: "x" }, error: null });

    const { sendMagicLinkEmail } = await import("./email");
    const url = "https://example.com/verify?token=tok-12345";
    await sendMagicLinkEmail({ to: "user@example.com", magicLinkUrl: url });

    const args = resendSendMock.mock.calls[0][0];
    expect(args.text).toContain(url);
    expect(args.html).toContain(url);
    expect(args.subject).toMatch(/Sign in/);
  });
});
