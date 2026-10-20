/** Better-Auth 邮箱密码、邮件验证、邮箱链接和数据库会话配置。 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/mysql2";
import { createUtcMysqlPool } from "./mysql";
import * as schema from "../../drizzle/schema";
import { ENV } from "./env";
import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./email";
import { getTrustedAuthOrigins } from "./authOrigins";
import { normalizeLocale } from "../../shared/locales";
import {
  AUTH_LINK_EXPIRES_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../shared/auth";

/** 按认证表 schema 创建 Drizzle 实例，无数据库配置时返回 null。 */
function getAuthDb() {
  if (!ENV.databaseUrl) {
    return null;
  }
  return drizzle(createUtcMysqlPool(ENV.databaseUrl), {
    schema,
    mode: "default",
  });
}

const authDb = getAuthDb();

// 认证链接和可信来源以公开地址为基准；开发默认使用 localhost:PORT。
const PORT = process.env.PORT || "3000";
const BASE_URL = ENV.publicUrl;

/** 共享认证实例，负责邮箱链接和会话持久化；会话有效性以数据库为准。 */
export const auth = authDb
  ? betterAuth({
      appName: "YUMEI",
      database: drizzleAdapter(authDb, {
        provider: "mysql",
        transaction: true,
        schema: {
          user: schema.users,
          session: schema.sessions,
          account: schema.accounts,
          verification: schema.verifications,
        },
      }),
      // 四张认证表统一使用字符串 ID。
      baseURL: BASE_URL,
      // 复用启动时已校验长度的 JWT_SECRET 签名会话令牌。
      secret: ENV.cookieSecret,
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        minPasswordLength: PASSWORD_MIN_LENGTH,
        maxPasswordLength: PASSWORD_MAX_LENGTH,
        resetPasswordTokenExpiresIn: AUTH_LINK_EXPIRES_SECONDS,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }, request) => {
          await sendPasswordResetEmail({
            to: user.email,
            url,
            locale: normalizeLocale(request?.headers.get("x-yumei-locale")),
          });
        },
      },
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: false,
        autoSignInAfterVerification: true,
        expiresIn: AUTH_LINK_EXPIRES_SECONDS,
        sendVerificationEmail: async ({ user, url }, request) => {
          await sendVerificationEmail({
            to: user.email,
            url,
            locale: normalizeLocale(request?.headers.get("x-yumei-locale")),
          });
        },
      },
      rateLimit: {
        enabled: ENV.isProduction,
        window: 60,
        max: 60,
        customRules: {
          "/sign-up/email": { window: 60, max: 3 },
          "/sign-in/email": { window: 60, max: 5 },
          "/request-password-reset": { window: 60, max: 3 },
          "/send-verification-email": { window: 60, max: 3 },
          "/sign-in/magic-link": { window: 60, max: 3 },
          "/reset-password": { window: 60, max: 5 },
        },
      },
      // 会话有效三十天；距离上次更新时间达到七天时可刷新。
      session: {
        expiresIn: 60 * 60 * 24 * 30,
        updateAge: 60 * 60 * 24 * 7,
        cookieCache: {
          enabled: false,
          maxAge: 60 * 5, // 缓存停用后由数据库判断会话是否仍有效
        },
      },
      // 本机 stdout 模式允许公开端口对应的回环别名；托管环境限制为公开来源。
      // Cookie 命名由 Better-Auth 决定，HTTPS 下可能带 __Secure- 前缀。
      trustedOrigins: ENV.isProduction
        ? getTrustedAuthOrigins(
            BASE_URL,
            process.env.EMAIL_PROVIDER === "stdout"
          )
        : [BASE_URL, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
      plugins: [
        magicLink({
          // 邮箱登录链接十五分钟后过期。
          expiresIn: AUTH_LINK_EXPIRES_SECONDS,
          disableSignUp: false, // 新邮箱可自动注册
          sendMagicLink: async ({ email, url }, context) => {
            const locale =
              context?.headers?.get("x-yumei-locale") ??
              context?.request?.headers.get("x-yumei-locale");
            await sendMagicLinkEmail({
              to: email,
              magicLinkUrl: url,
              locale: normalizeLocale(locale),
            });
          },
        }),
      ],
    })
  : (null as unknown as ReturnType<typeof betterAuth>);

/**
 * 从请求头中的会话 Cookie 解析认证用户，无法解析时返回 null。
 *
 * @remarks 此处仅取得认证用户，应用角色与业务资料由上下文另行查库。
 */
export async function getSessionUser(req: { headers: any }) {
  if (!auth) return null;
  const session = await auth.api.getSession({
    headers: req.headers,
    query: { disableCookieCache: true },
  });
  return session?.user ?? null;
}

/** 认证会话成功解析后返回的用户类型。 */
export type AuthSessionUser = NonNullable<
  Awaited<ReturnType<typeof getSessionUser>>
>;
