import { Link } from "wouter";
import { useState } from "react";
import { PageError } from "./PageError";
import { formatPrice, formatResetTime } from "@/lib/formatters";
/** 展示当前登录用户的套餐、实际用量与可用升级入口。 */

import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { contentText } from "@shared/discovery";
import { Crown, Sparkles } from "lucide-react";

/**
 * 读取套餐及用量接口并显示额度、临近上限提示和配置的升级链接。
 *
 * @remarks free 展示免费额度；none 展示全解锁状态；只有订阅模式展示结账入口。
 */
export function BillingCard() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [notice, setNotice] = useState("");
  const utils = trpc.useUtils();
  const portal = trpc.billing.portal.useMutation({
    onError: () => setNotice(t("billing:manageError")),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const refresh = trpc.billing.refresh.useMutation({
    onError: () => setNotice(t("billing:manageError")),
    onSuccess: async ({ synced }) => {
      await utils.billing.getInfo.invalidate();
      await utils.privacy.eligibility.invalidate();
      setNotice(t(synced ? "billing:refreshDone" : "billing:paymentPending"));
    },
  });
  const {
    data: info,
    error,
    refetch,
  } = trpc.billing.getInfo.useQuery(undefined, {
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  if (!info) return error ? <PageError onRetry={() => void refetch()} /> : null;
  const currentPlan = info.plans.find(plan => plan.id === info.tier)!;
  const currentIndex = info.plans.indexOf(currentPlan);
  const subscriptionPlan = info.plans.find(
    plan => plan.id === info.subscription?.plan
  );
  const upgrades = info.plans.filter(
    (plan, index) => plan.enabled && index > currentIndex && plan.checkoutUrl
  );
  const isDefault = info.tier === info.defaultTierId;

  const checkoutUrl = (base: string | null) => {
    if (!base || !user) return null;
    // Lemon Squeezy hosted checkout prefill: attribute the subscription
    // to this user via checkout[custom][user_id] (read by the webhook).
    const url = new URL(base);
    url.searchParams.set("checkout[custom][user_id]", user.id);
    return url.toString();
  };

  const chatPct =
    info.usage.chatLimit != null && info.usage.chatLimit > 0
      ? Math.min(100, (info.usage.chatToday / info.usage.chatLimit) * 100)
      : null;
  const selfiePct =
    info.usage.selfieLimit != null && info.usage.selfieLimit > 0
      ? Math.min(100, (info.usage.selfiesUsed / info.usage.selfieLimit) * 100)
      : null;
  const nearLimit =
    (chatPct !== null && chatPct >= 80) ||
    (selfiePct !== null && selfiePct >= 80);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-primary" />
          {t("billing:planUsage")}
          <Badge variant={isDefault ? "secondary" : "default"}>
            {contentText(currentPlan.label, locale)}
          </Badge>
        </CardTitle>
        <CardDescription>
          {info.mode === "none"
            ? t("billing:selfHostedModeAllFeaturesUnlockedWithNo")
            : isDefault
              ? t("billing:defaultPlanDescription")
              : info.subscription?.status === "cancelled"
                ? t("billing:cancelledAccessContinuesUntil", {
                    date: info.subscription.endsAt
                      ? new Date(info.subscription.endsAt).toLocaleDateString(
                          locale
                        )
                      : t("billing:theEndOfThisPeriod"),
                  })
                : t("billing:thankYouForSubscribing")}
        </CardDescription>
      </CardHeader>
      {(info.mode !== "none" || info.subscription) && (
        <CardContent className="space-y-4">
          {info.subscription && (
            <section
              className="space-y-3"
              aria-label={t("billing:statusLabel")}
            >
              <p>
                {t("billing:statusLabel")}：
                {t(`billing:status_${info.subscription.status}`)}
              </p>
              {info.subscription.status !== "cancelled" &&
                info.subscription.status !== "expired" &&
                info.subscription.renewsAt && (
                  <p className="text-sm">
                    {t("billing:nextRenewal", {
                      time: formatResetTime(
                        new Date(info.subscription.renewsAt).toISOString(),
                        locale
                      ),
                    })}
                  </p>
                )}
              <p className="text-xs text-muted-foreground">
                {subscriptionPlan &&
                  t("billing:planPrice", {
                    price: formatPrice(subscriptionPlan.price, locale),
                  })}
              </p>
              {["past_due", "unpaid", "paused"].includes(
                info.subscription.status
              ) && (
                <p role="status" className="text-sm text-destructive">
                  {t("billing:paymentProblem")}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {t(
                  info.management?.available
                    ? "billing:manageHint"
                    : "billing:portalUnavailable"
                )}
              </p>
              {info.management?.available && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={portal.isPending}
                    onClick={() => portal.mutate({ action: "manage" })}
                  >
                    {t("billing:manageSubscription")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={portal.isPending}
                    onClick={() => portal.mutate({ action: "payment" })}
                  >
                    {t("billing:updatePayment")}
                  </Button>
                </div>
              )}
            </section>
          )}
          {info.mode === "lemonsqueezy" && (
            <Button
              variant="outline"
              disabled={refresh.isPending}
              onClick={() => {
                setNotice("");
                refresh.mutate();
              }}
            >
              {t("billing:refreshSubscription")}
            </Button>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          <Link
            href="/help?category=billing"
            className="block text-sm text-primary underline"
          >
            {t("billing:paymentHelp")}
          </Link>
          {info.economy && (
            <div className="rounded-xl border p-4 text-sm space-y-3">
              <p>
                {t("economy:balance")}: {info.economy.balance}
              </p>
              <p>
                {t("economy:planCoins", {
                  count: info.economy.planCoins[info.tier] ?? 0,
                })}
              </p>
              <p>{t("economy:costPolicy")}</p>
              <Link className="underline" href="/wallet">
                {t("economy:wallet")}
              </Link>
            </div>
          )}
          {!info.economy && nearLimit && (
            <p className="text-xs rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 border border-amber-400/50 px-3 py-2">
              {t(
                info.mode === "lemonsqueezy" && upgrades.length > 0
                  ? "billing:nearLimitUpgrade"
                  : "billing:nearLimit"
              )}
            </p>
          )}

          {!info.economy && info.usage.chatLimit != null && !info.byok.chat && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t("billing:messagesToday")}</span>
                <span>
                  {info.usage.chatToday} / {info.usage.chatLimit}
                </span>
              </div>
              <Progress value={chatPct ?? 0} />
              {info.usage.chatResetsAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("billing:resetsAt", {
                    time: formatResetTime(info.usage.chatResetsAt, locale),
                  })}
                </p>
              )}
            </div>
          )}
          {!info.economy &&
            info.usage.selfieLimit != null &&
            !info.byok.selfie && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>
                    {info.usage.selfiePeriod === "day"
                      ? t("billing:selfiesToday")
                      : t("billing:selfiesThisMonth")}
                  </span>
                  <span>
                    {info.usage.selfiesUsed} / {info.usage.selfieLimit}
                  </span>
                </div>
                <Progress value={selfiePct ?? 0} />
                {info.usage.selfieResetsAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("billing:resetsAt", {
                      time: formatResetTime(info.usage.selfieResetsAt, locale),
                    })}
                  </p>
                )}
              </div>
            )}
          {(info.byok.chat || info.byok.selfie) && (
            <p className="text-xs text-muted-foreground">
              {t("billing:byok", {
                features: new Intl.ListFormat(locale).format(
                  [
                    info.byok.chat ? t("common:chat") : null,
                    info.byok.selfie ? t("billing:selfies") : null,
                  ].filter((value): value is string => value !== null)
                ),
              })}
            </p>
          )}

          {info.mode === "lemonsqueezy" &&
            !info.management?.checkoutBlocked &&
            upgrades.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                {upgrades.map(plan => (
                  <Button
                    key={plan.id}
                    className="flex-1"
                    onClick={() =>
                      window.open(checkoutUrl(plan.checkoutUrl)!, "_blank")
                    }
                  >
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    {t("billing:upgrade", {
                      plan: contentText(plan.label, locale),
                      price: formatPrice(plan.price, locale),
                    })}
                  </Button>
                ))}
              </div>
            )}
          {info.mode === "free" && (
            <p className="text-xs text-muted-foreground">
              {t("billing:paidSubscriptionsAreNotAvailableYetAddYour")}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
