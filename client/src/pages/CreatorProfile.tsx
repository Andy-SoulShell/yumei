import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
import { PublishedCharacterCards } from "@/features/discovery/PublishedCharacterCards";
export default function CreatorProfile({ handle }: { handle: string }) {
  const { t } = useI18n(),
    query = trpc.economy.creatorPage.useQuery({ handle }, { retry: false });
  if (
    query.error &&
    (query.error.data?.code === "NOT_FOUND" ||
      query.error.data?.code === "BAD_REQUEST")
  )
    return (
      <div className="studio-account-page">
        <h1>{t("economy:creator")}</h1>
        <p>{t("economy:profileUnavailable")}</p>
        <Button asChild variant="outline">
          <Link href="/community">{t("studio:community")}</Link>
        </Button>
      </div>
    );
  if (query.error)
    return (
      <div className="studio-account-page">
        <PageError onRetry={() => void query.refetch()} />
        <Button asChild variant="outline">
          <Link href="/community">{t("studio:community")}</Link>
        </Button>
      </div>
    );
  if (!query.data)
    return (
      <p role="status" className="p-6">
        {t("auth:working")}
      </p>
    );
  const { profile, characters } = query.data;
  return (
    <div className="studio-account-page">
      <header className="space-y-3">
        <h1>{profile.displayName}</h1>
        <p className="text-sm text-muted-foreground">@{profile.handle}</p>
        {profile.bio && <p className="whitespace-pre-wrap">{profile.bio}</p>}
        <Button asChild variant="outline">
          <Link href="/community">{t("studio:community")}</Link>
        </Button>
      </header>
      <section className="space-y-4">
        <h2>{t("economy:publicCharacters", { count: characters.length })}</h2>
        {characters.length ? (
          <PublishedCharacterCards characters={characters} />
        ) : (
          <p>{t("economy:communityEmpty")}</p>
        )}
      </section>
    </div>
  );
}
