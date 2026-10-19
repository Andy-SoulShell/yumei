# yumei Refactoring Plan

> **Status:** ✅ Core productionization done — the app is self-hostable and
> deployable. Milestones M1–M4 (self-host + retention + billing + experience,
> summarized in the root `README.md`) are complete. Remaining items are
> non-blocking hardening: data-layer foreign keys/indexes (Phase 2), the
> architecture split (Phase 3), CI + structured logging (Phase 5), and full
> i18n (Phase 6). The **DO NOT DEPLOY** freeze that used to head this file is
> lifted.
> **Goal:** Take the v3.0 MVP to a state suitable for **commercial production**
> **and open-source community use**, without changing the core tech stack.

---

## Why we are doing this

A diagnostic review of the v3.0 MVP (see commit history of this branch and the
issue list seeded from `docs/issues-to-file.md`) surfaced production blockers
in five areas:

1. **Security** — user API keys stored in plaintext; tRPC routes acting as
   open proxies; ownership checks happen *after* writes; no rate limiting.
2. **Data layer** — zero foreign keys, zero indexes, hand-rolled cascade
   deletes, N+1 patterns in search, silent fallback when DB is unconfigured.
3. **Architecture** — two ~1000-line god files (`server/routers.ts`,
   `server/db.ts`); AI providers implemented as inline `axios.post` with no
   timeout/retry/circuit-breaker; mood/intimacy/selfie heuristics scattered
   between transport and data layers.
4. **Test reality** — 143 tests but mostly trivial; no mocks of `db` or
   `storage`; running the suite without a configured DB silently no-ops all
   writes and tests still pass.
5. **Operations** — no Dockerfile, no CI, no `.env.example` (until Phase 0),
   no structured logging, no error tracking, no health checks, no graceful
   shutdown, broken PWA service-worker icon paths, 100% hardcoded Chinese UI.

The owner has made a **product-direction decision** (see ADR 0002) that also
forces a Phase 1 redesign: the user-supplied API-key model is being replaced
with **operator-managed API keys + a subscription billing tier** (with
optional BYOK as a power-user mode).

---

## Tech stack — kept as-is

The following choices are confirmed and will not change during the refactor:

| Layer        | Choice                                  |
| ------------ | --------------------------------------- |
| Runtime      | Node 22 LTS (pinned via `.tool-versions`) |
| Frontend     | React 19 + TypeScript + Tailwind 4      |
| API          | tRPC 11 + zod                           |
| Server       | Express 4                               |
| ORM          | Drizzle                                 |
| DB           | MySQL 8                                 |
| Bundling     | Vite (dev) + esbuild (prod)             |
| UI primitives| shadcn/ui + Radix                       |

See **ADR 0001** for the supporting toolchain (Homebrew / mise / pnpm /
OrbStack / docker MySQL).

---

## Phased roadmap

Each phase has a clear **Definition of Done** (DoD). We do **not** start
phase N+1 until phase N's DoD is met.

### 📍 Phase 0 — Local-dev bootstrap & planning *(this PR)*

- Toolchain pinned (`.tool-versions`)
- `.env.example` describing the current shape
- `docs/REFACTORING.md` (this file) + ADR index
- `docs/issues-to-file.md` — diagnosis findings as discrete tickets
- Local dev verified end-to-end (Mac → docker MySQL → `pnpm dev` → 200)

**DoD:**
- [x] `pnpm install` and `pnpm dev` work on a fresh Mac after running the
      install steps in `README.md`.
- [x] Diagnosis is captured in version-controlled docs (no Notion-only artifacts).
- [ ] GitHub issues created from `docs/issues-to-file.md` (manual, after PR review).

### 🔒 Phase 1 — Security hardening + monetization re-shape

- Drop user-supplied API keys from the public surface area; introduce a
  pluggable `KeyProvider` abstraction that resolves operator master keys via
  `env://` (dev/self-host) or `kms://` (commercial deployments).
- Wire Stripe (or alternative) subscription billing; track per-user token
  spend; enforce server-side quotas.
- Fix the five **C-critical** issues from the diagnosis (encrypt-at-rest is
  largely obviated by the BYOK removal; remaining: ownership-before-write,
  rate limits, JWT secret fail-fast, OAuth state HMAC, CSP/CSRF).
- Replace silent OAuth/Forge integrations with a self-hostable auth path
  (likely Lucia or a minimal email-magic-link flow) so contributors can run
  the project without Manus credentials.

**DoD:** every C-issue has a regression test that fails on the v3.0 commit
and passes on the Phase-1 head.

