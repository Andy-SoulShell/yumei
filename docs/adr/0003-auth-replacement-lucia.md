# ADR 0003 — Auth replacement: Lucia v3

- **Status:** ⛔ **SUPERSEDED by [ADR 0006](./0006-auth-library-supersedes-0003.md)** (2026-04-30)
- **Date:** 2026-04-30 (accepted) → 2026-04-30 (superseded same-day)
- **Decision-makers:** Project owner
- **Related:** [ADR 0002](./0002-monetization-model.md), [ADR 0006](./0006-auth-library-supersedes-0003.md), [REFACTORING.md → Phase 1b](../REFACTORING.md)
- **Implementation:** Phase 1b-ii branch (`phase-1b-ii/auth-replacement`)

> **⚠️ Superseded same day.** Within hours of acceptance, attempting to
> install Lucia v3 surfaced `deprecated` markers on `lucia`,
> `@lucia-auth/adapter-drizzle`, and `oslo`. The maintainer's decision
> to put the library into maintenance mode invalidates the rationale
> below ("active maintenance + community signing on for the long
> haul"). See **ADR 0006** for the replacement decision (Better-Auth)
> and the full reasoning. The text below is retained verbatim as the
> historical record of what we initially picked and why.

## Context

The v3.0 MVP authenticates users through a **Manus-hosted OAuth
service**: the frontend redirects to `${OAUTH_SERVER_URL}/oauth/...`
with a base64-encoded state string, the server exchanges the code at
`/webdev.v1.WebDevAuthPublicService/ExchangeToken`, and the resulting
session is signed with `JWT_SECRET` and stored in an httpOnly cookie.

This implementation has three blocking problems for our launch goal:

1. **External dependency on Manus.** Self-hosters cannot run the open-
   source codebase without Manus credentials. Commercial deployments
   are coupled to a third party we don't control.
2. **No HMAC on OAuth state** (legacy auth issue #7).
   `state = btoa(redirectUri)` carries no integrity check; an attacker
   can forge any state value, enabling open-redirect / login-CSRF
   variants. (Issue #7 was deferred from Phase 1a-ii precisely because
   the right fix is to do it inside the new auth flow.)
3. **Email and login-method handling is fragile** — the SDK has a
   custom `deriveLoginMethod` switch that only knows the platforms
   Manus chooses to advertise. Adding email / passkey / new SSO is
   blocked on Manus shipping it first.

We need a **self-hostable, standards-compliant** auth path that lives
entirely inside this codebase and supports email / OAuth / future
passkey without third-party hops.

## Decision

Adopt **[Lucia v3](https://lucia-auth.com/)** as the auth library.

### What Lucia gives us

- **Session-only library** — no opinions about UI, no opinions about
  frameworks beyond a small adapter. It manages session creation,
  validation, invalidation, and rotation. Token formats and storage
  remain ours to choose.
- **Adapter for Drizzle + MySQL2** out of the box. Sessions live in a
  new `sessions` table; the existing `users` table absorbs Lucia's
  expected fields with no migration drama.
- **Pluggable identity providers.** v3 ships with first-class support
  for the OAuth providers we care about (GitHub, Google, Apple,
  email-magic-link, passkey/WebAuthn). Adding a provider is ~50 lines.
- **Active maintenance + a community signing on for the long haul.**
  v3 (the "library" rewrite of v2) explicitly ships smaller and more
  conservative APIs. Stability is acceptable for a project we expect
  to maintain for years.

### Sign-in shape we're shipping in Phase 1b-ii

Two methods on day one. More can be added incrementally without
schema work.

1. **Email + magic-link** as the primary self-hostable path. No
   passwords. Lucia provides the session primitives; we send a one-
   time-use signed link via email (Resend by default; SMTP env vars
   for self-hosters who prefer their own).
2. **GitHub OAuth** as the developer-friendly secondary, mostly for
   the open-source crowd that already has a GitHub account.

Phase 1b-ii's PR will land both. Future ADRs cover Google / Apple /
passkey when we make those decisions.

### State integrity (closes issue #7)

Lucia's recommended OAuth flow generates a **CSRF-bound, HMAC-signed
state token** automatically and verifies it on callback. Our state-
forging vector simply doesn't exist in the new flow — there's nothing
to retrofit. Issue #7 closes when this PR ships.

### Migration strategy (one-shot, not gradual)

- The Manus-OAuth code path is **deleted**, not deprecated. The repo
  is in `DO NOT DEPLOY` status (per the README banner) so we don't
  need a graceful migration window for live users.
- A drizzle migration adds the `sessions` table and the columns Lucia
  needs on `users` (e.g. `hashedPassword` is not added — we're
  password-less; `email` already exists).
- Existing users in the local dev DB are kept (their `openId` becomes
  legacy and unused). On first login they get a fresh Lucia session.

## Why Lucia over the alternatives

| Option                        | Why we picked / didn't pick                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lucia v3** ✅               | Library, not framework. We own the surface. Drizzle + MySQL adapter ready. Active maintenance. Direct support for email-magic-link + GitHub OAuth in Phase 1b-ii.                                     |
| Better-Auth                   | Newer, faster-moving, nicer DX. Still in pre-1.0 churn. Picking it means absorbing breaking changes into a security-critical path. Reconsider in 6 months.                                            |
| Self-rolled email-magic-link  | Minimum dependencies but maximum surface area to test (token generation, replay protection, rate-limiting, session rotation). We don't get to be sloppy on auth code, and Lucia already got it right. |
| Keep Manus OAuth + add HMAC   | Doesn't address (1) the dependency or (3) the inflexibility. Pure rework.                                                                                                                             |
| Auth0 / Clerk / Supabase Auth | Hosted services. Solve the wrong problem (we want self-hostable). The "free tier" trap is real.                                                                                                       |
| Lucia v2                      | Superseded by v3. Don't start on a deprecated major version.                                                                                                                                          |

## Consequences

- **No more `OAUTH_SERVER_URL` / `OWNER_OPEN_ID` / `VITE_APP_ID` env
  vars after Phase 1b-ii lands.** The `.env.example` schema gets
  cleaner (issue follow-up).
- **`server/_core/sdk.ts` (the Manus SDK wrapper) is deleted.** All
  the `axios.post` calls to `webdev.v1.WebDevAuthPublicService` go
  away. This shrinks the surface of "as any" casts the diagnosis
  flagged.
- **The `users.openId` unique-key column becomes legacy.** We don't
  drop it (might be useful for analytics) but no new code reads it.
  Future ADR may rename it.
- **Cookie + CSRF code from Phase 1a is reused unchanged.** Lucia is
  fine with httpOnly cookies + double-submit token; we keep that
  layer of the stack as-is.
- **A new env var `EMAIL_PROVIDER_API_KEY` (Resend) is required for
  magic-link sending in non-test environments.** Self-hosters can set
  `EMAIL_PROVIDER=smtp` + `SMTP_HOST/USER/PASS` for their own server.
- **Issue #7 closes.** The OAuth-state HMAC is part of Lucia's
  built-in flow rather than a retrofit.

## References

- Lucia v3 docs: https://lucia-auth.com/
- Drizzle adapter: https://github.com/lucia-auth/lucia/tree/main/packages/adapter-drizzle
- Magic-link pattern reference: https://lucia-auth.com/guides/email-and-password
  (we adapt this for password-less by skipping the password column)
