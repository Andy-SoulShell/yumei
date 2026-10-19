# ADR 0006 — Auth library: Better-Auth (supersedes ADR 0003)

- **Status:** Accepted
- **Date:** 2026-04-30
- **Decision-makers:** Project owner
- **Supersedes:** [ADR 0003](./0003-auth-replacement-lucia.md)
- **Related:** [ADR 0002](./0002-monetization-model.md), [REFACTORING.md → Phase 1b](../REFACTORING.md)
- **Implementation:** Phase 1b-ii.1 (this branch)

## Context

[ADR 0003](./0003-auth-replacement-lucia.md), accepted earlier today,
chose **Lucia v3** as the replacement for the Manus-hosted OAuth flow.
The accepted reasoning emphasized "active maintenance + community
signing on for the long haul."

That reasoning was wrong by the time we tried to install. As of
2026-04-30, npm shows:

```
+ lucia 3.2.2 deprecated
+ @lucia-auth/adapter-drizzle 1.1.0 deprecated
+ oslo 1.2.1 deprecated
```

The Lucia maintainer has put the library into maintenance mode and
recommended either DIY (`@oslojs/*` primitives) or migration to a
sibling library. Building a security-critical auth path on a
deprecated foundation directly contradicts ADR 0003's own reasoning.

The decision must be revisited.

## Decision

Adopt **[Better-Auth](https://better-auth.com/) v1.6** as the auth
library. ADR 0003 is superseded.

### What Better-Auth gives us

- **Mature, post-v1.** Better-Auth is at v1.6.9 in 2026-04. The
  pre-1.0 churn that was the original reason to pass on it
  (in ADR 0003's "Why Lucia over the alternatives" table) is over.
- **Active maintenance.** Not deprecated; weekly releases.
- **Batteries included.** Sessions, magic-link plugin, social-OAuth
  providers (GitHub / Google / Apple / Discord), passkey/WebAuthn,
  email-and-password (which we don't use), 2FA — all first-party
  plugins. No more "stitch together Lucia + arctic + custom magic-link
  + custom session storage."
- **Drizzle adapter built-in.** Configures via
  `drizzleAdapter(db, { provider: "mysql" })`. No separate package.
- **Framework agnostic.** Mounts as an Express handler at a single
  route prefix (`/api/auth/*`). Plays well with our existing Express
  + tRPC setup.
- **Type-safe client SDK.** `createAuthClient()` gives the frontend
  end-to-end types just like tRPC.

### Sign-in shape we're shipping

Phase 1b-ii.1 (this branch):
1. **Email magic-link** as the primary self-hostable path.
   Better-Auth's `magicLink()` plugin handles token generation,
   storage, and consumption. We supply the email-sender callback
   (Resend default; SMTP fallback configured via env).

Phase 1b-ii.2 (next branch):
2. **GitHub OAuth** via Better-Auth's `socialProviders` config.
   ~10 lines once the `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
   env vars are in place.

### State integrity (closes issue #7)

Better-Auth's OAuth provider implementation includes HMAC-signed
state and a session-bound nonce by default — same property Lucia
would have given us. Issue #7 closes when Phase 1b-ii.2 ships.

## Migration strategy

Same shape as ADR 0003: one-shot, not gradual. The repo is in
`DO NOT DEPLOY` status so live-user impact is zero.

- The Manus-OAuth code path is **deleted**, not deprecated.
- Better-Auth generates a `session` table; we add it via Drizzle
  migration. It also expects an `account` table and a
  `verification` table for OAuth and magic-link respectively.
- Existing `users` table is reused. We add the columns Better-Auth
  needs (`emailVerified`, possibly `image`) but keep the existing
  ones (`openId`, `loginMethod`, `role`) so historical data isn't
  lost. `openId` becomes legacy and unused.

## Why Better-Auth over the remaining alternatives

| Option | Why we picked / didn't pick |
| --- | --- |
| **Better-Auth v1.6** ✅ | Post-v1, mature, actively maintained, batteries-included for everything we need (magic-link + OAuth + future passkey). Drizzle MySQL adapter built in. Type-safe client. |
| Lucia v3 (the old pick) | **Deprecated** as of 2026-04. Same-day supersede. |
| DIY with `@oslojs/*` + arctic | Lucia author's recommended path. Maximum freedom, minimum dependencies. But: ~300 lines of token / session / consumption logic we'd own + test. For a launchable product, the buy-vs-build math now favors buy. Reconsider if we ever outgrow Better-Auth. |
| Hosted (Auth0 / Clerk / Supabase Auth) | Solve the wrong problem — we want self-hostable. Same as ADR 0003. |
| Roll back to Manus OAuth + add HMAC | Doesn't address the dependency on Manus, which is the original blocker. |

## Consequences

- **ADR 0003's implementation plan is mostly intact.** The Drizzle
  schema shape is similar (sessions table, magic-link verification
  table), the env-var changes are similar (Resend / SMTP / future
  GitHub OAuth), the frontend login page changes are similar (email
  input → magic link). The library underneath is different but the
  contour of the change is the same.
- **`server/_core/sdk.ts` (Manus SDK) is still deleted in
  Phase 1b-ii.2.** No change.
- **`OAUTH_SERVER_URL` / `OWNER_OPEN_ID` / `VITE_APP_ID` env vars
  still go away.** No change.
- **Frontend gets `@better-auth/react` (or our wrapper)** instead of
  hand-rolled fetch calls. Cleaner end result.
- **Phase 1c billing integration is unaffected.** Better-Auth doesn't
  know about billing; subscriptions live in a separate table keyed by
  user id, which Better-Auth manages.
- **Test infrastructure matures slightly.** Better-Auth ships a test
  helper for creating a fake authenticated session — useful for the
  Phase 4 testcontainer push.

## Why we're confident this won't supersede again next week

- Better-Auth crossed v1 in 2025; the breaking-change window is over.
- The dependency tree (`@better-auth/utils`, `arctic`, `kysely-core`)
  is composed of libraries with multiple maintainers — no single point
  of failure like Lucia had.
- Owner intent is unchanged: self-hostable, magic-link primary,
  GitHub secondary. Any future library swap would only happen if
  Better-Auth itself entered maintenance mode, which the velocity
  metrics don't suggest.

## References

- Better-Auth docs: https://better-auth.com/
- Magic Link plugin: https://better-auth.com/docs/plugins/magic-link
- Drizzle integration: https://better-auth.com/docs/adapters/drizzle
- Original ADR being superseded: [ADR 0003](./0003-auth-replacement-lucia.md)
