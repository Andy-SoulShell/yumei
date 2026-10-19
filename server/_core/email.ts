import { Resend } from "resend";
import nodemailer from "nodemailer";
import { ENV } from "./env";
import { log } from "./log";

/**
 * Email sender abstraction (Phase 1b-ii.1 / ADR 0006).
 *
 * Two drivers ship in this PR:
 *   - **Resend** — the recommended default. Set `RESEND_API_KEY`
 *     and `EMAIL_FROM`. Free tier covers ~100/day for dev.
 *   - **SMTP** — the self-hoster fallback. Set `EMAIL_PROVIDER=smtp`
 *     and `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`.
 *
 * Local Docker runs can explicitly select EMAIL_PROVIDER=stdout.
 * Dev/test also fall back to stdout when no service is configured.
 * The complete login link is printed for copying into the browser.
 */

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  magicLinkUrl: string;
};

interface EmailDriver {
  send(args: SendArgs): Promise<void>;
}

class ResendDriver implements EmailDriver {
  private client: Resend;
  private from: string;
  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }
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

class SmtpDriver implements EmailDriver {
  private transporter: ReturnType<typeof nodemailer.createTransport>;
  private from: string;
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
 * Local development driver. Prints the complete link without truncating tokens.
 */
class StdoutDriver implements EmailDriver {
  async send({ to, subject, magicLinkUrl }: SendArgs) {
    // This explicit local driver prints a single copyable line; the normal
    // logger truncates long strings, which would invalidate login tokens.
    console.log(
      "[email:stdout]",
      JSON.stringify({
        to: typeof to === "string" ? to : "[redacted]",
        subject,
        magicLinkUrl,
      })
    );
  }
}

let cachedDriver: EmailDriver | null = null;

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

  // Default: Resend if RESEND_API_KEY is set; otherwise stdout in dev.
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

/** Test-only: forces the next call to re-read env. */
export function _resetEmailDriverForTests() {
  cachedDriver = null;
}

/**
 * Send a magic-link email. The plaintext body intentionally surfaces
 * the URL so users on plain-text mail clients still get the link;
 * the HTML body adds presentation polish.
 */
export async function sendMagicLinkEmail(args: {
  to: string;
  magicLinkUrl: string;
}) {
  const driver = getDriver();
  const subject = "Sign in to YUMEI";
  const text = [
    `Hi,`,
    ``,
    `Click the link below to sign in to YUMEI:`,
    ``,
    args.magicLinkUrl,
    ``,
    `This link expires in 15 minutes and can only be used once.`,
    ``,
    `If you didn't request this, you can safely ignore this email.`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;max-width:480px;margin:40px auto;padding:0 16px;">
  <h2 style="color:#e91e63;margin:0 0 16px 0;">Sign in to YUMEI</h2>
  <p>Click the button below to sign in. The link expires in 15 minutes and can only be used once.</p>
  <p style="margin:32px 0;">
    <a href="${args.magicLinkUrl}" style="display:inline-block;padding:12px 24px;background:#e91e63;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a>
  </p>
  <p style="color:#666;font-size:13px;">If the button doesn't work, paste this URL into your browser:</p>
  <p style="color:#666;font-size:13px;word-break:break-all;"><a href="${args.magicLinkUrl}" style="color:#e91e63;">${args.magicLinkUrl}</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="color:#999;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
</body></html>`;
  await driver.send({
    to: args.to,
    subject,
    html,
    text,
    magicLinkUrl: args.magicLinkUrl,
  });
}
