/** 认证邮件发送驱动；支持 Resend、SMTP 和显式本地日志输出。 */

import { Resend } from "resend";
import nodemailer from "nodemailer";
import { ENV } from "./env";
import { log } from "./log";
import { translate } from "../../shared/i18n";
import { FALLBACK_LOCALE, type Locale } from "../../shared/locales";

/** 一封认证邮件的收件人、主题、正文、用途与操作链接。 */

type EmailPurpose =
  "magic-link" | "verification" | "reset-password" | "account-deletion";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  url: string;
  purpose: EmailPurpose;
};

/** 认证邮件驱动约定，发送失败时向调用方传播错误。 */
interface EmailDriver {
  /** 发送已经构建好的认证邮件，失败时拒绝 Promise。 */
  send(args: SendArgs): Promise<void>;
}

/** 通过 Resend 发送认证邮件，使用运营方配置的发信身份。 */
class ResendDriver implements EmailDriver {
  private client: Resend;
  private from: string;
  /** 保存 Resend 客户端和发信身份，不在构造时发送邮件。 */
  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }
  /** 向 Resend 提交邮件，接口返回错误时抛出异常。 */
  async send({ to, subject, html, text }: SendArgs) {
    const { error } = await this.client.emails.send({
      from: this.from,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}

/** 通过 SMTP 发送认证邮件，465 端口使用隐式 TLS。 */
class SmtpDriver implements EmailDriver {
  private transporter: ReturnType<typeof nodemailer.createTransport>;
  private from: string;
  /** 按 SMTP 主机、端口和凭据创建传输客户端。 */
  constructor(opts: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  }) {
    this.transporter = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth: { user: opts.user, pass: opts.pass },
    });
    this.from = opts.from;
  }
  /** 通过 SMTP 发送文本和 HTML 正文，发送错误向外传播。 */
  async send({ to, subject, html, text }: SendArgs) {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      text,
    });
  }
}

/**
 * 将完整认证链接输出到本地日志，便于开发与本机 Docker 登录。
 *
 * @remarks 日志中包含可登录令牌，仅适用于受控的本机调试环境。
 */
class StdoutDriver implements EmailDriver {
  /** 输出完整的本地认证链接，避免普通日志脱敏或截断令牌。 */
  async send({ to, subject, url, purpose }: SendArgs) {
    // 保持登录链接完整且可复制；普通日志截断长字符串会破坏令牌。
    console.log(
      "[email:stdout]",
      JSON.stringify({
        to: typeof to === "string" ? to : "[redacted]",
        subject,
        purpose,
        [purpose === "magic-link" ? "magicLinkUrl" : "url"]: url,
      })
    );
  }
}

let cachedDriver: EmailDriver | null = null;

/** 按显式配置选择并缓存邮件驱动，生产缺少真实服务配置时抛出错误。 */
function getDriver(): EmailDriver {
  if (cachedDriver) return cachedDriver;

  const provider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  const from = process.env.EMAIL_FROM ?? "noreply@yumei.local";

  if (provider === "stdout") {
    cachedDriver = new StdoutDriver();
    return cachedDriver;
  }

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      throw new Error(
        "EMAIL_PROVIDER=smtp requires SMTP_HOST / SMTP_USER / SMTP_PASS"
      );
    }
    cachedDriver = new SmtpDriver({ host, port, user, pass, from });
    return cachedDriver;
  }

  // 未显式选驱动时，有 Resend 密钥则发信，否则仅开发/测试回退日志输出。
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    cachedDriver = new ResendDriver(resendKey, from);
    return cachedDriver;
  }

  if (ENV.isProduction) {
    throw new Error(
      "No email provider configured in production. Set RESEND_API_KEY or EMAIL_PROVIDER=smtp + SMTP_*."
    );
  }

  log.warn(
    "[email] No email provider configured; using stdout fallback (dev/test only)"
  );
  cachedDriver = new StdoutDriver();
  return cachedDriver;
}

/** 清除邮件驱动缓存，仅供测试切换环境变量后使用。 */
export function _resetEmailDriverForTests() {
  cachedDriver = null;
}

/** 转义邮件文本与链接属性，避免查询参数或文案被解释为 HTML。 */
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const emailMessages = {
  "account-deletion": {
    subject: "privacy:deleteEmailSubject",
    instruction: "privacy:deleteEmailInstruction",
    action: "privacy:deleteEmailAction",
    expiry: "email:expiry",
  },
  "magic-link": {
    subject: "email:subject",
    instruction: "email:instruction",
    action: "email:signIn",
    expiry: "email:expiry",
  },
  verification: {
    subject: "email:verificationSubject",
    instruction: "email:verificationInstruction",
    action: "email:verificationAction",
    expiry: "email:verificationExpiry",
  },
  "reset-password": {
    subject: "email:resetSubject",
    instruction: "email:resetInstruction",
    action: "email:resetAction",
    expiry: "email:expiry",
  },
} as const;

type AuthEmailArgs = { to: string; url: string; locale?: Locale };

/** 构建本地化认证邮件，令牌有效期与单次消费由 Better-Auth 负责。 */
async function sendAuthEmail(purpose: EmailPurpose, args: AuthEmailArgs) {
  const locale = args.locale ?? FALLBACK_LOCALE;
  const keys = emailMessages[purpose];
  const subject = translate(keys.subject, locale);
  const instruction = translate(keys.instruction, locale);
  const expiry = translate(keys.expiry, locale);
  const ignore = translate("email:ignore", locale);
  const fallback = translate("email:fallback", locale);
  const text = [
    translate("email:greeting", locale),
    "",
    instruction,
    "",
    args.url,
    "",
    expiry,
    "",
    ignore,
  ].join("\n");
  const url = escapeHtml(args.url);
  const html = `<!doctype html>
<html lang="${locale}"><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;max-width:480px;margin:40px auto;padding:0 16px;">
  <h2 style="color:#e91e63;margin:0 0 16px 0;">${escapeHtml(subject)}</h2>
  <p>${escapeHtml(instruction)} ${escapeHtml(expiry)}</p>
  <p style="margin:32px 0;">
    <a href="${url}" style="display:inline-block;padding:12px 24px;background:#e91e63;color:white;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(translate(keys.action, locale))}</a>
  </p>
  <p style="color:#666;font-size:13px;">${escapeHtml(fallback)}</p>
  <p style="color:#666;font-size:13px;word-break:break-all;"><a href="${url}" style="color:#e91e63;">${url}</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="color:#999;font-size:12px;">${escapeHtml(ignore)}</p>
</body></html>`;
  await getDriver().send({
    to: args.to,
    subject,
    html,
    text,
    url: args.url,
    purpose,
  });
}

/** 发送十五分钟有效、单次使用的邮箱登录链接。 */
export function sendMagicLinkEmail(args: {
  to: string;
  magicLinkUrl: string;
  locale?: Locale;
}) {
  return sendAuthEmail("magic-link", { ...args, url: args.magicLinkUrl });
}

/** 发送注册或重新请求的邮箱验证链接。 */
export function sendVerificationEmail(args: AuthEmailArgs) {
  return sendAuthEmail("verification", args);
}

/** 发送十五分钟有效、单次使用的密码重置链接。 */
export function sendPasswordResetEmail(args: AuthEmailArgs) {
  return sendAuthEmail("reset-password", args);
}

export function sendAccountDeletionEmail(args: AuthEmailArgs) {
  return sendAuthEmail("account-deletion", args);
}
