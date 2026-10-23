/** 套餐价格和金币规则来自本站发布配置。 */
import { Link } from "wouter";
import { Gem, ArrowRight, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { useProductConfig } from "@/features/product/useProductConfig";
import { formatPrice } from "@/lib/formatters";
import { contentText } from "@shared/discovery";
import { BillingCard } from "@/components/BillingCard";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@/components/SignInButton";
export default function Upgrade() {
  const { t, locale } = useI18n();
  const { user, loading } = useAuth();
  const policy = useProductConfig();
  if (policy.error) return <PageError onRetry={() => void policy.refetch()} />;
  if (!policy.raw)
    return (
      <p role="status" className="p-8">
        {t("auth:working")}
      </p>
    );
  const billing = policy.raw.billing;
  return (
    <div className="studio-community">
      <div className="studio-community-hero">
        <Gem className="mb-4 size-9 text-pink-400" />
        <h1>{t("studio:upgrade")}</h1>
        <p>{t("studio:accountSafe")}</p>
      </div>
      {user ? (
        <div className="space-y-5">
          <Button asChild className="min-h-11">
            <Link href="/wallet">{t("economy:wallet")}</Link>
          </Button>
          <BillingCard />
        </div>
      ) : (
        <>
          <div className="studio-plans">
            {billing.plans
              .filter(plan => plan.enabled)
              .map(plan => (
                <div key={plan.id} className="studio-plan">
                  <h2>{contentText(plan.label, locale)}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(plan.price, locale)}
                  </p>
                  <ul>
                    {[
                      billing.economy.enabled && billing.mode !== "none"
                        ? t("economy:planCoins", {
                            count: billing.economy.planCoins[plan.id] ?? 0,
                          })
                        : t("studio:dailyChats", {
                            count:
                              plan.limits.dailyMessages ??
                              t("studio:unlimited"),
                          }),
                      t("studio:characterAllowance", {
                        count:
                          plan.limits.maxGirlfriends ?? t("studio:unlimited"),
                      }),
                      billing.economy.enabled && billing.mode !== "none"
                        ? t("economy:mediaPrices", {
                            chat: billing.economy.costs.chat,
                            image: billing.economy.costs.selfie,
                          })
                        : t(
                            plan.limits.monthlySelfies === null
                              ? "studio:dailyImages"
                              : "studio:monthlyImages",
                            {
                              count:
                                plan.limits.monthlySelfies ??
                                plan.limits.dailySelfies ??
                                t("studio:unlimited"),
                            }
                          ),
                    ].map((feature, index) => (
                      <li key={index}>
                        <Check size={16} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <SignInButton
                    returnTo="/upgrade"
                    initialMode="register"
                    label={t("landing:signupAction")}
                    disabled={loading}
                  />
                </div>
              ))}
          </div>
          <Button asChild variant="ghost" className="mt-5 min-h-11">
            <Link href="/explore">
              {t("studio:browseAll")}
              <ArrowRight />
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
