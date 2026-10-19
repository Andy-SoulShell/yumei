/** 套餐判定、权益读取与 Lemon Squeezy 订阅事件处理。 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { eq } from "drizzle-orm";
import { subscriptions, type Subscription } from "../drizzle/schema";
import { TIER_LIMITS, type Tier, type TierLimits } from "../shared/quotas";
import { getDb } from "./db";
import { log } from "./_core/log";

/** 计费运行模式：免费额度、自托管全解锁或外部订阅。 */
export type BillingMode = "free" | "none" | "lemonsqueezy";

/** 读取计费模式，未配置或值未知时回退为 free。 */
export function getBillingMode(): BillingMode {
  const raw = process.env.BILLING_PROVIDER ?? "free";
  if (raw === "none" || raw === "lemonsqueezy" || raw === "free") return raw;
  return "free";
}

/** 判断是否执行套餐计量与功能门槛；none 模式关闭这些限制。 */
export function isBillingEnforced(): boolean {
  return getBillingMode() !== "none";
}

/** 当前直接授予付费权益的订阅状态；past_due 的宽限期尚未单独限时。 */
const ACTIVE_STATUSES: ReadonlyArray<Subscription["status"]> = [
  "on_trial",
  "active",
  "past_due",
];

/** 读取当前用户保存的订阅状态，不主动向支付服务查询。 */
export async function getSubscription(
  userId: string
): Promise<Subscription | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 根据计费模式及本地订阅状态推导用户档位。
 *
 * @remarks 当前 active、on_trial、past_due 直接授权；其余状态在 endsAt 未到时也保留权益。
 */
export async function getUserTier(userId: string): Promise<Tier> {
  const mode = getBillingMode();
  if (mode === "none") return "pro";
  if (mode === "free") return "free";

  const sub = await getSubscription(userId);
  if (!sub) return "free";

  if (ACTIVE_STATUSES.includes(sub.status)) return sub.plan;

  // 已取消续费但仍处于已支付周期内，继续保留对应权益。
  if (sub.endsAt && new Date(sub.endsAt) > new Date()) return sub.plan;

  return "free";
}

/** 返回用户当前档位和对应的默认权益定义。 */
export async function getTierLimits(
  userId: string
): Promise<{ tier: Tier; limits: TierLimits }> {
  const tier = await getUserTier(userId);
  return { tier, limits: TIER_LIMITS[tier] };
}

/** 在已启用订阅且用户尚未达到 Pro 时返回升级提示。 */
export function upsellHint(tier: Tier): string {
  if (getBillingMode() !== "lemonsqueezy") return "";
  if (tier === "pro") return "";
  return " Upgrade in Settings for higher limits.";
}

// ---------------------------------------------------------------------------
// Lemon Squeezy 支付事件入口。
// ---------------------------------------------------------------------------

/**
 * 按原始请求字节计算 HMAC-SHA256，并恒定时间比较 webhook 签名。
 *
 * @param rawBody - 未经过 JSON 解析的原始请求体
 */
export function verifyLemonSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
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

/** 订阅 webhook 处理所读取的事件、用户归属与订阅字段。 */
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
      // 支付事件通过此字段携带所属订阅 ID。
      subscription_id?: number;
    };
  };
};

/**
 * 优先按配置的变体编号匹配套餐，再按变体或产品名称推断。
 *
 * @returns 无法识别套餐时返回 null
 */
export function resolvePlan(attributes: {
  variant_id?: number;
  variant_name?: string;
  product_name?: string;
}): "plus" | "pro" | null {
  const plusId = process.env.LEMONSQUEEZY_VARIANT_PLUS;
  const proId = process.env.LEMONSQUEEZY_VARIANT_PRO;
  const variantId =
    attributes.variant_id != null ? String(attributes.variant_id) : null;
  if (variantId && plusId && variantId === plusId) return "plus";
  if (variantId && proId && variantId === proId) return "pro";

  const name =
    `${attributes.variant_name ?? ""} ${attributes.product_name ?? ""}`.toLowerCase();
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

/**
 * 将已通过签名验证的订阅事件写入本地订阅表。
 *
 * @remarks 本函数本身不验证签名，也未记录事件去重键或按事件时间防止乱序覆盖。
 */
export async function handleLemonEvent(
  payload: LemonPayload
): Promise<{ ok: true; ignored?: string } | { ok: false; error: string }> {
  const eventName = payload.meta?.event_name ?? "";
  if (!SUBSCRIPTION_EVENTS.has(eventName)) {
    return { ok: true, ignored: `event ${eventName || "(missing)"}` };
  }

  const userId = payload.meta?.custom_data?.user_id;
  if (!userId) {
    // 结账链接需带 checkout[custom][user_id]，否则无法关联用户。
    return { ok: false, error: "missing meta.custom_data.user_id" };
  }

  const attributes = payload.data?.attributes ?? {};
  // 支付事件取 attributes.subscription_id；订阅事件直接取 data.id。
  const lsSubscriptionId = eventName.startsWith("subscription_payment")
    ? String(attributes.subscription_id ?? "")
    : String(payload.data?.id ?? "");
  if (!lsSubscriptionId) {
    return { ok: false, error: "missing subscription id" };
  }

  const db = await getDb();
  if (!db) return { ok: false, error: "database unavailable" };

  // 支付事件只更新已有订阅的时间和状态，不创建套餐记录。
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
  if (!plan)
    return {
      ok: false,
      error: "unresolvable plan (set LEMONSQUEEZY_VARIANT_PLUS/_PRO)",
    };

  const rawStatus = attributes.status ?? "active";
  const status = (
    LS_STATUSES.has(rawStatus) ? rawStatus : "active"
  ) as Subscription["status"];
  const renewsAt = attributes.renews_at ? new Date(attributes.renews_at) : null;
  const endsAt = attributes.ends_at ? new Date(attributes.ends_at) : null;

  await db
    .insert(subscriptions)
    .values({
      userId,
      lsSubscriptionId,
      lsCustomerId:
        attributes.customer_id != null ? String(attributes.customer_id) : null,
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
 * 注册订阅 webhook，按模式、原始请求签名及处理结果返回状态。
 *
 * @remarks 必须在 express.json 中间件之前注册，以保留签名计算所需字节。
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

/** 读取运营方配置的 Plus 与 Pro 托管结账地址，未配置时返回 null。 */
export function getCheckoutUrls(): { plus: string | null; pro: string | null } {
  return {
    plus: process.env.LEMONSQUEEZY_CHECKOUT_PLUS || null,
    pro: process.env.LEMONSQUEEZY_CHECKOUT_PRO || null,
  };
}
