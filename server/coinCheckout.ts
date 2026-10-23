import { and, eq } from "drizzle-orm";
import { coinCheckouts, users } from "../drizzle/schema";
import { withUserTransaction } from "./database";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { commerceError } from "./commerceErrors";
export async function createCoinCheckout(
  userId: string,
  packId: string,
  id: string
) {
  return withUserTransaction(userId, async tx => {
    const policy = await getPublishedProductConfig(tx),
      economy = policy.billing.economy;
    if (
      !economy.enabled ||
      policy.billing.mode === "none" ||
      !process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim() ||
      !process.env.LEMONSQUEEZY_API_KEY?.trim()
    )
      throw commerceError("checkoutUnavailable");
    const [user] = await tx
      .select({ verified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId));
    if (!user.verified) throw commerceError("verifyEmail");
    let [intent] = await tx
      .select()
      .from(coinCheckouts)
      .where(eq(coinCheckouts.id, id))
      .for("update");
    if (intent && (intent.userId !== userId || intent.packId !== packId))
      throw commerceError("checkoutUnavailable", "CONFLICT");
    if (!intent) {
      const pack = economy.packs.find(
        pack => pack.enabled && pack.id === packId
      );
      if (!pack?.checkoutUrl || !pack.variantId)
        throw commerceError("checkoutUnavailable");
      await tx.insert(coinCheckouts).values({
        id,
        userId,
        packId,
        coins: pack.coins,
        priceCents: pack.priceCents,
        variantId: pack.variantId,
        checkoutUrl: pack.checkoutUrl,
        expiresAt: new Date(Date.now() + 86400000),
      });
      [intent] = await tx
        .select()
        .from(coinCheckouts)
        .where(and(eq(coinCheckouts.id, id), eq(coinCheckouts.userId, userId)));
    }
    if (intent.status !== "waiting" || intent.expiresAt.getTime() <= Date.now())
      throw commerceError("checkoutUnavailable");
    const url = new URL(intent.checkoutUrl);
    url.searchParams.set("checkout[custom][user_id]", userId);
    url.searchParams.set("checkout[custom][checkout_id]", id);
    return { id, url: url.toString() };
  });
}
