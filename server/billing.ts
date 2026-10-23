/** 套餐判定、权益读取与 Lemon Squeezy 订阅事件处理。 */

import { eq, or } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import express from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  billingEvents,
  subscriptions,
  type Subscription,
} from "../drizzle/schema";
import type { Tier, ProductConfig } from "../shared/productConfig";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { log } from "./_core/log";
import { getDb, withUserTransaction } from "./database";
import { getUserById } from "./repositories/users";

/** 计费运行模式：免费额度、自托管全解锁或外部订阅。 */
export type BillingMode = "free" | "none" | "lemonsqueezy";

/** 从本次发布快照读取计费模式。 */
export function getBillingMode(configuration: ProductConfig): BillingMode {
  return configuration.billing.mode;
}
/** none 模式关闭计量；调用方传入与额度计算相同的快照。 */
export function isBillingEnforced(configuration: ProductConfig): boolean {
  return getBillingMode(configuration) !== "none";
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
 * @remarks 已过 endsAt 或明确终止的订阅不授权；欠费宽限最多七天，取消续费可保留未到期权益。
 */
export async function getUserTier(
  userId: string,
  configuration?: ProductConfig
): Promise<Tier> {
  const policy = configuration ?? (await getPublishedProductConfig());
  const fallback = policy.billing.defaultTierId;
  const mode = getBillingMode(policy);
  if (mode === "none") return policy.billing.selfHostedTierId;
  if (mode === "free") return fallback;

  const sub = await getSubscription(userId);
  if (!sub) return fallback;

  if (!policy.billing.plans.some(plan => plan.id === sub.plan && plan.enabled))
    return fallback;
  const now = Date.now();
  if (sub.endsAt && sub.endsAt.getTime() <= now) return fallback;
  if (
    sub.status === "expired" ||
    sub.status === "unpaid" ||
    sub.status === "paused"
  )
    return fallback;
  if (sub.status === "past_due") {
    const since = sub.pastDueSince ?? sub.providerUpdatedAt ?? sub.updatedAt;
    return now - since.getTime() < policy.billing.pastDueGraceMs
      ? sub.plan
      : fallback;
  }
  if (ACTIVE_STATUSES.includes(sub.status)) return sub.plan;

  // 已取消续费但仍处于已支付周期内，继续保留对应权益。
  if (sub.endsAt && new Date(sub.endsAt) > new Date()) return sub.plan;

  return fallback;
}

/** 返回用户当前档位和对应的默认权益定义。 */
export async function getTierLimits(
  userId: string,
  configuration?: ProductConfig
) {
  const policy = configuration ?? (await getPublishedProductConfig());
  const tier = await getUserTier(userId, policy);
  const plan = policy.billing.plans.find(item => item.id === tier)!;
  return { tier, limits: plan.limits, plan, configuration: policy };
}

/** 仅在订阅模式且存在更高启用套餐时提示升级。 */
export function upsellHint(tier: Tier, configuration: ProductConfig): string {
  if (getBillingMode(configuration) !== "lemonsqueezy") return "";
  const index = configuration.billing.plans.findIndex(plan => plan.id === tier);
  return configuration.billing.plans.some(
    (plan, i) => i > index && plan.enabled
  )
    ? " Upgrade in Settings for higher limits."
    : "";
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
      subscription_id?: number | string;
      updated_at?: string;
      created_at?: string;
    };
  };
};

/**
 * 按发布配置中的支付变体编号精确匹配套餐。
 *
 * @returns 无法识别套餐时返回 null
 */
