# ADR 0005 — Pricing tiers, free-tier limits, and refund policy

- **Status:** Accepted
- **Date:** 2026-04-30
- **Decision-makers:** Project owner
- **Related:** [ADR 0002](./0002-monetization-model.md) (subscription + BYOK)

## Context

ADR 0002 left three billing-product questions explicitly open:

1. How to price tiers? (Likely token-budget × markup, but needs a survey
   of actual MVP usage from existing data.)
2. Do we offer a free tier and what is it capped at?
3. Refund / unused-quota policy.

These answers don't block the **architecture** of Phase 1b
(`KeyProvider` + subscription tables) — that work proceeds with these
values as parameters. But locking the answers in now prevents
second-guessing during Phase 1c implementation, when we wire Lemon
Squeezy webhooks and the quota-meter UI.

## Decision

### 1. Pricing — placeholder triple, real research deferred to Phase 1c kickoff

Until we have meaningful billable-user telemetry, formal pricing
research has too thin a base. Use a **competitor-median placeholder
triple** for Phase 1c implementation; revisit ~1 week before launch
with the (by then) real spend data.

| Tier | Price | Anchor |
| --- | --- | --- |
| **Free** | $0 | onboarding / proof-of-value |
| **Plus** | **$9.99 / month** | Character.ai+ ($9.99), Crushon.ai Plus ($9.99) |
| **Pro** | **$19.99 / month** | Replika Pro ($19.99), Crushon.ai Pro ($19.99) |

These are **placeholder values** — they go into Stripe/Lemon Squeezy
products but the final numbers are confirmed in Phase 1c kickoff after
a short structured pricing pass (cost-per-active-user × target margin
× competitor band).

### 2. Free tier limits

The earlier informal proposal of "5 messages/day per girlfriend, no
images" was reconsidered and rejected: 5 messages is below the
threshold where a user can experience the product's core loop, so
they'd churn before the value showed. Replaced with a **broader free
tier** that lets users feel the full experience while keeping per-user
cost trivial.

| Capability | Free | Plus | Pro |
| --- | --- | --- | --- |
| LLM model | gpt-4o-mini (locked) | mainstream models, user-selectable | full catalog incl. Claude Opus |
| Daily chat messages (total) | **30** | 500 | unlimited |
| Selfie image generation | **1 / day** | 30 / month | 100 / month |
| TTS / voice playback | ❌ | ElevenLabs ✅ | ElevenLabs + Fish Audio ✅ |
| Voice transcription (Whisper) | ❌ | ✅ | ✅ |
| Number of girlfriends | **1** | 3 | unlimited |
| BYOK (own provider keys) | ✅ — bypasses all quotas | ✅ | ✅ |
| Soft-delete trash window | 7 days | 7 days | 30 days |
| Customer support | community / docs | email | priority email |

**Cost reasoning for the free tier**

- gpt-4o-mini: ~$0.0001–$0.001 per message at typical lengths.
  30 messages/day ≈ **$0.06/active-day** ≈ ~$1.80/month per active
  free user.
- Image generation: 1/day on a cheap fal.ai model ≈ $0.01–$0.03/day.
- Combined: ≤ ~$3/month/active-free-user — sustainable as a paid-user
  acquisition expense.

**Why we keep BYOK quota-free across all tiers**

- Self-hosters running the open-source code shouldn't have artificial
  caps imposed by a license.
- Power users who want models the operator hasn't whitelisted have a
  legitimate path that doesn't cost the operator anything.
- "We never see your prompts" is a credible privacy claim only if BYOK
  bypasses quota — i.e. the operator never has to count tokens against
  a limit and therefore never has to read the requests.

### 3. Refund and unused-quota policy

Adopt **industry-standard practices verbatim** rather than invent.
All of the below are natively supported by Lemon Squeezy:

| Policy | Setting |
| --- | --- |
| Unused quota | **Does NOT roll over** — resets at each billing cycle (industry standard for SaaS subscriptions) |
| Full-refund window | **7 days from purchase**, no questions asked |
| Refund after 7 days | Pro-rated for the unused portion of the current billing cycle |
| Mid-cycle upgrade | Effective immediately; charged the pro-rated difference |
| Mid-cycle downgrade | Takes effect at the end of the current billing cycle; user retains higher tier until then |
| Cancellation | Subscription ends at the conclusion of the current billing cycle; service continues until then |
| Quota exhaustion (free + paid) | HTTP 402; UI shows upsell + "next reset in N days" |
| Soft-quota warning threshold | At 80% of the monthly limit |

These get codified in the Terms of Service draft when we launch the
subscription portal in Phase 1c.

## Consequences

- Phase 1c can hard-code the three tiers + free-tier limits as
  configuration constants without scope creep.
- The free-tier cost ceiling (~$3/month/active-free-user) is the lower
  bound on the **conversion-or-churn** decision: we can absorb a 30:1
  free-to-paid ratio at $9.99 Plus and still be cash-flow positive on
  AI cost alone (operator margin is everything else).
- BYOK staying quota-free creates a **two-population product**: a
  managed subscription for normies, a self-host/BYOK path for technical
  users. The same codebase serves both with a single feature flag; the
  consequences are mostly UI ("subscribe" CTAs hide for BYOK users on
  every keyclass).
- The "5 messages/day" rejection means daily AI-cost variance is higher
  than originally modeled — but at gpt-4o-mini prices the variance is
  rounding-error.

## Open items (out of scope for this ADR)

- Annual subscription discount (typically 15–20% in the SaaS market) —
  decided at Phase 1c launch readiness.
- Family-plan or multi-seat licensing — out of scope until product-led
  signal demands it.
- Promotional / referral credits — same.
- Localized pricing (esp. CN / KR / JP) — Lemon Squeezy supports it
  natively; deferred until we have signups by region.

## References

- [ADR 0002 — Monetization model](./0002-monetization-model.md)
- Lemon Squeezy refunds & cancellation: https://docs.lemonsqueezy.com/help/refunds/
- Pricing-research approach (deferred to Phase 1c): cost-per-active-user
  × target margin × competitor band, validated against early signup
  willingness-to-pay survey.
