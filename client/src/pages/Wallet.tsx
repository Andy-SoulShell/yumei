import { VerifyEmailAction } from "@/features/auth/VerifyEmailAction";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearch, Link } from "wouter";
import { Coins, RefreshCw, Gift, Copy } from "lucide-react";
import { apiErrorMessage } from "@/lib/errors";
import { copyText } from "@/lib/copyText";
import {
  formDraftKey,
  readFormDraft,
  writeFormDraft,
  formDraftEpoch,
} from "@/lib/formDrafts";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageError } from "@/components/PageError";
import type { StaticMessageKey } from "@shared/i18n";
export default function Wallet() {
  const { user } = useAuth();
  return user ? <WalletContent key={user.id} owner={user.id} /> : null;
}
function WalletContent({ owner }: { owner: string }) {
  const epoch = useRef(formDraftEpoch()),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const valid = () => mounted.current && epoch.current === formDraftEpoch();
  const requestKey = formDraftKey(owner, "coin-checkout");
  const requests = useRef<Record<string, unknown>>(
    readFormDraft(requestKey) ?? {}
  );
  const { t, locale } = useI18n(),
    search = useSearch();
  const utils = trpc.useUtils();
  const wallet = trpc.economy.wallet.useQuery(undefined, {
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (notice) toast(notice);
  }, [notice]);
  const [code, setCode] = useState(
    () => new URLSearchParams(search).get("ref") ?? ""
  );
  const checkout = trpc.economy.checkout.useMutation({
    onSuccess: ({ url }) => {
      if (valid()) window.location.assign(url);
    },
    onError: error => {
      if (valid()) setNotice(apiErrorMessage(error, t));
    },
  });
  const claim = trpc.economy.claimReferral.useMutation({
    onSuccess: () => {
      if (!valid()) return;
      setNotice(t("economy:claimDone"));
      void utils.economy.wallet.invalidate();
    },
    onError: error => {
      if (valid()) setNotice(apiErrorMessage(error, t));
    },
  });
  if (wallet.error) return <PageError onRetry={() => void wallet.refetch()} />;
  if (!wallet.data)
    return (
      <p role="status" className="p-6">
        {t("auth:working")}
      </p>
    );
  const { policy, history, ...data } = wallet.data;
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  const startCheckout = (packId: string, id?: string) => {
    const saved = requests.current[packId];
    const active = data.checkouts.find(item => item.id === saved);
    const clientRequestId =
      id ??
      (typeof saved === "string" &&
      (!active ||
        (active.status === "waiting" &&
          new Date(active.expiresAt).getTime() > Date.now()))
        ? saved
        : crypto.randomUUID());
    requests.current = { ...requests.current, [packId]: clientRequestId };
    if (valid()) writeFormDraft(requestKey, requests.current);
    setNotice("");
    checkout.mutate({ packId, clientRequestId });
  };
  const waiting = data.checkouts.filter(item => item.status === "waiting");
  const link = `${window.location.origin}/wallet?ref=${data.referralCode}`;
  return (
    <div className="studio-account-page">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>
          <Coins />
          {t("economy:wallet")}
        </h1>
        <Button
          variant="outline"
          onClick={() => void wallet.refetch()}
          disabled={wallet.isFetching}
        >
          <RefreshCw className={wallet.isFetching ? "animate-spin" : ""} />
          {t("economy:refresh")}
        </Button>
      </header>
      <section
        className="studio-wallet-balance"
        aria-label={t("economy:balance")}
      >
        <p>{t("economy:balance")}</p>
        <strong>{data.balance.toLocaleString(locale)}</strong>
        <div className="flex flex-wrap gap-4 text-sm">
          <span>{t("economy:paid", { count: data.paid })}</span>
          <span>{t("economy:bonus", { count: data.bonus })}</span>
        </div>
      </section>
      <p className="text-sm text-muted-foreground">
        {t(
          data.chargingEnabled
            ? "economy:costPolicy"
            : policy.enabled
              ? "economy:noMetering"
              : "economy:legacy"
        )}
      </p>
      {notice && (
        <p role="status" className="rounded-xl border p-4 text-sm">
          {notice}
        </p>
      )}
      {waiting.length > 0 && (
        <section className="studio-account-card space-y-4">
          <h2>{t("economy:pendingPayments")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("economy:awaitingPayment")}
          </p>
          {waiting.map(item => (
            <article className="space-y-2 rounded-xl border p-3" key={item.id}>
              <p>
                {t("economy:pack", { count: item.coins })} ·{" "}
                {money(item.priceCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString(locale)}
              </p>
              {new Date(item.expiresAt).getTime() > Date.now() ? (
                <Button
                  variant="outline"
                  disabled={
                    !data.checkoutReady ||
                    !data.emailVerified ||
                    checkout.isPending
                  }
                  onClick={() => startCheckout(item.packId, item.id)}
                >
                  {t("economy:resumeCheckout")}
                </Button>
              ) : (
                <p className="text-sm">{t("economy:expiredCheckout")}</p>
              )}
            </article>
          ))}
        </section>
      )}
      <section className="space-y-4">
        <h2>{t("economy:recharge")}</h2>
        {!data.emailVerified && (
          <div className="text-sm">
            <p>{t("economy:verifyEmail")}</p>
            <VerifyEmailAction returnTo="/wallet" />
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {t("economy:paymentNotice")}
        </p>
        <div className="studio-coin-packs">
          {policy.packs
            .filter(pack => pack.enabled)
            .map(pack => (
              <article key={pack.id}>
                <Coins className="text-pink-400" />
                <h3>{t("economy:pack", { count: pack.coins })}</h3>
                <p>{money(pack.priceCents)}</p>
                <Button
                  className="w-full"
                  disabled={
                    !data.checkoutReady ||
                    !data.emailVerified ||
                    !pack.checkoutUrl ||
                    !pack.variantId ||
                    checkout.isPending
                  }
                  onClick={() => {
                    setNotice("");
                    startCheckout(
                      pack.id,
                      waiting.find(
                        item =>
                          item.packId === pack.id &&
                          new Date(item.expiresAt).getTime() > Date.now()
                      )?.id
                    );
                  }}
                >
                  {checkout.isPending
                    ? t("auth:working")
                    : t(
                        waiting.some(
                          item =>
                            item.packId === pack.id &&
                            new Date(item.expiresAt).getTime() > Date.now()
                        )
                          ? "economy:resumeCheckout"
                          : "economy:purchase"
                      )}
                </Button>
              </article>
            ))}
        </div>
        {(!data.checkoutReady ||
          !policy.packs.some(
            pack => pack.enabled && pack.checkoutUrl && pack.variantId
          )) && (
          <p role="status" className="text-sm">
            {t("economy:notConfigured")}
          </p>
        )}
      </section>
      <section className="studio-account-card space-y-4">
        <h2 className="flex items-center gap-2">
          <Gift />
          {t("economy:referrals")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("economy:referralPolicy", {
            reward: policy.referralReward,
            invitee: policy.inviteeReward,
          })}
        </p>
        <label className="block text-sm">
          {t("economy:inviteLink")}
          <Input
            className="mt-2"
            readOnly
            value={link}
            onFocus={event => event.target.select()}
          />
        </label>
        <Button
          variant="outline"
          onClick={() =>
            void copyText(link)
              .then(() => {
                if (valid()) setNotice(t("economy:copiedInvite"));
              })
              .catch(() => {
                if (valid()) setNotice(t("economy:copyFailed"));
              })
          }
        >
          <Copy />
          {t("economy:copyInvite")}
        </Button>
        <p className="text-sm">{t("economy:invited", data.invited)}</p>
        {data.referral && (
          <p role="status" className="text-sm">
            {t(`economy:referral_${data.referral.status}`)}
          </p>
        )}
        {!data.referral && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={event => {
              event.preventDefault();
              setNotice("");
              claim.mutate({ code });
            }}
          >
            <label className="min-w-0 flex-1 text-sm">
              {t("economy:referralCode")}
              <Input
                className="mt-2"
                autoCapitalize="none"
                autoCorrect="off"
                pattern="[a-f0-9]{20}"
                required
                value={code}
                onChange={event => setCode(event.target.value)}
              />
            </label>
            <Button
              disabled={
                !policy.enabled || !data.emailVerified || claim.isPending
              }
            >
              {claim.isPending ? t("auth:working") : t("economy:claim")}
            </Button>
          </form>
        )}
      </section>
      {data.orders.length > 0 && (
        <section className="space-y-4">
          <h2>{t("economy:orderHistory")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("economy:availableOrders")}
          </p>
          <ul className="studio-ledger">
            {data.orders.map(order => (
              <li key={order.id}>
                <div>
                  <p>{t("economy:orderNumber", { id: order.id })}</p>
                  <time className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString(locale)}
                  </time>
                  {order.refundedCents > 0 && (
                    <p className="text-sm">
                      {t("economy:refundSummary", {
                        amount: money(order.refundedCents),
                        count: order.revoked,
                      })}
                    </p>
                  )}
                </div>
                <strong className="shrink-0">{money(order.totalCents)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-4">
        <h2>{t("economy:history")}</h2>
        {!history.length && (
          <p className="text-sm text-muted-foreground">
            {t("economy:noHistory")}
          </p>
        )}
        <ul className="studio-ledger">
          {history.map(row => (
            <li key={row.id}>
              <div>
                <p>
                  {t(
                    `economy:${row.reason === "purchase" ? "purchaseReason" : row.reason}` as StaticMessageKey
                  )}
                </p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(row.createdAt).toISOString()}
                >
                  {new Date(row.createdAt).toLocaleString(locale)}
                </time>
              </div>
              <div className="text-right tabular-nums">
                <strong>
                  {row.paidDelta + row.bonusDelta > 0 ? "+" : ""}
                  {row.paidDelta + row.bonusDelta}
                </strong>
                <p className="text-xs text-muted-foreground">
                  {t("economy:balance")} {row.balanceAfter}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <Link className="text-sm underline" href="/creator">
        {t("economy:creator")}
      </Link>
    </div>
  );
}
