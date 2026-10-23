import { VerifyEmailAction } from "@/features/auth/VerifyEmailAction";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";
import { EARNING_UNITS_PER_CENT } from "@shared/economy";
import type { StaticMessageKey } from "@shared/i18n";
import { trpc } from "@/lib/trpc";
import { apiErrorMessage } from "@/lib/errors";
import {
  formDraftEpoch,
  formDraftKey,
  readFormDraft,
  writeFormDraft,
  removeFormDraft,
} from "@/lib/formDrafts";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageError } from "@/components/PageError";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type RouterOutputs = inferRouterOutputs<AppRouter>;
type CreatorData = RouterOutputs["economy"]["creator"];
type Publication = CreatorData["publications"][number];
/** Drafts are scoped to the signed-in account and current tab. */
function useCreatorDraft<T extends Record<string, string>>(
  owner: string,
  form: string,
  initial: T
) {
  const key = formDraftKey(owner, form),
    epoch = useRef(formDraftEpoch()),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [value, setValue] = useState<T>(() => {
    const saved = readFormDraft(key);
    return Object.fromEntries(
      Object.entries(initial).map(([key, value]) => [
        key,
        typeof saved?.[key] === "string" ? saved[key] : value,
      ])
    ) as T;
  });
  const valid = () => mounted.current && epoch.current === formDraftEpoch();
  const update = (patch: Partial<T>) => {
    const next = { ...value, ...patch };
    setValue(next);
    if (valid()) writeFormDraft(key, next);
  };
  return {
    value,
    update,
    valid,
    clear: () => {
      if (valid()) removeFormDraft(key);
    },
  };
}
export default function Creator() {
  const { user } = useAuth();
  return user ? <CreatorContent key={user.id} owner={user.id} /> : null;
}
function CreatorContent({ owner }: { owner: string }) {
  const { t, locale } = useI18n(),
    utils = trpc.useUtils();
  const query = trpc.economy.creator.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (notice) toast(notice);
  }, [notice]);
  const [editing, setEditing] = useState<Publication | "new" | null>(null),
    [unlist, setUnlist] = useState<string | null>(null),
    [confirmPayout, setConfirmPayout] = useState(false);
  const request = useCreatorDraft(owner, "creator-payout", {
    id: crypto.randomUUID(),
    amount: "",
  });
  const refresh = () => {
    void utils.economy.creator.invalidate();
    void utils.economy.community.invalidate();
  };
  const withdraw = trpc.economy.unlistCharacter.useMutation({
    onSuccess: () => {
      if (!request.valid()) return;
      setNotice(t("economy:unlisted"));
      setUnlist(null);
      refresh();
    },
    onError: error => setNotice(apiErrorMessage(error, t)),
  });
  const payout = trpc.economy.requestPayout.useMutation({
    onSuccess: () => {
      if (!request.valid()) return;
      request.clear();
      request.update({ id: crypto.randomUUID(), amount: "" });
      setNotice(t("economy:payoutRequested"));
      setConfirmPayout(false);
      refresh();
    },
    onError: error => setNotice(apiErrorMessage(error, t)),
  });
  if (query.error) return <PageError onRetry={() => void query.refetch()} />;
  if (!query.data)
    return (
      <p role="status" className="p-6">
        {t("auth:working")}
      </p>
    );
  const data = query.data,
    policy = data.policy;
  const cents = (units: number) => Math.floor(units / EARNING_UNITS_PER_CENT),
    money = (amount: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
      }).format(amount / 100);
  const available = cents(data.availableUnits),
    pending = data.payouts.some(row => row.status === "requested");
  const payoutReason = !data.emailVerified
    ? "verifyEmail"
    : pending
      ? "payoutPending"
      : available < policy.minimumPayoutCents
        ? "payoutMinimum"
        : !policy.enabled
          ? "payoutUnavailable"
          : null;
  return (
    <div className="studio-account-page">
      <header className="flex flex-wrap justify-between gap-4">
        <h1>
          <Sparkles />
          {t("economy:creator")}
        </h1>
        <Button asChild variant="outline">
          <Link href="/community">{t("studio:community")}</Link>
        </Button>
      </header>
      {notice && (
        <p role="status" className="studio-feedback">
          {notice}
        </p>
      )}
      <section className="studio-account-card space-y-4">
        <h2>{t("economy:profile")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("economy:profileHint")}
        </p>
        {data.profile && (
          <Button asChild variant="outline">
            <Link href={`/u/${data.profile.handle}`}>
              {t("economy:publicProfile")}
            </Link>
          </Button>
        )}
        <ProfileEditor
          key={data.profile?.handle ?? "new"}
          owner={owner}
          data={data}
          onSaved={() => {
            setNotice(t("economy:saved"));
            refresh();
          }}
        />
      </section>
      <section className="studio-account-card space-y-4">
        <h2>{t("economy:publications")}</h2>
        {!data.profile && (
          <p className="text-sm">{t("economy:profileRequired")}</p>
        )}
        <Button
          onClick={() => setEditing(editing ? null : "new")}
          disabled={!data.profile}
        >
          {t(editing ? "common:cancel" : "economy:publish")}
        </Button>
        {editing && (
          <PublicationEditor
            key={editing === "new" ? "new" : editing.id}
            owner={owner}
            publication={editing === "new" ? undefined : editing}
            publications={data.publications}
            onSaved={() => {
              setNotice(t("economy:submitted"));
              setEditing(null);
              refresh();
            }}
          />
        )}
        {!data.publications.length && (
          <p className="text-sm text-muted-foreground">
            {t("economy:noPublications")}
          </p>
        )}
        <div className="space-y-3">
          {data.publications.map(row => (
            <article className="rounded-xl border p-4 space-y-3" key={row.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <strong>{row.snapshot.name}</strong>
                <span>{t(`economy:${row.status}` as StaticMessageKey)}</span>
              </div>
              {row.status === "published" && row.reviewState !== "approved" && (
                <p className="text-sm">
                  {t(
                    row.reviewState === "pending"
                      ? "economy:updatePending"
                      : "economy:updateRejected"
                  )}
                </p>
              )}
              {row.moderationNote && (
                <p className="text-sm whitespace-pre-wrap">
                  {row.moderationNote}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={withdraw.isPending}
                  onClick={() => {
                    setEditing(row);
                    setUnlist(null);
                  }}
                >
                  {t("economy:editPublication")}
                </Button>
                {row.status === "published" && (
                  <Button asChild variant="outline">
                    <Link href={`/community?character=${row.id}`}>
                      {t("economy:viewPublication")}
                    </Link>
                  </Button>
                )}
                {row.status !== "unlisted" && unlist !== row.id && (
                  <Button variant="outline" onClick={() => setUnlist(row.id)}>
                    {t("economy:unlist")}
                  </Button>
                )}
              </div>
              {unlist === row.id && (
                <div className="space-y-3">
                  <p className="text-sm">{t("economy:unlistConfirm")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={withdraw.isPending}
                      onClick={() => withdraw.mutate({ id: row.id })}
                    >
                      {withdraw.isPending
                        ? t("auth:working")
                        : t("economy:unlist")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={withdraw.isPending}
                      onClick={() => setUnlist(null)}
                    >
                      {t("common:cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="studio-account-card space-y-4">
        <h2>{t("economy:earnings")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("economy:earningsPolicy", {
            percent: policy.creatorShareBps / 100,
            days: policy.creatorHoldDays,
          })}
        </p>
        <p className="text-xl font-semibold tabular-nums">
          {t("economy:availableEarnings", { amount: money(available) })}
        </p>
        <p>
          {t("economy:heldEarnings", { amount: money(cents(data.heldUnits)) })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("economy:payoutHint", {
            amount: money(policy.minimumPayoutCents),
          })}
        </p>
        {payoutReason && (
          <p className="text-sm" id="payout-unavailable">
            {t(`economy:${payoutReason}`)}
          </p>
        )}
        {!data.emailVerified && <VerifyEmailAction returnTo="/creator" />}
        <Button
          disabled={!!payoutReason || payout.isPending}
          aria-describedby={payoutReason ? "payout-unavailable" : undefined}
          onClick={() => {
            const amount = String(Math.min(10000000, available));
            request.update({
              id:
                request.value.amount === amount
                  ? request.value.id
                  : crypto.randomUUID(),
              amount,
            });
            setConfirmPayout(true);
          }}
        >
          {t("economy:payout")}
        </Button>
        <ul className="studio-ledger">
          {data.payouts.map(row => (
            <li key={row.id}>
              <div>
                <p>
                  {new Date(row.createdAt).toLocaleDateString(locale)} ·{" "}
                  {t(
                    `economy:${row.status === "paid" ? "payoutPaid" : row.status}` as StaticMessageKey
                  )}
                </p>
                {row.note && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {row.note}
                  </p>
                )}
                {row.reference && (
                  <p className="text-xs break-all">
                    {t("economy:paymentReference", { id: row.reference })}
                  </p>
                )}
              </div>
              <strong className="shrink-0">{money(row.amountCents)}</strong>
            </li>
          ))}
        </ul>
      </section>
      <Dialog
        open={confirmPayout}
        onOpenChange={open => {
          if (!payout.isPending) setConfirmPayout(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("economy:payout")}</DialogTitle>
            <DialogDescription>
              {t("economy:payoutConfirm", {
                amount: money(Number(request.value.amount)),
              })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {t("economy:payoutHint", {
              amount: money(policy.minimumPayoutCents),
            })}
          </p>
          {payout.error && (
            <p role="alert" className="text-sm">
              {apiErrorMessage(payout.error, t)}
            </p>
          )}
          <DialogFooter className="[&_button]:min-h-11">
            <Button
              variant="outline"
              disabled={payout.isPending}
              onClick={() => setConfirmPayout(false)}
            >
              {t("common:cancel")}
            </Button>
            <Button
              disabled={payout.isPending || !!payoutReason}
              onClick={() =>
                payout.mutate({
                  id: request.value.id,
                  amountCents: Number(request.value.amount),
                })
              }
            >
              {payout.isPending
                ? t("auth:working")
                : t("economy:confirmPayout")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ProfileEditor({
  owner,
  data,
  onSaved,
}: {
  owner: string;
  data: CreatorData;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const draft = useCreatorDraft(owner, "creator-profile", {
    handle: data.profile?.handle ?? "",
    displayName: data.profile?.displayName ?? "",
    bio: data.profile?.bio ?? "",
  });
  const [error, setError] = useState("");
  const mutation = trpc.economy.saveProfile.useMutation({
    onSuccess: () => {
      if (!draft.valid()) return;
      draft.clear();
      setError("");
      onSaved();
    },
    onError: error => {
      if (draft.valid()) setError(apiErrorMessage(error, t));
    },
  });
  return (
    <form
      className="studio-form-stack"
      onSubmit={event => {
        event.preventDefault();
        setError("");
        mutation.mutate(draft.value);
      }}
    >
      <p className="text-xs text-muted-foreground">{t("economy:draftHint")}</p>
      <fieldset disabled={mutation.isPending} className="studio-form-stack">
        <label>
          {t("economy:handle")}
          <Input
            name="handle"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-z0-9_]{3,32}"
            autoCapitalize="none"
            autoCorrect="off"
            value={draft.value.handle}
            onChange={e => draft.update({ handle: e.target.value })}
          />
        </label>
        <label>
          {t("economy:displayName")}
          <Input
            name="displayName"
            required
            maxLength={80}
            value={draft.value.displayName}
            onChange={e => draft.update({ displayName: e.target.value })}
          />
        </label>
        <label>
          {t("economy:bio")}
          <Textarea
            name="bio"
            maxLength={500}
            value={draft.value.bio}
            onChange={e => draft.update({ bio: e.target.value })}
          />
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <Button disabled={mutation.isPending}>
        {mutation.isPending ? t("auth:working") : t("economy:save")}
      </Button>
    </form>
  );
}
function PublicationEditor({
  owner,
  publication,
  publications,
  onSaved,
}: {
  owner: string;
  publication?: Publication;
  publications: Publication[];
  onSaved: () => void;
}) {
  const { t } = useI18n(),
    roles = trpc.girlfriend.list.useQuery();
  const candidate = publication?.pendingSnapshot ?? publication?.snapshot;
  const draft = useCreatorDraft(
    owner,
    `creator-publication:${publication?.id ?? "new"}`,
    {
      selected: publication ? String(publication.sourceId) : "",
      summary: candidate?.summary ?? "",
      scenario: candidate?.scenario ?? "",
      clientRequestId: crypto.randomUUID(),
      expectedVersion: publication ? String(publication.reviewVersion) : "",
    }
  );
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const change = (patch: Partial<typeof draft.value>) =>
    draft.update({ ...patch, clientRequestId: crypto.randomUUID() });
  const mutation = trpc.economy.submitCharacter.useMutation({
    onSuccess: () => {
      if (!draft.valid()) return;
      draft.clear();
      onSaved();
    },
    onError: error => {
      if (draft.valid()) setError(apiErrorMessage(error, t));
    },
  });
  const source = roles.data?.find(
    role => String(role.id) === draft.value.selected
  );
  return (
    <form
      className="studio-form-stack"
      onSubmit={e => {
        e.preventDefault();
        setError("");
        mutation.mutate({
          girlfriendId: Number(draft.value.selected),
          summary: draft.value.summary,
          scenario: draft.value.scenario,
          adultAndRightsConfirmed: true,
          clientRequestId: draft.value.clientRequestId,
          expectedReviewVersion: draft.value.expectedVersion
            ? Number(draft.value.expectedVersion)
            : undefined,
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        {t("economy:publishHint")}
      </p>
      <p className="text-xs text-muted-foreground">{t("economy:draftHint")}</p>
      {publication?.status === "published" && (
        <p className="text-sm">{t("economy:updatePending")}</p>
      )}
      {publication && roles.data && !source && (
        <p role="alert" className="text-sm">
          {t("economy:sourceChanged")}
        </p>
      )}
      {roles.error ? (
        <PageError onRetry={() => void roles.refetch()} />
      ) : roles.data?.length === 0 ? (
        <Button asChild variant="outline">
          <Link href="/create">{t("economy:createFirst")}</Link>
        </Button>
      ) : (
        <>
          <fieldset disabled={mutation.isPending} className="studio-form-stack">
            <label>
              {t("explore:navCharacters")}
              <select
                className="admin-select"
                value={draft.value.selected}
                disabled={!!publication}
                required
                onChange={e => {
                  const row = publications.find(
                      row => String(row.sourceId) === e.target.value
                    ),
                    snapshot = row?.pendingSnapshot ?? row?.snapshot;
                  change({
                    selected: e.target.value,
                    expectedVersion: row ? String(row.reviewVersion) : "",
                    summary: snapshot?.summary ?? "",
                    scenario: snapshot?.scenario ?? "",
                  });
                  setConfirmed(false);
                }}
              >
                <option value="">—</option>
                {roles.data?.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            {source && (
              <div className="flex items-start gap-3">
                <img
                  src={source.referenceImageUrl}
                  alt={source.name}
                  className="h-24 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 text-sm">
                  <strong>{source.name}</strong>
                  <details>
                    <summary className="cursor-pointer py-3">
                      {t("economy:previewPublic")}
                    </summary>
                    <p className="whitespace-pre-wrap break-words">
                      {source.personality}\n{source.appearance}\n
                      {source.interests}
                    </p>
                  </details>
                </div>
              </div>
            )}
            <label>
              {t("economy:summary")}
              <Textarea
                required
                minLength={10}
                maxLength={500}
                value={draft.value.summary}
                onChange={e => change({ summary: e.target.value })}
              />
            </label>
            <label>
              {t("economy:scenario")}
              <Textarea
                required
                minLength={10}
                maxLength={2000}
                value={draft.value.scenario}
                onChange={e => change({ scenario: e.target.value })}
              />
            </label>
            <label className="rights">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
              />
              <span>{t("economy:confirmRights")}</span>
            </label>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <Button disabled={!source || !confirmed || mutation.isPending}>
            {mutation.isPending ? t("auth:working") : t("economy:submitReview")}
          </Button>
        </>
      )}
    </form>
  );
}
