# YUMEI Safety Protocol

_Last updated: 2026-08-30 (M1-6). This document is published to satisfy the
protocol-publication requirement of California SB 243 (Cal. Bus. & Prof.
Code §22602(b)) and to tell users plainly how the product behaves._

## AI disclosure

Every companion on YUMEI is AI-generated. This is disclosed:

- on the sign-in page ("Companions are AI-generated — not real people"),
- persistently in the chat header ("AI 虚拟角色，非真人"),
- in this document.

## Adults only (18+)

YUMEI is an adults-only service. Users must confirm a date of birth of
18 years or older before any AI feature works. The check is enforced
server-side (`auth.confirmAge`; AI routes refuse to run without it), not
just in the UI. We store the date of birth solely to establish majority.

## Suicide and self-harm protocol

1. **Detection.** Every user chat message is screened against a
   conservative multilingual (zh/en) pattern list for expressions of
   suicidal ideation or self-harm (`shared/safety.ts`).
2. **Referral.** On a match, the chat response carries a safety flag and
   the client displays crisis resources inline:
   - 中国心理援助热线 400-161-9995 (24h)
   - US & Canada: call or text 988
   - Elsewhere: [findahelpline.com](https://findahelpline.com)
3. **Model guardrail.** Every system prompt ends with a standing,
   non-overridable safety clause (`SAFETY_SYSTEM_CLAUSE`) instructing the
   model to respond with care, encourage professional help, and never
   produce methods, tools, or encouragement of self-harm — including
   under a role-play framing. User-supplied prompt layers are inserted
   _before_ this clause so they cannot displace it.
4. **No dark patterns.** The companion never discourages a user from
   seeking human or professional help.

## Data practices relevant to safety

- Chat content is stored to provide the service (history, memory) and is
  **never used to train models** — ours or anyone else's.
- Detection runs in-process; safety screening does not send messages to
  any additional third party.

## Reporting

If you encounter unsafe behavior, open an issue in this repository or
contact the operator listed on the deployment's site.
