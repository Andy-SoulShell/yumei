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
import { TIER_LABELS, TIER_PRICES } from "../../../shared/quotas";
import { Crown, Sparkles } from "lucide-react";

/**
 * 读取套餐及用量接口并显示额度、临近上限提示和配置的升级链接。
 *
 * @remarks free 展示免费额度；none 展示全解锁状态；只有订阅模式展示结账入口。
 */
export function BillingCard() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { data: info } = trpc.billing.getInfo.useQuery();

  if (!info) return null;

  const checkoutUrl = (base: string | null) => {
    if (!base || !user) return null;
    // Lemon Squeezy hosted checkout prefill: attribute the subscription
    // to this user via checkout[custom][user_id] (read by the webhook).
    const url = new URL(base);
    url.searchParams.set("checkout[custom][user_id]", (user as any).id);
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
          {t("订阅与用量")}
          <Badge variant={info.tier === "free" ? "secondary" : "default"}>
            {TIER_LABELS[info.tier]}
          </Badge>
        </CardTitle>
        <CardDescription>
          {info.mode === "none"
            ? t("自托管模式：全部功能已解锁，不计量。")
            : info.tier === "free"
              ? t(
                  "免费档：每天 30 条消息、1 张自拍。配置自己的 API Key 可绕过限额。"
                )
              : info.subscription?.status === "cancelled"
                ? t("已取消，服务保留至 {v0}", {
                    v0: info.subscription.endsAt
                      ? new Date(info.subscription.endsAt).toLocaleDateString(
                          locale
                        )
                      : t("本周期结束"),
                  })
                : t("感谢订阅！")}
        </CardDescription>
      </CardHeader>
      {info.mode !== "none" && (
        <CardContent className="space-y-4">
          {nearLimit && (
            <p className="text-xs rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 border border-amber-400/50 px-3 py-2">
              {t("用量已超过 80%")}
              {info.mode === "lemonsqueezy" && info.tier !== "pro"
                ? t("，升级可获得更高额度。")
                : "。"}
            </p>
          )}

          {info.usage.chatLimit != null && !info.byok.chat && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t("今日消息")}</span>
                <span>
                  {info.usage.chatToday} / {info.usage.chatLimit}
                </span>
              </div>
              <Progress value={chatPct ?? 0} />
            </div>
          )}
          {info.usage.selfieLimit != null && !info.byok.selfie && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>
                  {info.usage.selfiePeriod === "day"
                    ? t("今日自拍")
                    : t("本月自拍")}
                </span>
                <span>
                  {info.usage.selfiesUsed} / {info.usage.selfieLimit}
                </span>
              </div>
              <Progress value={selfiePct ?? 0} />
            </div>
          )}
          {(info.byok.chat || info.byok.selfie) && (
            <p className="text-xs text-muted-foreground">
              {t("已配置自己的 API Key 的功能不计量（")}
              {[info.byok.chat && t("聊天"), info.byok.selfie && t("自拍")]
                .filter(Boolean)
                .join("、")}
              ）。
            </p>
          )}

          {info.mode === "lemonsqueezy" && info.tier !== "pro" && (
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {info.tier === "free" && info.checkoutUrls.plus && (
                <Button
                  className="flex-1"
                  onClick={() =>
                    window.open(checkoutUrl(info.checkoutUrls.plus)!, "_blank")
                  }
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {t("升级 Plus（")}
                  {TIER_PRICES.plus.replace("/月", t("/月"))}）
                </Button>
              )}
              {info.checkoutUrls.pro && (
                <Button
                  variant={info.tier === "free" ? "outline" : "default"}
                  className="flex-1"
                  onClick={() =>
                    window.open(checkoutUrl(info.checkoutUrls.pro)!, "_blank")
                  }
                >
                  <Crown className="w-4 h-4 mr-1.5" />
                  {t("升级 Pro（")}
                  {TIER_PRICES.pro.replace("/月", t("/月"))}）
                </Button>
              )}
            </div>
          )}
          {info.mode === "free" && (
            <p className="text-xs text-muted-foreground">
              {t(
                "本站尚未开通付费订阅；需要更高额度可在下方配置自己的 API Key（BYOK）。"
              )}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
