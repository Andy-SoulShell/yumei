# Issues filed from the v3.0 → production diagnosis

> **Status:** ✅ All issues have been published as **#2 through #41** in the
> repository's issue tracker. This document is preserved as the genesis
> record (so a clone alone is enough to reproduce the publishing step) and
> as the canonical wording. **Edit issues on GitHub, not this file.**

Phase labels (`phase-1`..`phase-6`) are added so we can filter by phase. The
severity labels are: `critical` (blocks Phase 1 / production), `high`,
`medium`, `low`.

**Total: 40 issues.** Severity breakdown: 5 critical, 13 high, 17 medium,
2 low. (The original PR description said "30" — that was an underestimate
from the diagnosis pass; the actual itemized backlog came out to 40 once
each finding was scoped to a single owner-actionable ticket.)

---

## Phase 1 — Security + monetization re-shape

### [critical] [phase-1] [security] Encrypt user-supplied API keys at rest
**Body:** `apiConfigs.*ApiKey` columns are `varchar(200)` plaintext
(`drizzle/schema.ts:108-132`). `apiConfig.get` (`server/routers.ts:624`)
returns them in the clear to the client; Settings displays them in inputs.
A DB dump = mass theft of paid third-party credits across the entire user
base. Fix: drop user-key flow for the default tier (see ADR 0002), encrypt
the BYOK-only minority via libsodium `secretbox` keyed by a `KeyProvider`
driver. Server never returns plaintext; UI shows `sk-...XXXX` + `isSet`.
**Labels:** `critical`, `security`, `phase-1`

### [critical] [phase-1] [security] Stop forwarding raw user-typed API keys via tRPC
**Body:** `apiConfig.fetchModels`, `fetchElevenLabsVoices`,
`fetchFishAudioModels`, `fetchOpenRouterCredits`, `fetchElevenLabsUsage`,
`fetchFishAudioCredits` (`server/routers.ts:672-849`) accept
`apiKey: z.string().min(1)` from the client. Settings page fires these on
every keystroke (`Settings.tsx:124-138`), so the key is logged in any HTTP
access log / APM. Fix: remove these procedures; route lookups through the
operator key or the user's stored encrypted key, server-side only.
**Labels:** `critical`, `security`, `phase-1`

### [critical] [phase-1] [security] Validate ownership BEFORE writing in chat.sendMessage / selfie.generate
**Body:** `chat.sendMessage` (`server/routers.ts:397-403`) inserts the user
message *before* calling `getConversation(input.conversationId, ctx.user.id)`.
A malicious client can pass any `conversationId` and have the row land in
another user's conversation; the throw on line 408 happens after the write
and there are no FKs to enforce ownership. Same pattern in `selfie.generate`
(`server/routers.ts:519-598`). Fix: ownership check first, wrap message+ai-
reply in `db.transaction()`.
**Labels:** `critical`, `security`, `phase-1`

### [critical] [phase-1] [abuse] Server-side rate limiting + cooldown enforcement
**Body:** `server/_core/index.ts:30-65` has no rate-limit middleware. The
`POINTS_RULES` cooldown / dailyLimit (`shared/intimacy.ts:133-186`) are
documented as "前端会追踪每日上限" — frontend-only enforcement is
defeated by direct tRPC calls. A signed-in user (or anyone who can OAuth
in) can spam `chat.sendMessage`, `selfie.generate`, `voice.transcribe` and
burn operator LLM/image credits. Fix: per-user token bucket on hot routes;
real cooldown / daily caps in `db.ts`; HTTP 429 on overflow.
**Labels:** `critical`, `abuse-prevention`, `phase-1`

### [critical] [phase-1] [security] JWT_SECRET fail-fast at boot
**Body:** `server/_core/env.ts:3` defaults `cookieSecret` to `""`. With an
empty secret, `sdk.signSession` produces JWTs anyone can forge.
`verifySession` accepts them. There is no startup assertion. Fix: at boot,
`assert(env.cookieSecret.length >= 32)`; refuse to start if violated.
**Labels:** `critical`, `security`, `phase-1`

