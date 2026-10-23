import { Link } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
export default function DataDeletion() {
  const { t } = useI18n();
  const [token] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("receipt") ?? ""
  );
  const query = trpc.privacy.deletionStatus.useQuery(
    { token },
    {
      enabled: /^[a-f0-9]{48}$/.test(token),
      retry: false,
      refetchInterval: q => (q.state.data?.mediaPending ? 10_000 : false),
    }
  );
  return (
    <article className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">{t("privacy:receiptTitle")}</h1>
      {query.data ? (
        <>
          <p>{t("privacy:accountRemoved")}</p>
          <p role="status">
            {t(
              query.data.mediaPending
                ? "privacy:mediaPending"
                : "privacy:mediaComplete"
            )}
          </p>
        </>
      ) : (
        <p role="status">
          {t(query.isLoading ? "auth:working" : "privacy:receiptMissing")}
        </p>
      )}
      <Button
        variant="outline"
        disabled={!token || query.isFetching}
        onClick={() => void query.refetch()}
      >
        {t("privacy:checkStatus")}
      </Button>
      <Link href="/" className="block text-primary underline">
        {t("privacy:backHome")}
      </Link>
    </article>
  );
}
