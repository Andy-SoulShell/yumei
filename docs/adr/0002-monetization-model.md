# ADR 0002 — Monetization model: operator-managed keys + subscription, with optional BYOK

- **Status:** Accepted
- **Date:** 2026-04-29
- **Decision-makers:** Project owner

## Context

The v3.0 MVP asks each user to supply their own API keys for OpenRouter (LLM),
fal.ai (image), ElevenLabs / Fish Audio (TTS), and OpenAI / Manus Whisper
(STT). The keys are stored in `apiConfigs.<provider>ApiKey` columns as
plaintext `varchar(200)` and are returned to the browser on every Settings
page render (see diagnosis findings C1, C2).

This was acceptable for an MVP. It is not acceptable for a commercial launch
because:

1. **Plaintext key storage** is a single-DB-leak-away from theft of paid
   third-party credits across the whole user base.
2. **tRPC procedures forwarding raw user-typed keys** turn the server into an
   oracle for credential validation — an open proxy.
3. **No revenue model.** The operator carries the deployment cost (Railway,
   storage, dev time) but extracts no value.
4. **Onboarding friction.** Asking a non-technical end-user to obtain six
   different API keys is a dead-end UX.

The owner has decided to commercialize the project (closed-source service +
open-source codebase). The current key-handling model is the highest-impact
thing to redesign first, and it conditions every subsequent decision in
Phase 1.

## Decision

The default user experience becomes:

> **Subscription tier covers all AI usage. The operator owns and pays for
> all third-party API keys. Per-user usage is metered against quota.**

A **secondary "BYOK" mode** is preserved for power users:

> **Logged-in users may, in Settings, opt to provide their own keys. When
> BYOK is enabled for a key class, that user's traffic uses their key and
> does not consume operator quota.**

### Implementation shape

1. **Drop user-supplied keys from the public surface.** The
   `*.fetchModels`, `*.fetchVoices`, `*.fetchUsage`, `*.fetchCredits` tRPC
   routes that take an `apiKey` input go away. Anything that needs to call
   a vendor uses the operator's master key (or, if BYOK is on, the user's
   stored key — which is read server-side, never returned to the client).

2. **Introduce a `KeyProvider` abstraction.**

   ```ts
   interface KeyProvider {
     get(scope: "operator" | { userId: number }, name: KeyName): Promise<string | null>;
     setUserKey(userId: number, name: KeyName, value: string): Promise<void>;
   }
   ```

   Two drivers ship in Phase 1:

   - `EnvKeyProvider` — reads operator keys from environment variables
     (suitable for self-hosters and dev). Per-user keys are stored
     **encrypted at rest** with libsodium `secretbox`, keyed by an env-
     supplied `KEY_ENCRYPTION_KEY`. The DB column type changes from
     `varchar(200)` to `varbinary(...)` and never returns plaintext to
     the client.
   - `KmsKeyProvider` — operator keys live in AWS KMS / GCP KMS; per-user
     keys are encrypted via KMS-issued data keys (envelope encryption).
     This is the commercial-deployment driver.

   The driver is selected by a single env var:
   `KEY_PROVIDER=env` or `KEY_PROVIDER=aws-kms` (etc.). Fail-fast at boot
   if misconfigured.

3. **Subscription billing.**
   - Stripe Checkout for paid tiers (free / plus / pro). Webhook-driven
     subscription state in a new `subscriptions` table.
   - Token-bucket quota per user: refilled monthly on subscription renewal,
     consumed by `chat.sendMessage` (LLM tokens), `selfie.generate` (image
     credits), `tts` (audio seconds), `voice.transcribe` (audio seconds).
   - Quota state lives in a `usage_meters` table (composite PK `(userId,
     month, meter)`); we reuse it later for per-user usage receipts and
     cost dashboards.
   - Hard quota = HTTP 402 + UI upsell. Soft quota (≥ 80%) triggers a
     banner.

4. **BYOK opt-in.**
   - Settings exposes a per-key-class toggle. Enabling it prompts for the
     key, validates once via a server-side test call, and on success stores
     the encrypted key. The plaintext is never re-displayed; the UI shows
     `sk-...XXXX` plus an `isSet` badge and a "Replace" action.
   - Server-side resolver: if user has BYOK enabled for class X → use the
     user's key for X. Otherwise → use operator key + decrement quota.

## Why both subscription and BYOK?

- **Subscription** is the path to a clean, monetizable, mass-market product
  and matches what users expect from a polished AI companion app.
- **BYOK** is essential for:
  - the open-source self-hosters who run their own copy;
  - power users who want to use a model the operator hasn't whitelisted;
  - reducing operator regulatory exposure for users on plans that demand
    "we never see your prompts" (BYOK + per-user provider routing makes
    that a credible claim).
- The cost of supporting both is mostly UI surface, not server complexity:
  the `KeyProvider` abstraction handles both with a single resolver.

## Consequences

- The current `apiConfigs` schema gets rewritten (Phase 1 migration). The
  per-user-per-provider-key columns become a normalized `user_keys` table
  with `(userId, name, encrypted_value, created_at, last_used_at)`.
- The Settings page UI is materially redesigned (Phase 1 + Phase 6).
- Anyone running the open-source codebase can choose:
  - `KEY_PROVIDER=env` + a single `OPERATOR_*_API_KEY` per provider — and
    skip Stripe entirely (free self-hosting);
  - or run the full commercial stack (`KEY_PROVIDER=aws-kms` + Stripe).
- The diagnosis's **C1 (encrypt at rest)** problem largely dissolves
  because the dominant flow no longer stores per-user keys at all. The
  encryption work still ships — but only for the BYOK minority — which
  reduces blast radius if a per-user key encryption bug ever ships.
- Cost forecasting becomes possible: token-bucket consumption + Stripe
  revenue gives us a real-time margin number.

## Open questions (defer to Phase 1)

- Stripe vs. Lemon Squeezy vs. Paddle for billing? (Tax + China card
  acceptance differ.)
- How to price tiers? Likely token-budget × markup, but needs a survey of
  actual MVP usage from existing data.
- Do we offer a free tier? (Recommendation: yes, capped at ~5 messages/day
  per girlfriend, no image generation, to drive sign-ups without bleeding
  cost.)
- Refund / unused-quota policy.
- Any provider-specific quota nuance (fal.ai's per-image cost varies a
  lot by model).

These are billing-product questions, not architecture questions, so they
do not block the Phase 1 architecture work — `KeyProvider` + subscription
tables + quota enforcement can all be built before final pricing is set.