### [high] [phase-1] [security] OAuth state HMAC + nonce binding
**Body:** `decodeState` (`sdk.ts:41-44`) `atob`s the state value into a
redirect URI and uses it directly in the token exchange. No HMAC, no
session-bound nonce. Open redirect + CSRF on the OAuth callback. Fix:
HMAC-sign state with `JWT_SECRET`, bind to a session-scoped nonce, reject
mismatches.
**Labels:** `high`, `security`, `phase-1`

### [high] [phase-1] [security] CSRF protection on tRPC mutations
**Body:** Sessions live in an httpOnly cookie; tRPC mutations are
`application/json` POSTs. There is no CSRF token, no double-submit cookie,
no SameSite=Lax. Combined with `sameSite: 'none'` (`cookies.ts:42-47`) the
attack surface is wide. Fix: SameSite=Lax for first-party deploys, plus
double-submit token for any future cross-site embedding.
**Labels:** `high`, `security`, `phase-1`

### [high] [phase-1] [security] Sanitize markdown / LLM output before render
**Body:** Messages are stored verbatim and (likely) rendered via
`streamdown` markdown. An LLM prompt-injection that returns
`<img src=x onerror=...>` becomes a stored XSS that fires on every
conversation reload. Fix: render through DOMPurify + a strict markdown
allow-list; never inject raw HTML from the model.
**Labels:** `high`, `security`, `phase-1`

### [high] [phase-1] [billing] Stripe subscriptions + per-user quota meters
**Body:** Implement subscription billing per ADR 0002. New tables:
`subscriptions`, `usage_meters`. Webhook-driven state. Quota consumption
in `chat.sendMessage`, `selfie.generate`, `tts.speak`, `voice.transcribe`.
HTTP 402 on overflow with UI upsell.
**Labels:** `high`, `billing`, `phase-1`

### [medium] [phase-1] [security] PII redaction in logs
**Body:** Several `console.error` / `console.log` paths print raw user /
error objects (`server/_core/index.ts` boot logs, `oauth.ts:49`, `db.ts`
`upsertUser` failure). API keys, emails, openIds will end up in stdout
log shippers. Fix: structured logger (Phase 5) with a serializer that
strips known sensitive fields.
**Labels:** `medium`, `security`, `phase-1`

### [medium] [phase-1] [security] Sign or expire storage URLs
**Body:** `storagePut` returns a public, unsigned URL that gets persisted
into `referenceImageUrl` / `imageUrl`. Anyone with the URL can fetch the
image. For a virtual-girlfriend product the content is sensitive. Fix:
short-lived signed URLs + per-user authorization on the read path.
**Labels:** `medium`, `security`, `phase-1`

---

## Phase 2 — Data layer

### [high] [phase-2] [data] Add foreign keys + ON DELETE CASCADE
**Body:** `drizzle/schema.ts` declares `userId` / `girlfriendId` / etc. but
never declares `references(...)`. Cascade deletes are hand-rolled in
`permanentDeleteGirlfriend` (`db.ts:406-436`) with N round-trips per row,
no transaction; a crash mid-loop leaves orphaned messages/selfies. Fix:
schema migration adding FKs with cascade, replace hand-rolled cascade with
a single transaction.
**Labels:** `high`, `data`, `phase-2`

### [high] [phase-2] [perf] Add indexes on hot read paths
**Body:** Tables have only PK indexes. `messages.conversationId`,
`selfies.userId`, `selfies.girlfriendId`, `notifications.userId`,
`girlfriendMoods.userId`, plus `(userId, deletedAt)` on `girlfriends`.
Without indexes every list query becomes a table scan once the data
grows. Fix: a migration adding the composite indexes used by hot tRPC
procedures.
**Labels:** `high`, `performance`, `phase-2`

### [high] [phase-2] [perf] Replace LIKE-based message search with FULLTEXT
**Body:** `conversation.search` (`db.ts:526-602`) does
`LIKE '%keyword%'` against `messages.content`, then issues 3 sequential
queries per match (N+1). On a real corpus this is seconds-to-minutes.
Fix: MySQL FULLTEXT index + parallelized fan-out, or move search to a
dedicated index in Phase 5.
**Labels:** `high`, `performance`, `phase-2`