### 🗄 Phase 2 — Data layer

- Drizzle migration adding foreign keys (`ON DELETE CASCADE` where correct)
  and composite indexes on the hot read paths.
- Replace `LIKE '%kw%'` search with MySQL `FULLTEXT` (or a lightweight
  external index — TBD via ADR).
- Wrap multi-table mutations in `db.transaction()`; kill loop-based bulk ops.
- Boot-time DB-required check (no more silent empty-arrays in production).

**DoD:** search latency < 200 ms p95 on 100k message corpus; transaction-
rollback test passes for cascade-delete failure injection.

### 🏗 Phase 3 — Architecture

- Split `server/routers.ts` into per-domain files under `server/routers/`.
- Split `server/db.ts` into `server/repositories/` (data access) and
  `server/services/` (business logic).
- Introduce `server/providers/` with `LLMProvider`, `TTSProvider`,
  `STTProvider`, `ImageProvider` interfaces — each with timeout, retry-with-
  backoff, and a simple circuit breaker.
- Move mood/intimacy/selfie heuristics into `shared/` modules (matching the
  pattern of the existing clean `shared/intimacy.ts`).

**DoD:** no source file > 400 lines; business logic unit-testable without
booting Express; provider interface has a 100% mock implementation.

### 🧪 Phase 4 — Tests

- Delete the trivial `getLevelByPoints(50).level === 2` style tests.
- Write ~20 high-leverage tests covering: cross-user data leakage,
  rate-limit enforcement, intimacy decay-on-read race, transaction rollback,
  provider fallback, CSRF, OAuth state tampering.
- Frontend: minimal `@testing-library/react` smoke tests for login, send-
  message, settings save.
- DB tests use `testcontainers` (no shared local MySQL).

**DoD:** test suite runs hermetically (`pnpm test` requires only docker);
mutation-coverage of the security-critical modules > 80% on the lines we own.

### 🚀 Phase 5 — Ops

- Multi-stage Dockerfile + `docker-compose.yml` for local dev.
- GitHub Actions: typecheck, lint, test, build (matrix on Node 22).
- Structured logging via `pino` with secret-redaction.
- Sentry (or self-hosted GlitchTip) for error tracking.
- `/healthz` (liveness) + `/readyz` (DB ping).
- SIGTERM graceful shutdown.
- Fix PWA SW icon paths so the offline path actually works.
- `DEPLOY.md` with a clean Railway runbook (the owner's chosen target).

**DoD:** push to `main` deploys to Railway; CI is required for merge.

### 🎨 Phase 6 — Frontend & i18n

- Decompose `Settings.tsx` (1932 lines), `Home.tsx` (987), `Chat.tsx` (776)
  into composed components driven by `react-hook-form` + `zod`.
- Drop or quarantine `ComponentShowcase.tsx` (1437 lines, likely dead code).
- Migrate hardcoded zh-CN strings to `react-i18next` with zh-CN + en bundles.
- Implement data-export and account-deletion endpoints (PIPL/GDPR baseline).

**DoD:** no source file > 500 lines; UI passes `lang=en` smoke test;
account-deletion request can be self-served end-to-end.

---

## Branching & review process

- `main` is always deployable. Releases come from `main` only.
- Each phase opens a long-lived branch named `phase-N/<slug>` (e.g.
  `phase-0/setup`).
- PRs target `main` once a phase's DoD is met.
- The owner reviews each phase's PR as a unit (decided in the kickoff
  conversation — small per-file PRs were rejected as too noisy).
- Architectural decisions land in `docs/adr/NNNN-<slug>.md` (numbered,
  immutable; superseded ADRs are linked, not edited).

---

## ADR index

| ID    | Title                                       | Status   |
| ----- | ------------------------------------------- | -------- |
| 0001  | Toolchain choices for local dev             | Accepted |
| 0002  | Monetization: subscription + BYOK           | Accepted |
| 0003  | Auth replacement: Lucia v3                  | ⛔ Superseded by 0006 |
| 0004  | Billing platform: Lemon Squeezy             | Accepted |
| 0005  | Pricing tiers, free-tier limits, refunds    | Accepted |
| 0006  | Auth library: Better-Auth (supersedes 0003) | Accepted |

---

## Tracking

- All concrete to-do items live as **GitHub issues** (created from
  `docs/issues-to-file.md`), labeled by phase.
- This document captures direction; issues capture work.
- Both are in version control, so newcomers can read the plan from a clone
  alone — no Notion, no Linear-only state.
