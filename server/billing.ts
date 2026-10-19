/**
 * Subscription billing (M3 / ADR 0002, 0004, 0005).
 *
 * Modes, selected by BILLING_PROVIDER (read at call time for testability):
 *   - "free" (default): no paid tiers; every non-BYOK user gets the
 *     free-tier caps. Safe soft-launch default — an operator who hasn't
 *     configured billing yet still can't have their API bill drained.
 *   - "none": self-host mode; all users get the pro tier and meters are
 *     bypassed entirely (the operator owns the keys and the costs).
 *   - "lemonsqueezy": full billing. Tier comes from the subscriptions
 *     table, which is driven exclusively by Lemon Squeezy webhooks.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { eq } from "drizzle-orm";
import { subscriptions, type Subscription } from "../drizzle/schema";
import { TIER_LIMITS, type Tier, type TierLimits } from "../shared/quotas";
import { getDb } from "./db";
import { log } from "./_core/log";

export type BillingMode = "free" | "none" | "lemonsqueezy";

export function getBillingMode(): BillingMode {
  const raw = process.env.BILLING_PROVIDER ?? "free";
  if (raw === "none" || raw === "lemonsqueezy" || raw === "free") return raw;
  return "free";
}

/** True when usage meters / feature gates should be enforced at all. */
export function isBillingEnforced(): boolean {
  return getBillingMode() !== "none";
}

/** Statuses that grant paid-tier access. `past_due` gets a grace period
 *  (LS retries payment); `cancelled` keeps access until endsAt. */
const ACTIVE_STATUSES: ReadonlyArray<Subscription["status"]> = [
  "on_trial",
  "active",
  "past_due",
];

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserTier(userId: string): Promise<Tier> {
  const mode = getBillingMode();
  if (mode === "none") return "pro";
  if (mode === "free") return "free";

  const sub = await getSubscription(userId);
  if (!sub) return "free";

  if (ACTIVE_STATUSES.includes(sub.status)) return sub.plan;

  // Cancelled (or otherwise ended) but paid through the period end.
  if (sub.endsAt && new Date(sub.endsAt) > new Date()) return sub.plan;

  return "free";
}

export async function getTierLimits(userId: string): Promise<{ tier: Tier; limits: TierLimits }> {
  const tier = await getUserTier(userId);
  return { tier, limits: TIER_LIMITS[tier] };
}

/** Appended to quota-exceeded messages when an upgrade path exists. */
export function upsellHint(tier: Tier): string {
  if (getBillingMode() !== "lemonsqueezy") return "";
  if (tier === "pro") return "";
  return " Upgrade in Settings for higher limits.";
}

// ---------------------------------------------------------------------------
// Lemon Squeezy webhook
// ---------------------------------------------------------------------------

/** Exported for tests. Constant-time HMAC-SHA256 check of X-Signature. */
export function verifyLemonSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
]);

type LemonPayload = {
  meta?: {
    event_name?: string;
    custom_data?: { user_id?: string };
  };
  data?: {
    id?: string;
    attributes?: {
      customer_id?: number;
      status?: string;
      renews_at?: string | null;
      ends_at?: string | null;
      variant_id?: number;
      variant_name?: string;
      product_name?: string;
      // subscription_payment_* events carry the parent id here instead
      subscription_id?: number;
    };
  };
};

/**
 * Map an LS variant to our plan. Prefer explicit variant-id env config
 * (LEMONSQUEEZY_VARIANT_PLUS / _PRO); fall back to name matching so a
 * store rename doesn't silently strand subscribers.
 */
export function resolvePlan(attributes: {
  variant_id?: number;
  variant_name?: string;
  product_name?: string;
}): "plus" | "pro" | null {
  const plusId = process.env.LEMONSQUEEZY_VARIANT_PLUS;
  const proId = process.env.LEMONSQUEEZY_VARIANT_PRO;
  const variantId = attributes.variant_id != null ? String(attributes.variant_id) : null;
  if (variantId && plusId && variantId === plusId) return "plus";
  if (variantId && proId && variantId === proId) return "pro";

  const name = `${attributes.variant_name ?? ""} ${attributes.product_name ?? ""}`.toLowerCase();
  if (name.includes("pro")) return "pro";
  if (name.includes("plus")) return "plus";
  return null;
}

