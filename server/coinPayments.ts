/** 只接受已通过 HMAC 校验的支付事件。浏览器返回页永不直接入账。 */
import { z } from "zod";
import axios from "axios";
import { and, eq, sql } from "drizzle-orm";
import {
  coinOrders,
  coinCheckouts,
  coinLedger,
  creatorEarnings,
  referrals,
  users,
} from "../drizzle/schema";
import { getDb, withUserTransaction } from "./database";
import { economyPolicy, ensureWallet, changeCoins } from "./economy";
const eventSchema = z.object({
  meta: z.object({
    event_name: z.enum(["order_created", "order_refunded"]),
    custom_data: z
      .object({
        user_id: z.string().min(1).max(255),
        checkout_id: z.string().uuid().optional(),
      })
      .optional(),
  }),
  data: z.object({
    id: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(z.string().regex(/^\d{1,64}$/)),
    attributes: z.object({
      status: z.string(),
      currency: z.string(),
      total: z.number().int().positive(),
      tax: z.number().int().nonnegative().optional(),
      subtotal: z.number().int().nonnegative().optional(),
      discount_total: z.number().int().nonnegative().optional(),
      refunded_amount: z.number().int().nonnegative().default(0),
      test_mode: z.boolean().default(false),
      first_order_item: z.object({
        id: z.union([z.string(), z.number()]).transform(String).optional(),
        variant_id: z.union([z.string(), z.number()]).transform(String),
        price: z.number().int().positive(),
        quantity: z.number().int().min(1).max(100).optional(),
      }),
    }),
  }),
});
export async function handleCoinOrder(
  raw: unknown
): Promise<{ ok: true; ignored?: string } | { ok: false; error: string }> {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid coin order" };
  const event = parsed.data,
    userId = event.meta.custom_data?.user_id,
    attrs = event.data.attributes;
  const policy = await economyPolicy();
  const db = (await getDb())!;
  const [known] = await db
    .select()
    .from(coinOrders)
    .where(eq(coinOrders.id, event.data.id));
  const checkoutId = event.meta.custom_data?.checkout_id;
  const [intent] = checkoutId
    ? await db
        .select()
        .from(coinCheckouts)
        .where(eq(coinCheckouts.id, checkoutId))
    : [];
  const pack =
    intent ??
    policy.packs.find(
      item =>
        item.enabled && item.variantId === attrs.first_order_item.variant_id
    );
  if (!known && !pack)
    return checkoutId
      ? { ok: false, error: "coin checkout missing" }
      : { ok: true, ignored: "not a configured coin pack" };
  if (!userId) return { ok: false, error: "coin order owner missing" };
  if (
    (known &&
      (known.userId !== userId ||
        known.variantId !== attrs.first_order_item.variant_id ||
        (checkoutId && known.checkoutId !== checkoutId))) ||
    (intent &&
      (intent.userId !== userId ||
        intent.variantId !== attrs.first_order_item.variant_id))
  )
    return { ok: false, error: "coin order owner mismatch" };
  if (attrs.test_mode !== (process.env.LEMONSQUEEZY_TEST_MODE === "1"))
    return { ok: false, error: "payment environment mismatch" };
  if (
    attrs.currency !== "USD" ||
    (!known && attrs.first_order_item.price !== pack!.priceCents) ||
    attrs.refunded_amount > attrs.total ||
    (known && known.totalCents !== attrs.total)
  )
    return { ok: false, error: "coin price mismatch" };
  if (!["paid", "refunded", "partial_refund"].includes(attrs.status))
    return { ok: true, ignored: "order is not paid" };
  let quantity = attrs.first_order_item.quantity;
  // Order payloads do not always include quantity. Resolve the signed item ID rather than assuming one unit.
  if (!known && quantity === undefined && attrs.first_order_item.id) {
    try {
      if (
        !/^\d{1,64}$/.test(attrs.first_order_item.id) ||
        !process.env.LEMONSQUEEZY_API_KEY
      )
        throw new Error("item unavailable");
      const response = await axios.get(
        `https://api.lemonsqueezy.com/v1/order-items/${attrs.first_order_item.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
            Accept: "application/vnd.api+json",
          },
          timeout: 10000,
          maxRedirects: 0,
        }
      );
      const item = z
        .object({
          data: z.object({
            type: z.literal("order-items"),
            id: z.union([z.string(), z.number()]).transform(String),
            attributes: z.object({
              order_id: z.union([z.string(), z.number()]).transform(String),
              variant_id: z.union([z.string(), z.number()]).transform(String),
              price: z.number().int(),
              quantity: z.number().int().min(1).max(100),
            }),
          }),
        })
        .parse(response.data).data;
      if (
        item.id !== attrs.first_order_item.id ||
        item.attributes.order_id !== event.data.id ||
        item.attributes.variant_id !== attrs.first_order_item.variant_id ||
        item.attributes.price !== attrs.first_order_item.price
      )
        throw new Error("item mismatch");
      quantity = item.attributes.quantity;
    } catch {
      return { ok: false, error: "coin order item verification unavailable" };
    }
  }
  if (!known && intent && quantity === undefined)
    return { ok: false, error: "coin order quantity missing" };
  // Legacy signed events without an item ID represented one pack.
  quantity ??= 1;
  const netCents =
    attrs.subtotal === undefined
      ? attrs.total - (attrs.tax ?? 0)
      : attrs.subtotal - (attrs.discount_total ?? 0);
  if (netCents < 0 || netCents > attrs.total)
    return { ok: false, error: "coin net price mismatch" };
  return withUserTransaction(userId, async tx => {
    await ensureWallet(tx, userId, policy);
    const [existing] = await tx
      .select()
      .from(coinOrders)
      .where(eq(coinOrders.id, event.data.id))
      .for("update");
    if (
      existing &&
      (existing.userId !== userId ||
        existing.variantId !== attrs.first_order_item.variant_id)
    )
      return { ok: false, error: "coin order owner mismatch" };
    const count = existing?.coins ?? pack!.coins * quantity;
    if (!Number.isSafeInteger(count) || count > 100000000)
      return { ok: false, error: "coin quantity too large" };
    // 退款先于创建事件到达时，同一事务补齐原始购买后再追偿，后到创建事件不会重复授予。
    if (!existing) {
      await tx.insert(coinOrders).values({
        id: event.data.id,
        userId,
        coins: count,
        totalCents: attrs.total,
        netCents,
        checkoutId: intent?.id ?? null,
        variantId: attrs.first_order_item.variant_id,
      });
      await changeCoins(
        tx,
        userId,
        `order:${event.data.id}`,
        "purchase",
        count,
        0
      );
    }
    const originalTotal = existing?.totalCents ?? attrs.total;
    const refunded = Math.max(
      existing?.refundedCents ?? 0,
      attrs.refunded_amount
    );
    const revoked = Math.min(
      count,
      Math.ceil((count * refunded) / originalTotal)
    );
    const delta = revoked - (existing?.revoked ?? 0);
    if (delta > 0) {
      await changeCoins(
        tx,
        userId,
        `order-refund:${event.data.id}:${revoked}`,
        "purchase_refund",
        -delta,
        0
      );
      await tx
        .update(coinOrders)
        .set({ refundedCents: refunded, revoked })
        .where(eq(coinOrders.id, event.data.id));
      await tx
        .update(creatorEarnings)
        .set({
          reversedUnits: sql`FLOOR(${creatorEarnings.units}*${revoked}/${count})`,
        })
        .where(eq(creatorEarnings.orderId, event.data.id));
    }
    if (intent)
      await tx
        .update(coinCheckouts)
        .set({ status: refunded >= originalTotal ? "refunded" : "confirmed" })
        .where(eq(coinCheckouts.id, intent.id));
    const [referral] = await tx
      .select()
      .from(referrals)
      .where(eq(referrals.inviteeId, userId))
      .for("update");
    if (
      referral &&
      referral.status === "pending" &&
      !refunded &&
      policy.enabled
    ) {
      const [verified] = await tx
        .select({ verified: users.emailVerified })
        .from(users)
        .where(eq(users.id, userId));
      if (verified?.verified) {
        await ensureWallet(tx, referral.inviterId, policy);
        await changeCoins(
          tx,
          referral.inviterId,
          `referral:${userId}`,
          "referral_reward",
          0,
          policy.referralReward
        );
        await changeCoins(
          tx,
          userId,
          `invitee:${userId}`,
          "invitee_reward",
          0,
          policy.inviteeReward
        );
        await tx
          .update(referrals)
          .set({ status: "rewarded", orderId: event.data.id })
          .where(eq(referrals.inviteeId, userId));
      }
    }
    if (
      referral?.status === "rewarded" &&
      referral.orderId === event.data.id &&
      refunded
    ) {
      for (const [owner, key] of [
        [referral.inviterId, `referral:${userId}`],
        [userId, `invitee:${userId}`],
      ]) {
        const [reward] = await tx
          .select()
          .from(coinLedger)
          .where(
            and(eq(coinLedger.userId, owner), eq(coinLedger.eventKey, key))
          );
        if (reward)
          await changeCoins(
            tx,
            owner,
            `revoke:${key}`,
            "referral_reversal",
            0,
            -reward.bonusDelta
          );
      }
      await tx
        .update(referrals)
        .set({ status: "revoked" })
        .where(eq(referrals.inviteeId, userId));
    }
    return { ok: true };
  });
}
