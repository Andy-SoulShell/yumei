# ADR 0004 — Billing platform: Lemon Squeezy (Merchant of Record)

- **Status:** Accepted
- **Date:** 2026-04-30
- **Decision-makers:** Project owner
- **Related:** [ADR 0002](./0002-monetization-model.md), [ADR 0005](./0005-pricing-and-tiers.md)
- **Implementation:** Phase 1c branch (`phase-1c/subscriptions`)

## Context

ADR 0002 committed to a subscription model with three tiers (free /
plus / pro). ADR 0005 froze the placeholder prices. We still needed
to choose **which billing platform** ingests the money.

Three options were on the table. The decision needs to balance:

- **Tax compliance.** Selling subscriptions internationally means VAT
  in the EU, GST in AU, sales tax in many US states, etc. Doing this
  ourselves is a multi-week project of its own.
- **Geographic acceptance.** yumei targets a global audience
  including Mainland China, where Visa/Mastercard penetration is low
  and Stripe support is limited.
- **Webhook reliability and DX.** Phase 1c subscription-state
  reconciliation depends on webhooks. A platform with bad webhook
  semantics costs us reliability.
- **Open-source compatibility.** A self-host option without billing
  must remain workable.

## Decision

**Adopt [Lemon Squeezy](https://lemonsqueezy.com/) as the billing
platform.**

### What Lemon Squeezy gives us

- **Merchant of Record (MoR) model.** Lemon Squeezy is the seller of
  record. They handle international VAT/GST/sales-tax collection,
  filing, and remittance. We handle the product. This is the single
  highest-leverage reason for the choice.
- **CN-friendly card acceptance.** Critically more permissive than
  Stripe's default for Chinese-issued cards. Not 100% (cross-border
  card processing in CN is what it is), but materially better than
  Stripe baseline.
- **Native subscription primitives** with the policies ADR 0005
  committed to: pro-ration on upgrade, end-of-cycle on downgrade,
  cancellation that retains service until period end, full refunds
  within configurable window.
- **First-class webhooks** for the subscription lifecycle:
  `subscription_created`, `subscription_updated`,
  `subscription_payment_success`, `subscription_payment_failed`,
  `subscription_cancelled`, `subscription_expired`,
  `subscription_resumed`. These map cleanly to a `subscriptions` table
  state machine.
- **Per-plan custom variant fields** to encode our quota policy
  (chats/day, images/month) so it lives next to the plan rather than
  hard-coded in app code — future plan tweaks don't require a deploy.
- **Test mode** with full webhook simulation before going live.

### Implementation shape (Phase 1c outline)

- New `subscriptions` table:
  `(userId, lemonSubscriptionId, status, plan, periodStart, periodEnd,
   cancelAt, createdAt, updatedAt)`.
- New `usage_meters` table with composite PK `(userId, month, meter)`
  where `meter ∈ {chat, image, tts, stt}`.
- A single webhook endpoint `/api/billing/lemon-webhook` validates
  the X-Signature header, dispatches by event type, updates the
  `subscriptions` row, and refills the `usage_meters` on renewal.
- Quota gating in `chat.sendMessage` etc. consults the active
  subscription, decrements the meter, returns HTTP 402 when zeroed.
- BYOK users (per ADR 0002) bypass meters entirely — quota is only
  applied to operator-key traffic.

### Self-host without billing

The repo will detect `BILLING_PROVIDER` env var:

- `BILLING_PROVIDER=lemonsqueezy` → full subscription flow active
- `BILLING_PROVIDER=none` → all users behave as the highest tier
  (functional but the operator pays for everything); the subscription
  UI is hidden

This makes Lemon Squeezy a concern only for the commercial deployment.
Self-hosters with their own keys (`OPERATOR_*_KEY` env vars) plus
`BILLING_PROVIDER=none` get the whole product on day one without
touching billing code paths.

## Why Lemon Squeezy over the alternatives

| Option | Why we picked / didn't pick |
| --- | --- |
| **Lemon Squeezy** ✅ | MoR (zero tax-compliance work), better CN card acceptance than Stripe, mature subscription primitives, clean webhooks, no developer-hostile pricing tiers. |
| Stripe | Industry default but **not MoR by default** (Stripe Tax helps but is a separate product); CN card acceptance lags badly. We'd absorb tax compliance ourselves which is a multi-week tax-and-legal sidetrack. |
| Stripe + Tax + custom rules | Solves taxes but doesn't solve CN cards. Cumulative complexity is high. |
| Paddle | Also MoR, comparable shape to Lemon Squeezy. Lemon Squeezy DX (docs, dashboard, webhook semantics) is materially better in our team's experience. Reconsider if Lemon Squeezy ever raises fees beyond ~5%. |
| Gumroad | MoR but built around one-shot products; subscriptions are a second-class feature with weaker primitives. Not the right shape. |
| Self-host (e.g., billingbot, Polar) | Returns us to tax-compliance-as-our-problem. Lemon Squeezy's headline fee (~5% + 50¢) is cheap relative to a tax accountant. |
| Multiple providers (Stripe + Alipay) | The matrix of "which provider sees which user" makes the codebase non-trivial without product-led signal. Defer until we have signups by region. |

## Consequences

- **No tax-compliance code in the codebase.** Lemon Squeezy handles
  it; we focus on product.
- **Webhook integration is the critical-path of Phase 1c.** Plan two
  full days of webhook reliability work (signature validation, idem-
  potency, replay protection, dead-letter for failures).
- **Lemon Squeezy fees (~5% + 50¢/transaction)** become a fixed line
  item in the unit economics. ADR 0005's pricing math has implicit
  headroom for this.
- **CN payment acceptance is "better than Stripe", not "perfect".**
  Phase 1c+ may add Alipay/WeChat Pay via a separate provider for the
  CN-mainland user segment. Out of scope for the initial launch.
- **We are coupled to Lemon Squeezy's continued operation.** If they
  raise fees, change MoR terms, or shut down, we migrate to Paddle
  (compatible MoR shape). The `subscriptions` table abstraction is
  designed to hide the provider from the rest of the app, so a
  migration is webhook code only.

## References

- Lemon Squeezy webhooks: https://docs.lemonsqueezy.com/help/webhooks
- Subscription lifecycle: https://docs.lemonsqueezy.com/help/subscriptions/subscription-statuses
- Refunds API: https://docs.lemonsqueezy.com/api/refunds
- MoR explainer: https://www.lemonsqueezy.com/blog/merchant-of-record
