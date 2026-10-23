import { and, eq } from "drizzle-orm";
import { coinInvoices, coinLedger } from "../drizzle/schema";
import type { DbTransaction } from "./database";
import { economyPolicy, ensureWallet, changeCoins } from "./economy";
export async function recordCoinInvoice(
  tx: DbTransaction,
  userId: string,
  subscriptionId: string,
  invoiceId: string,
  reversed = false
) {
  const [prior] = await tx
    .select()
    .from(coinInvoices)
    .where(eq(coinInvoices.id, invoiceId))
    .for("update");
  if (
    prior &&
    (prior.userId !== userId || prior.subscriptionId !== subscriptionId)
  )
    throw new Error("Invoice owner mismatch");
  if (!prior)
    await tx
      .insert(coinInvoices)
      .values({ id: invoiceId, userId, subscriptionId, reversed });
  else if (reversed)
    await tx
      .update(coinInvoices)
      .set({ reversed: true })
      .where(eq(coinInvoices.id, invoiceId));
}
export async function applyCoinInvoices(
  tx: DbTransaction,
  userId: string,
  subscriptionId: string,
  plan: string
) {
  const policy = await economyPolicy(tx);
  if (!policy.enabled) return;
  await ensureWallet(tx, userId, policy);
  const invoices = await tx
    .select()
    .from(coinInvoices)
    .where(
      and(
        eq(coinInvoices.userId, userId),
        eq(coinInvoices.subscriptionId, subscriptionId)
      )
    )
    .for("update");
  for (const invoice of invoices) {
    const key = `invoice:${invoice.id}`;
    if (!invoice.applied && !invoice.reversed) {
      await changeCoins(
        tx,
        userId,
        key,
        "subscription_coins",
        0,
        policy.planCoins[plan] ?? 0
      );
      await tx
        .update(coinInvoices)
        .set({ applied: true })
        .where(eq(coinInvoices.id, invoice.id));
    }
    if (invoice.applied && invoice.reversed) {
      const [entry] = await tx
        .select()
        .from(coinLedger)
        .where(
          and(eq(coinLedger.userId, userId), eq(coinLedger.eventKey, key))
        );
      if (entry)
        await changeCoins(
          tx,
          userId,
          `invoice-refund:${invoice.id}`,
          "purchase_refund",
          0,
          -entry.bonusDelta
        );
    }
  }
}