### [high] [phase-2] [reliability] Fail fast when DATABASE_URL is unset
**Body:** `getDb()` (`db.ts:32-42`) returns `null` if the env var is
missing, and most callers do `if (!db) return [];`. A misconfigured
production pod will appear to work — login succeeds, lists return empty,
"no girlfriend yet" UI shows, all user data appears lost. Fix: assert
the env at boot; refuse to start.
**Labels:** `high`, `reliability`, `phase-2`

### [medium] [phase-2] [data] Wrap multi-table mutations in transactions
**Body:** `softDeleteGirlfriends` (`db.ts:382-392`) issues one UPDATE per
id; `permanentDeleteGirlfriend` does one DELETE per child row. Combine
into transactions + `inArray` bulk ops.
**Labels:** `medium`, `data`, `phase-2`

### [medium] [phase-2] [data] No-side-effect read endpoints
**Body:** `getIntimacyInfo` (`db.ts:898-946`) silently mutates the DB on
read (`UPDATE … intimacyPoints` if decay > 0). Read endpoints performing
writes break HTTP caching and are a debugging nightmare. Fix: move decay
to a periodic job or to write-side calculations.
**Labels:** `medium`, `data`, `phase-2`

### [medium] [phase-2] [data] Configure DB connection pool
**Body:** `drizzle(process.env.DATABASE_URL)` (`db.ts:35`) accepts default
pool settings. Under load this either over-provisions or starves. Fix:
explicit pool config tuned for the deployment target.
**Labels:** `medium`, `data`, `phase-2`

---

## Phase 3 — Architecture

### [high] [phase-3] [arch] Split server/routers.ts into per-domain files
**Body:** `server/routers.ts` is 1185 lines containing 9 routers + business
logic (mood scoring, intimacy bonuses, selfie keyword classifier, system-
prompt assembly). Split into `server/routers/{auth,girlfriend,chat,
selfie,tts,voice,apiConfig,mood,notification}.ts`.
**Labels:** `high`, `architecture`, `phase-3`

### [high] [phase-3] [arch] Split server/db.ts into repositories + services
**Body:** `server/db.ts` (1068 lines) mixes data access with seed content
(`PROACTIVE_MESSAGES`), business policy (`checkAndCreateProactiveNotification`
chooses notification types based on hour-of-day + mood score), and read
endpoints with side-effects. Extract `server/repositories/` (pure data)
and `server/services/` (orchestration).
**Labels:** `high`, `architecture`, `phase-3`

### [high] [phase-3] [arch] Provider abstraction for LLM / TTS / STT / Image
**Body:** Each external provider is a copy-pasted inline `axios.post` block
with no timeout, no retry, no circuit breaker. A hung fal.ai request hangs
the tRPC procedure forever, holding an Express worker = DoS vector. Build
`providers/{LLMProvider,TTSProvider,STTProvider,ImageProvider}` interfaces
with timeout + exponential-backoff retry + circuit breaker; route
`apiConfig.fetch*` and `chat.sendMessage` through them.
**Labels:** `high`, `architecture`, `phase-3`

### [medium] [phase-3] [arch] Move heuristics out of router into shared/
**Body:** Mood keyword lists (`routers.ts:902-914`), proactive-message
templates (`db.ts:776-804`), selfie keyword detector (`routers.ts:55-73`)
all live next to transport-layer code. Move to `shared/` modules so they
can be unit-tested and i18n'd.
**Labels:** `medium`, `architecture`, `phase-3`

### [medium] [phase-3] [arch] Strip `as any` casts from tRPC handlers
**Body:** ~25 `as any` occurrences in server, mostly in axios responses
and `sdk.ts`. `routers.ts:1171-1179` casts a transcription result to `any`
four times in a row, defeating tRPC's type chain. Fix: typed provider
adapters, narrow the response shape at the boundary.
**Labels:** `medium`, `architecture`, `phase-3`

### [medium] [phase-3] [arch] Remove silent port auto-discovery in production
**Body:** `server/_core/index.ts:21-28, 53-58` quietly binds to a non-`$PORT`
port if the requested one is busy. In production this means a pod that
"started" but isn't reachable by the load balancer; ops tooling sees
`up` while serving 100% of traffic to nothing. Fix: keep auto-discovery
for `NODE_ENV=development`; in prod, fail fast on port conflict.
**Labels:** `medium`, `architecture`, `phase-3`

