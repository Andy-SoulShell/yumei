import { walletInfo } from "../economy";
import { z } from "zod";
import {
  canManageSubscription,
  readProviderSubscription,
  subscriptionPortal,
} from "../subscriptionManagement";
import { quotaResetAt } from "../../shared/quotas";
import { METERS } from "../../shared/quotas";
import { keyProvider } from "../_core/keyProvider";
import { getDailyMeter, getMonthlyMeter } from "../_core/quota";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getBillingMode,
  getCheckoutUrls,
  getSubscription,
  getTierLimits,
} from "../billing";

export const billingRouter = router({
  portal: protectedProcedure
    .input(z.object({ action: z.enum(["manage", "payment"]) }))
    .mutation(async ({ ctx, input }) => {
      ctx.res.setHeader?.("Cache-Control", "no-store");
      return subscriptionPortal(ctx.user.id, input.action);
    }),
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    ctx.res.setHeader?.("Cache-Control", "no-store");
    return { synced: Boolean(await readProviderSubscription(ctx.user.id)) };
  }),
  /** 读取当前用户档位、订阅快照、BYOK 标识和用量，按模式提供结账地址。 */
  getInfo: protectedProcedure.query(async ({ ctx }) => {
    const { tier, limits, configuration } = await getTierLimits(ctx.user.id);
    const mode = getBillingMode(configuration);
    const subscription = await getSubscription(ctx.user.id);
    const keys = await keyProvider.describeUserKeys(ctx.user.id);
    const byok = {
      chat: keys.openrouter?.isSet === true,
      selfie: keys.fal?.isSet === true,
    };

    const chatUsed = await getDailyMeter(ctx.user.id, METERS.chat);
    const selfieUsed =
      limits.dailySelfies !== null
        ? await getDailyMeter(ctx.user.id, METERS.selfie)
        : await getMonthlyMeter(ctx.user.id, METERS.selfie);

    const wallet =
      configuration.billing.economy.enabled && mode !== "none"
        ? await walletInfo(ctx.user.id)
        : null;
    return {
      economy: wallet
        ? {
            balance: wallet.balance,
            costs: wallet.policy.costs,
            planCoins: wallet.policy.planCoins,
          }
        : null,
      mode,
      management: {
        available: Boolean(subscription) && canManageSubscription(),
        checkoutBlocked: Boolean(
          subscription && subscription.status !== "expired"
        ),
      },
      plans: configuration.billing.plans,
      defaultTierId: configuration.billing.defaultTierId,
      tier,
      limits,
      byok,
      usage: {
        chatResetsAt: quotaResetAt("day"),
        selfieResetsAt: quotaResetAt(
          limits.dailySelfies !== null ? "day" : "month"
        ),
        chatToday: chatUsed,
        chatLimit: limits.dailyMessages,
        selfiesUsed: selfieUsed,
        selfieLimit: limits.dailySelfies ?? limits.monthlySelfies,
        selfiePeriod: (limits.dailySelfies !== null ? "day" : "month") as
          "day" | "month",
      },
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            renewsAt: subscription.renewsAt,
            endsAt: subscription.endsAt,
          }
        : null,
      checkoutUrls:
        mode === "lemonsqueezy" ? getCheckoutUrls(configuration) : {},
    };
  }),
});
