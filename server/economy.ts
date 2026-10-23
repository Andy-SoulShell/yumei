/** 金币预留、返还和支付归属均与业务写入处于同一用户事务。 */
import { commerceError } from "./commerceErrors";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  coinCheckouts,
  coinWallets,
  coinLedger,
  coinOrders,
  referrals,
  creatorEarnings,
  creatorPayouts,
  girlfriends,
  conversations,
  communityCharacters,
  users,
} from "../drizzle/schema";
import type { CoinAllocation, EconomyPolicy } from "../shared/economy";
import { getDb, withUserTransaction, type DbTransaction } from "./database";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { BusinessRuleError } from "./_core/businessError";

export async function economyPolicy(tx?: DbTransaction) {
  return (await getPublishedProductConfig(tx)).billing.economy;
}
async function ledger(tx: DbTransaction, userId: string, eventKey: string) {
  return (
    await tx
      .select()
      .from(coinLedger)
      .where(
        and(eq(coinLedger.userId, userId), eq(coinLedger.eventKey, eventKey))
      )
  )[0];
}
export async function changeCoins(
  tx: DbTransaction,
  userId: string,
  eventKey: string,
  reason: string,
  paidDelta: number,
  bonusDelta: number,
  allocations: CoinAllocation[] = []
) {
  const previous = await ledger(tx, userId, eventKey);
  if (previous) return previous;
  const [wallet] = await tx
    .select()
    .from(coinWallets)
    .where(eq(coinWallets.userId, userId))
    .for("update");
  if (!wallet) throw new Error("Wallet must exist before posting");
  const paid = wallet.paid + paidDelta,
    bonus = wallet.bonus + bonusDelta;
  if (
    ![paid, bonus, paid + bonus].every(
      n => Number.isSafeInteger(n) && Math.abs(n) < 2000000000
    )
  )
    throw new Error("Wallet overflow");
  await tx
    .update(coinWallets)
    .set({ paid, bonus, sequence: wallet.sequence + 1 })
    .where(eq(coinWallets.userId, userId));
  const entry = {
    id: crypto.randomUUID(),
    userId,
    eventKey,
    reason,
    paidDelta,
    bonusDelta,
    balanceAfter: paid + bonus,
    sequence: wallet.sequence + 1,
    allocations,
  };
  await tx.insert(coinLedger).values(entry);
  return entry;
}
export async function ensureWallet(
  tx: DbTransaction,
  userId: string,
  policy: EconomyPolicy
) {
  const [existing] = await tx
    .select()
    .from(coinWallets)
    .where(eq(coinWallets.userId, userId))
    .for("update");
  if (!existing)
    await tx.insert(coinWallets).values({
      userId,
      referralCode: crypto.randomUUID().replaceAll("-", "").slice(0, 20),
    });
  if (policy.enabled)
    await changeCoins(tx, userId, "welcome", "welcome", 0, policy.welcomeCoins);
  return (
    await tx
      .select()
      .from(coinWallets)
      .where(eq(coinWallets.userId, userId))
      .for("update")
  )[0];
}
export async function reserveCoins(
  tx: DbTransaction,
  userId: string,
  eventKey: string,
  kind: keyof EconomyPolicy["costs"],
  cost?: number
) {
  const policy = await economyPolicy(tx);
  if (!policy.enabled) return;
  if (await ledger(tx, userId, eventKey)) return;
  const wallet = await ensureWallet(tx, userId, policy),
    amount = cost ?? policy.costs[kind];
  if (wallet.paid < 0 || wallet.bonus + wallet.paid < amount)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "INSUFFICIENT_COINS",
      cause: new BusinessRuleError({
        reason: "INSUFFICIENT_COINS",
        required: amount,
        balance: wallet.paid + wallet.bonus,
      }),
    });
  const bonus = Math.min(amount, Math.max(0, wallet.bonus)),
    paid = amount - bonus;
  let remaining = paid;
  const allocations: CoinAllocation[] = [];
  if (remaining) {
    const orders = await tx
      .select()
      .from(coinOrders)
      .where(eq(coinOrders.userId, userId))
      .orderBy(asc(coinOrders.createdAt), asc(coinOrders.id))
      .for("update");
    for (const order of orders) {
      const take = Math.min(
        remaining,
        Math.max(0, order.coins - order.revoked - order.consumed)
      );
      if (take) {
        allocations.push({ orderId: order.id, coins: take });
        await tx
          .update(coinOrders)
          .set({ consumed: order.consumed + take })
          .where(eq(coinOrders.id, order.id));
        remaining -= take;
      }
      if (!remaining) break;
    }
  }
  if (remaining) throw new Error("Paid coin lots do not cover wallet");
  await changeCoins(
    tx,
    userId,
    eventKey,
    `spend_${kind}`,
    -paid,
    -bonus,
    allocations
  );
}
export async function refundCoins(
  tx: DbTransaction,
  userId: string,
  requestId: string
) {
  if (await ledger(tx, userId, `refund:${requestId}`)) return;
  const entry = await ledger(tx, userId, `generation:${requestId}`);
  if (!entry) return;
  for (const lot of entry.allocations ?? [])
    await tx
      .update(coinOrders)
      .set({ consumed: sql`GREATEST(0, ${coinOrders.consumed}-${lot.coins})` })
      .where(
        and(eq(coinOrders.id, lot.orderId), eq(coinOrders.userId, userId))
      );
  await changeCoins(
    tx,
    userId,
    `refund:${requestId}`,
    "generation_refund",
    -entry.paidDelta,
    -entry.bonusDelta
  );
}
/** 只有真实实付金币的成功输出参与分成；自用、赠币及失败任务不产生收益。 */
export async function settleCreatorEarnings(
  tx: DbTransaction,
  request: { id: string; userId: string; conversationId: number }
) {
  const entry = await ledger(tx, request.userId, `generation:${request.id}`);
  if (
    !entry?.allocations?.length ||
    (await ledger(tx, request.userId, `refund:${request.id}`))
  )
    return;
  const [role] = await tx
    .select({ sourceId: girlfriends.communitySourceId })
    .from(conversations)
    .innerJoin(girlfriends, eq(girlfriends.id, conversations.girlfriendId))
    .where(eq(conversations.id, request.conversationId));
  if (!role?.sourceId) return;
  const [publication] = await tx
    .select()
    .from(communityCharacters)
    .where(eq(communityCharacters.id, role.sourceId));
  if (!publication || publication.userId === request.userId) return;
  const policy = await economyPolicy(tx);
  if (!policy.enabled) return;
  for (const allocation of entry.allocations) {
    const [order] = await tx
      .select()
      .from(coinOrders)
      .where(eq(coinOrders.id, allocation.orderId));
    if (!order) continue;
    const units = Math.floor(
      (allocation.coins *
        (order.netCents ?? order.totalCents) *
        policy.creatorShareBps) /
        order.coins
    );
    if (!units) continue;
    await tx
      .insert(creatorEarnings)
      .values({
        id: `${request.id}:${allocation.orderId}`,
        requestId: request.id,
        userId: publication.userId,
        orderId: allocation.orderId,
        units,
        reversedUnits: Math.floor((units * order.revoked) / order.coins),
        availableAt: new Date(Date.now() + policy.creatorHoldDays * 86400000),
      })
      .onDuplicateKeyUpdate({ set: { requestId: request.id } });
  }
}
export async function creatorBalance(tx: DbTransaction, userId: string) {
  const earnings = await tx
    .select()
    .from(creatorEarnings)
    .where(eq(creatorEarnings.userId, userId))
    .for("update");
  const payouts = await tx
    .select()
    .from(creatorPayouts)
    .where(eq(creatorPayouts.userId, userId))
    .for("update");
  const now = Date.now();
  let held = 0,
    available = 0;
  for (const row of earnings) {
    const units = row.units - row.reversedUnits;
    if (row.availableAt.getTime() > now) held += units;
    else available += units;
  }
  const committed = payouts
    .filter(row => row.status !== "rejected")
    .reduce((sum, row) => sum + row.units, 0);
  return {
    heldUnits: held,
    availableUnits: available - committed,
    totalUnits: held + available,
    payouts,
  };
}
export async function walletInfo(userId: string) {
  return withUserTransaction(userId, async tx => {
    const config = await getPublishedProductConfig(tx),
      policy = config.billing.economy,
      wallet = await ensureWallet(tx, userId, policy);
    const history = await tx
      .select({
        id: coinLedger.id,
        reason: coinLedger.reason,
        paidDelta: coinLedger.paidDelta,
        bonusDelta: coinLedger.bonusDelta,
        balanceAfter: coinLedger.balanceAfter,
        createdAt: coinLedger.createdAt,
      })
      .from(coinLedger)
      .where(eq(coinLedger.userId, userId))
      .orderBy(
        desc(coinLedger.sequence),
        desc(coinLedger.createdAt),
        desc(coinLedger.id)
      )
      .limit(50);
    const invited = await tx
      .select({ status: referrals.status })
      .from(referrals)
      .where(eq(referrals.inviterId, userId));
    const [referral] = await tx
      .select({ status: referrals.status })
      .from(referrals)
      .where(eq(referrals.inviteeId, userId));
    return {
      ...wallet,
      balance: wallet.paid + wallet.bonus,
      history,
      referral,
      invited: {
        pending: invited.filter(row => row.status === "pending").length,
        rewarded: invited.filter(row => row.status === "rewarded").length,
      },
      policy,
      chargingEnabled: policy.enabled && config.billing.mode !== "none",
      checkoutReady:
        policy.enabled &&
        config.billing.mode !== "none" &&
        Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim()) &&
        Boolean(process.env.LEMONSQUEEZY_API_KEY?.trim()),
      checkouts: await tx
        .select({
          id: coinCheckouts.id,
          packId: coinCheckouts.packId,
          coins: coinCheckouts.coins,
          priceCents: coinCheckouts.priceCents,
          status: coinCheckouts.status,
          createdAt: coinCheckouts.createdAt,
          expiresAt: coinCheckouts.expiresAt,
        })
        .from(coinCheckouts)
        .where(eq(coinCheckouts.userId, userId))
        .orderBy(desc(coinCheckouts.createdAt))
        .limit(10),
      orders: await tx
        .select({
          id: coinOrders.id,
          coins: coinOrders.coins,
          revoked: coinOrders.revoked,
          totalCents: coinOrders.totalCents,
          refundedCents: coinOrders.refundedCents,
          createdAt: coinOrders.createdAt,
        })
        .from(coinOrders)
        .where(eq(coinOrders.userId, userId))
        .orderBy(desc(coinOrders.createdAt))
        .limit(20),
      emailVerified: (
        await tx
          .select({ verified: users.emailVerified })
          .from(users)
          .where(eq(users.id, userId))
      )[0].verified,
    };
  });
}
export async function claimReferral(userId: string, code: string) {
  if (!(await economyPolicy()).enabled)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "REFERRALS_UNAVAILABLE",
    });
  const db = (await getDb())!;
  const [inviter] = await db
    .select()
    .from(coinWallets)
    .where(eq(coinWallets.referralCode, code));
  if (!inviter || inviter.userId === userId)
    throw commerceError("referralInvalid", "BAD_REQUEST");
  return withUserTransaction(userId, async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    const existing = await tx
      .select()
      .from(coinOrders)
      .where(eq(coinOrders.userId, userId))
      .limit(1);
    const [prior] = await tx
      .select()
      .from(referrals)
      .where(eq(referrals.inviteeId, userId));
    if (prior) {
      if (prior.inviterId === inviter.userId) return { success: true };
      throw commerceError("referralLinked", "CONFLICT");
    }
    if (
      !user.emailVerified ||
      Date.now() - user.createdAt.getTime() > 7 * 86400000 ||
      existing.length
    )
      throw commerceError(
        user.emailVerified ? "referralIneligible" : "verifyEmail"
      );
    await tx
      .insert(referrals)
      .values({ inviteeId: userId, inviterId: inviter.userId });
    return { success: true };
  });
}
