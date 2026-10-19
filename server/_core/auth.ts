import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import { ENV } from "./env";
import { sendMagicLinkEmail } from "./email";
import { getTrustedAuthOrigins } from "./authOrigins";

/**
 * Better-Auth email magic-link authentication backed by Drizzle/MySQL.
 * No auth instance is created when tests omit DATABASE_URL.
 */
function getAuthDb() {
  if (!ENV.databaseUrl) {
    return null;
  }
  return drizzle(ENV.databaseUrl, { schema, mode: "default" });
}

const authDb = getAuthDb();

// Public URL of this deployment (ENV.publicUrl = BETTER_AUTH_URL, or
// http://localhost:PORT in dev). Magic links and trusted origins derive
// from it so any port works without extra config.
const PORT = process.env.PORT || "3000";
const BASE_URL = ENV.publicUrl;

export const auth = authDb
  ? betterAuth({
      appName: "YUMEI",
      database: drizzleAdapter(authDb, {
        provider: "mysql",
        schema: {
          user: schema.users,
          session: schema.sessions,
          account: schema.accounts,
          verification: schema.verifications,
        },
      }),
      // YUMEI uses varchar IDs consistently across all four auth tables.
      baseURL: BASE_URL,
      // Session-token signing secret. Reuses JWT_SECRET (validated >= 32
      // chars at boot) so self-hosters manage one fewer variable.
      secret: ENV.cookieSecret,
      // Sessions live for 30 days; refreshed within the last 7 of those.
      session: {
        expiresIn: 60 * 60 * 24 * 30,
        updateAge: 60 * 60 * 24 * 7,
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5, // 5 minutes
        },
      },
      // Better-Auth defaults the cookie names to `better-auth.session_token`
      // and `better-auth.session_data`. We let it own those names; the
      // tRPC logout route clears both for defense-in-depth.
      // Local Docker stdout mode accepts loopback aliases on the public port.
      // Hosted deployments continue to trust only the configured public origin.
      trustedOrigins: ENV.isProduction
        ? getTrustedAuthOrigins(
            BASE_URL,
            process.env.EMAIL_PROVIDER === "stdout"
          )
        : [BASE_URL, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
      plugins: [
        magicLink({
          // Login links expire after 15 minutes.
          expiresIn: 60 * 15,
          disableSignUp: false, // anyone with an email can sign in
          sendMagicLink: async ({ email, url }) => {
            await sendMagicLinkEmail({ to: email, magicLinkUrl: url });
          },
        }),
      ],
    })
  : (null as unknown as ReturnType<typeof betterAuth>);

/**
 * Helper used by the tRPC context to resolve the current user from
 * the Better-Auth session cookie. Returns null in test mode where
 * `auth` is itself null.
 */
export async function getSessionUser(req: { headers: any }) {
  if (!auth) return null;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    return session?.user ?? null;
  } catch {
    return null;
  }
}

export type AuthSessionUser = NonNullable<
  Awaited<ReturnType<typeof getSessionUser>>
>;