export function resolvePlan(
  attributes: { variant_id?: number },
  billing: ProductConfig["billing"]
): Tier | null {
  if (attributes.variant_id === undefined) return null;
  return (
    billing.plans.find(
      plan =>
        plan.enabled &&
        plan.id !== billing.defaultTierId &&
        plan.lemonVariantId === String(attributes.variant_id)
    )?.id ?? null
  );
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
 * 幂等应用经验证的订阅快照，拒绝过期版本和跨用户订阅归属变更。
 *
 * @remarks 付款事件仅记录收据；权益由 subscription_created/updated 等完整快照更新。
 * 事件约定参考 https://docs.lemonsqueezy.com/help/webhooks/event-types 。
 */
export async function handleLemonEvent(
  payload: LemonPayload,
  expectedSubscriptionId?: string
): Promise<{ ok: true; ignored?: string } | { ok: false; error: string }> {
  const eventName = payload.meta?.event_name ?? "";
  if (!SUBSCRIPTION_EVENTS.has(eventName))
    return { ok: true, ignored: `event ${eventName || "(missing)"}` };
  const userId = payload.meta?.custom_data?.user_id;
  if (!userId) return { ok: false, error: "missing meta.custom_data.user_id" };
  const attributes = payload.data?.attributes ?? {};
  const payment = eventName.startsWith("subscription_payment");
  const subscriptionId = String(
    payment ? (attributes.subscription_id ?? "") : (payload.data?.id ?? "")
  );
  if (!subscriptionId) return { ok: false, error: "missing subscription id" };
  const timestamp = attributes.updated_at ?? attributes.created_at;
  const occurredAt = timestamp ? new Date(timestamp) : null;
  if (
    (!payment && !occurredAt) ||
    (occurredAt && Number.isNaN(occurredAt.getTime()))
  )
    return { ok: false, error: "valid provider timestamp required" };
  const plan = payment
    ? null
    : resolvePlan(attributes, (await getPublishedProductConfig()).billing);
  const status = attributes.status as Subscription["status"];
  if (!payment && (!plan || !LS_STATUSES.has(status)))
    return { ok: false, error: "unresolvable plan or status" };
  const renewsAt = attributes.renews_at ? new Date(attributes.renews_at) : null;
  const endsAt = attributes.ends_at ? new Date(attributes.ends_at) : null;
  if ([renewsAt, endsAt].some(date => date && Number.isNaN(date.getTime())))
    return { ok: false, error: "invalid subscription dates" };
  if (!(await getUserById(userId))) return { ok: false, error: "unknown user" };
  const id = createHash("sha256")
    .update(
      JSON.stringify({
        eventName,
        userId,
        subscriptionId,
        resourceId: payload.data?.id,
        timestamp,
        plan,
        status,
        renewsAt,
        endsAt,
      })
    )
    .digest("hex");
  return withUserTransaction(userId, async tx => {
    const [receipt] = await tx
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(eq(billingEvents.id, id));
    if (receipt) return { ok: true, ignored: "duplicate event" };
    const rows = await tx
      .select()
      .from(subscriptions)
      .where(
        or(
          eq(subscriptions.userId, userId),
          eq(subscriptions.lsSubscriptionId, subscriptionId)
        )
      )
      .for("update");
    if (
      rows.some(
        row => row.lsSubscriptionId === subscriptionId && row.userId !== userId
      )
    )
      return { ok: false, error: "subscription owner mismatch" };
    const current = rows.find(row => row.userId === userId);
    if (
      expectedSubscriptionId &&
      current?.lsSubscriptionId !== expectedSubscriptionId
    )
      return { ok: false, error: "subscription changed while refreshing" };
    await tx
      .insert(billingEvents)
      .values({ id, userId, subscriptionId, eventName, occurredAt });
    if (payment)
      return {
        ok: true,
        ignored: "invoice recorded; awaiting subscription snapshot",
      };
    if (
      current?.status === "expired" &&
      current.lsSubscriptionId === subscriptionId &&
      status !== "expired"
    )
      return { ok: true, ignored: "expired subscription is terminal" };
    if (
      current?.providerUpdatedAt &&
      occurredAt!.getTime() <= current.providerUpdatedAt.getTime()
    )
      return { ok: true, ignored: "stale subscription snapshot" };
    const pastDueSince =
      status === "past_due"
        ? current?.status === "past_due"
          ? (current.pastDueSince ?? current.providerUpdatedAt ?? occurredAt)
          : occurredAt
        : null;
    const snapshot = {
      lsSubscriptionId: subscriptionId,
      lsCustomerId:
        attributes.customer_id != null ? String(attributes.customer_id) : null,
      plan: plan!,
      status,
      renewsAt,
      endsAt,
      providerUpdatedAt: occurredAt,
      pastDueSince,
    };
    if (current)
      await tx
        .update(subscriptions)
        .set(snapshot)
        .where(eq(subscriptions.id, current.id));
    else await tx.insert(subscriptions).values({ userId, ...snapshot });
    return { ok: true };
  });
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
      try {
        if (
          getBillingMode(await getPublishedProductConfig()) !== "lemonsqueezy"
        ) {
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

/** 按启用套餐 ID 返回发布配置中的托管结账地址，未配置时为 null。 */
export function getCheckoutUrls(
  configuration: ProductConfig
): Record<string, string | null> {
  return Object.fromEntries(
    configuration.billing.plans
      .filter(plan => plan.enabled)
      .map(plan => [plan.id, plan.checkoutUrl])
  );
}