---

## Phase 4 — Tests

### [high] [phase-4] [test] Replace trivial tests with risk-surface tests
**Body:** The 143 tests are mostly trivial (e.g.
`getLevelByPoints(50).level === 2`). They do not exercise side-effecting
code. Many silently no-op when DB env is missing. Audit the suite, delete
no-leverage tests, write ~20 real ones: cross-user data leakage on every
GET, rate-limit enforcement, decay-on-read race, transaction rollback,
provider fallback under network error, OAuth state tampering.
**Labels:** `high`, `test`, `phase-4`

### [medium] [phase-4] [test] Use testcontainers for DB tests
**Body:** Server tests hit real MySQL + real Forge storage and pollute
user IDs `1` / `88888` / `999999` that are never cleaned up. Fix: use
`@testcontainers/mysql` to spin a per-suite container; remove dependence
on a developer-managed local DB.
**Labels:** `medium`, `test`, `phase-4`

### [medium] [phase-4] [test] Frontend smoke tests
**Body:** No `@testing-library/react`, no Playwright, no Cypress in
`package.json`. Add minimal smoke tests: login flow, chat send, settings
save, intimacy badge render. Vitest + RTL is enough for v1.
**Labels:** `medium`, `test`, `phase-4`

---

## Phase 5 — Operations

### [high] [phase-5] [ops] Dockerfile + docker-compose for local + Railway
**Body:** No Dockerfile exists. Add a multi-stage Dockerfile (deps →
build → runtime), plus `docker-compose.yml` that brings up app + MySQL +
Redis-for-rate-limit (Phase 1) for local dev. Railway uses the
Dockerfile directly.
**Labels:** `high`, `ops`, `phase-5`

### [high] [phase-5] [ops] GitHub Actions CI
**Body:** No `.github/workflows`. Add `ci.yml` that runs typecheck +
lint + test + build on PRs and pushes to `main`. Required for merge
once green.
**Labels:** `high`, `ops`, `phase-5`

### [high] [phase-5] [ops] Structured logging + secret redaction
**Body:** Replace `console.log/error` with `pino` (or equivalent). JSON
output, request IDs, log levels, redaction of `*ApiKey`, `email`,
`openId`, cookie headers.
**Labels:** `high`, `ops`, `phase-5`

### [medium] [phase-5] [ops] Health probes + graceful shutdown
**Body:** Add `/healthz` (cheap, always 200) and `/readyz` (DB ping +
provider key resolved). Handle SIGTERM: stop accepting new requests,
drain in-flight, close pool, exit zero.
**Labels:** `medium`, `ops`, `phase-5`

### [medium] [phase-5] [ops] Sentry / error tracking
**Body:** Wire Sentry (or a self-hosted GlitchTip) on server + client.
Filter PII at the SDK layer.
**Labels:** `medium`, `ops`, `phase-5`

### [medium] [phase-5] [ops] Fix PWA service-worker icon paths
**Body:** SW caches `/icon-192x192.png` etc. but the actual files are
named `icon-192.png` / `icon-512.png` in `client/public/`. The first
`cache.addAll` rejects and the install fails silently — PWA offline mode
has been broken since day one. Fix: align names + add a SW versioning
strategy.
**Labels:** `medium`, `ops`, `phase-5`

---

## Phase 6 — Frontend & i18n

### [high] [phase-6] [frontend] Decompose Settings.tsx (1932 lines) with react-hook-form
**Body:** `Settings.tsx` has 32+ `useState` hooks, 6+ `hasUnsaved*Changes`
booleans, localStorage reads inline in initial-state lambdas, and copies
of every server field into local state — despite `react-hook-form` and
`@hookform/resolvers` being installed and unused. Split into composed
sub-pages (Profile / API keys (BYOK) / Voice / Notifications / Billing)
each driven by RHF + zod resolvers.
**Labels:** `high`, `frontend`, `phase-6`

