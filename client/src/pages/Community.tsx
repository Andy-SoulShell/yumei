import { PublishedCharacterCards } from "@/features/discovery/PublishedCharacterCards";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { loginUrl } from "@/lib/navigation";
import { useSearch } from "wouter";
import { Link } from "wouter";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { useCharacterPreview } from "@/hooks/useCharacterPreview";
import { CharacterCatalogueGrid } from "@/components/CharacterCatalogueGrid";
import { CharacterDetailDialog } from "@/components/CharacterDetailDialog";
import { DiscoveryFooter } from "@/components/DiscoveryFooter";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
export default function Community() {
  const { t } = useI18n();
  const selected = new URLSearchParams(useSearch()).get("character");
  const discovery = useDiscovery();
  const { user } = useAuth();
  const community = trpc.economy.community.useQuery(
    selected &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        selected
      )
      ? { selectedId: selected }
      : undefined
  );
  const preview = useCharacterPreview();
  if (discovery.error)
    return <PageError onRetry={() => void discovery.refetch()} />;
  if (!discovery.data)
    return (
      <p role="status" className="p-8">
        {t("auth:working")}
      </p>
    );
  const featured = discovery.data.characters.filter(
    role => role.listed && discovery.data!.home.featuredIds.includes(role.id)
  );
  return (
    <div className="studio-community">
      <section className="studio-community-hero">
        <Sparkles className="mb-5 size-9 text-pink-400" />
        <h1>{t("studio:communityTitle")}</h1>
        <p>{t("studio:communityIntro")}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="min-h-11 rounded-full">
            <Link href={user ? "/creator" : loginUrl("/creator")}>
              {t("economy:creator")}
            </Link>
          </Button>
          <Button asChild className="min-h-11 rounded-full">
            <Link href="/create">
              {t("explore:navCreate")}
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-full">
            <Link href="/help">
              <BookOpen />
              {t("studio:communityGuide")}
            </Link>
          </Button>
        </div>
      </section>
      <section className="space-y-4" aria-labelledby="community-published">
        <h2 id="community-published" className="text-xl font-semibold">
          {t("studio:community")}
        </h2>
        {selected &&
          community.data &&
          !community.data.some(row => row.id === selected) && (
            <p role="status">{t("economy:unavailableSelection")}</p>
          )}
        {community.error ? (
          <PageError onRetry={() => void community.refetch()} />
        ) : !community.data ? (
          <p role="status">{t("auth:working")}</p>
        ) : !community.data.length ? (
          <p className="text-sm text-muted-foreground">
            {t("economy:communityEmpty")}
          </p>
        ) : (
          <PublishedCharacterCards
            characters={community.data}
            selected={selected}
          />
        )}
      </section>
      <section aria-labelledby="community-characters">
        <div className="section-heading">
          <h2 id="community-characters">{t("studio:communityFeatured")}</h2>
          <Link href="/explore">{t("studio:browseAll")}</Link>
        </div>
        <CharacterCatalogueGrid
          characters={featured}
          onSelect={preview.showCharacter}
        />
      </section>
      <DiscoveryFooter />
      <CharacterDetailDialog
        selected={preview.selected}
        onClose={preview.closeCharacter}
        returnFocus={preview.returnFocus}
      />
    </div>
  );
}