const LS_STATUSES = new Set([
  "on_trial",
  "active",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
]);

/** Exported for tests: process one verified webhook payload. */
export async function handleLemonEvent(payload: LemonPayload): Promise<
  { ok: true; ignored?: string } | { ok: false; error: string }
> {
  const eventName = payload.meta?.event_name ?? "";
  if (!SUBSCRIPTION_EVENTS.has(eventName)) {
    return { ok: true, ignored: `event ${eventName || "(missing)"}` };
  }

  const userId = payload.meta?.custom_data?.user_id;
  if (!userId) {
    // Checkout links must pass checkout[custom][user_id]; without it we
    // cannot attribute the subscription.
    return { ok: false, error: "missing meta.custom_data.user_id" };
  }

  const attributes = payload.data?.attributes ?? {};
  // Payment events reference the subscription via attributes.subscription_id;
  // subscription events use data.id itself.
  const lsSubscriptionId = eventName.startsWith("subscription_payment")
    ? String(attributes.subscription_id ?? "")
    : String(payload.data?.id ?? "");
  if (!lsSubscriptionId) {
    return { ok: false, error: "missing subscription id" };
  }

  const db = await getDb();
  if (!db) return { ok: false, error: "database unavailable" };

  // Payment events don't carry plan/status — only bump timestamps/status
  // for an existing row.
  if (eventName.startsWith("subscription_payment")) {
    if (eventName === "subscription_payment_failed") {
      await db
        .update(subscriptions)
        .set({ status: "past_due" })
        .where(eq(subscriptions.lsSubscriptionId, lsSubscriptionId));
    } else {
      await db
        .update(subscriptions)
        .set({ status: "active" })
        .where(eq(subscriptions.lsSubscriptionId, lsSubscriptionId));
    }
    return { ok: true };
  }

  const plan = resolvePlan(attributes);
  if (!plan) return { ok: false, error: "unresolvable plan (set LEMONSQUEEZY_VARIANT_PLUS/_PRO)" };

  const rawStatus = attributes.status ?? "active";
  const status = (LS_STATUSES.has(rawStatus) ? rawStatus : "active") as Subscription["status"];
  const renewsAt = attributes.renews_at ? new Date(attributes.renews_at) : null;
  const endsAt = attributes.ends_at ? new Date(attributes.ends_at) : null;

  await db
    .insert(subscriptions)
    .values({
      userId,
      lsSubscriptionId,
      lsCustomerId: attributes.customer_id != null ? String(attributes.customer_id) : null,
      plan,
      status,
      renewsAt,
      endsAt,
    })
    .onDuplicateKeyUpdate({
      set: { userId, plan, status, renewsAt, endsAt },
    });

  return { ok: true };
}

/**
 * Mounted BEFORE express.json() — signature verification needs the raw
 * body bytes exactly as Lemon Squeezy sent them.
 */
export function registerBillingRoutes(app: Express) {
  app.post(
    "/api/billing/lemon-webhook",
    express.raw({ type: "*/*", limit: "1mb" }),
    async (req: Request, res: Response) => {
      if (getBillingMode() !== "lemonsqueezy") {
        res.status(404).json({ error: "billing disabled" });
        return;
      }
      const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "";
      const signature = (req.headers["x-signature"] as string) ?? "";
      const rawBody = req.body as Buffer;

      if (!verifyLemonSignature(rawBody, signature, secret)) {
        res.status(401).json({ error: "invalid signature" });
        return;
      }

      try {
        const payload = JSON.parse(rawBody.toString("utf8"));
        const result = await handleLemonEvent(payload);
        if (!result.ok) {
          log.error("[billing] webhook rejected", result.error);
          res.status(422).json(result);
          return;
        }
        res.json(result);
      } catch (error) {
        log.error("[billing] webhook failed", error);
        res.status(500).json({ error: "internal" });
      }
    }
  );
}

/** Checkout URLs configured by the operator (LS hosted checkout links). */
export function getCheckoutUrls(): { plus: string | null; pro: string | null } {
  return {
    plus: process.env.LEMONSQUEEZY_CHECKOUT_PLUS || null,
    pro: process.env.LEMONSQUEEZY_CHECKOUT_PRO || null,
  };
}