### [high] [phase-6] [frontend] Decompose Home.tsx (987 lines) and Chat.tsx (776 lines)
**Body:** Both pages own multiple unrelated UIs: Home does list / history
sheet / trash sheet / search / batch delete / single delete / default-
girlfriend creation / intimacy badges / mood badges / pull-to-refresh /
logout. Chat embeds an inline `useTTS` hook owning playback state, refs,
autoplay setting. Decompose into `<HomeList>`, `<HistorySheet>`,
`<TrashSheet>`, `<ChatHeader>`, `<MessageStream>`, `<TTSController>`.
**Labels:** `high`, `frontend`, `phase-6`

### [medium] [phase-6] [frontend] Remove or lazy-load ComponentShowcase.tsx
**Body:** `client/src/pages/ComponentShowcase.tsx` is 1437 lines of
component preview shipped in the bundle. Either delete (preferred — we
don't need a Storybook clone) or move behind a lazy route gated by
`NODE_ENV=development`.
**Labels:** `medium`, `frontend`, `phase-6`

### [medium] [phase-6] [i18n] Migrate hardcoded zh-CN strings to react-i18next
**Body:** Every UI string and most error messages are hardcoded Chinese
literals (e.g. `Settings.tsx`, `Home.tsx`, error messages thrown from
`db.ts:48` / `routers.ts:168, 282`). Add `react-i18next` with `zh-CN` +
`en` locales; pass i18n keys through tRPC errors.
**Labels:** `medium`, `i18n`, `phase-6`

### [medium] [phase-6] [compliance] Self-serve data export + account deletion
**Body:** No DSR (data subject request) endpoint exists. PIPL (CN) and
GDPR (EU) both require self-serve export and deletion for a product like
this. Add `account.exportData` (returns a signed download) and
`account.delete` (soft-delete + 30-day permanent purge).
**Labels:** `medium`, `compliance`, `phase-6`

### [low] [phase-6] [frontend] Use the `@shared` alias consistently
**Body:** `Chat.tsx:25` and `Home.tsx:55` import via `"../../../shared/intimacy"`
instead of the configured `@shared` alias. Future moves silently break
one consumer. Lint rule: `no-restricted-imports` against deep relative
paths into `shared/`.
**Labels:** `low`, `frontend`, `phase-6`

### [low] [phase-6] [frontend] Selfie generation needs an explicit consent gate
**Body:** `shouldGenerateSelfieFromText` (`routers.ts:55-73`) triggers
paid image generation whenever the user *or* assistant mentions "现在",
"在哪", "穿". Nearly every casual chat will fire it. Fix: replace the
keyword classifier with an explicit "请生成自拍" UI affordance and a
cost-confirmation toast.
**Labels:** `low`, `frontend`, `phase-6`

---

## Batch-create script (run after owner approves wording)

```bash
# Requires: gh auth login already done, run from repo root.
# Pre-creates labels, then files issues. Idempotent on labels.

set -euo pipefail

repo="${YUMEI_GITHUB_REPO:?Set YUMEI_GITHUB_REPO to owner/repo before filing issues}"

declare -A label_color=(
  [critical]="b60205" [high]="d93f0b" [medium]="fbca04" [low]="0e8a16"
  [security]="ee0701" [abuse-prevention]="ee0701" [data]="0366d6"
  [performance]="1d76db" [reliability]="0e8a16" [architecture]="5319e7"
  [test]="cccccc" [ops]="000000" [frontend]="d4c5f9" [i18n]="d4c5f9"
  [compliance]="bfdadc" [billing]="0052cc"
  [phase-1]="ededed" [phase-2]="ededed" [phase-3]="ededed"
  [phase-4]="ededed" [phase-5]="ededed" [phase-6]="ededed"
)
for name in "${!label_color[@]}"; do
  gh label create "$name" --color "${label_color[$name]}" --repo "$repo" 2>/dev/null || true
done

# Then for each issue above, run a `gh issue create -F body.md ...`
# (left as a manual step — owner reviews wording one last time before
# publishing, since issues are a public artifact under the project.)
```

> When the owner OKs the list, I'll generate the actual `gh issue create`
> commands as a single shell file and run it. Holding off on auto-creation
> avoids issue-spam on the public repo if any wording needs editing.
