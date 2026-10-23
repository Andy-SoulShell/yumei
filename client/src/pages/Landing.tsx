/** 公开首页：读取已发布的轮播、精选角色、目录配置和常见问题。 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronDown, Heart } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useCharacterPreview } from "@/hooks/useCharacterPreview";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { PageError } from "@/components/PageError";
import { LandingCarousel } from "@/features/discovery/LandingCarousel";
import { HomeCompanions } from "@/features/home/HomeCompanions";
import { CharacterCatalogueGrid } from "@/components/CharacterCatalogueGrid";
import { CharacterDetailDialog } from "@/components/CharacterDetailDialog";
import { DiscoveryFooter } from "@/components/DiscoveryFooter";
import { SignInButton } from "@/components/SignInButton";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** 游客默认入口；已登录用户通过相同 Logo 访问首页并继续探索。 */
export default function Landing() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const preview = useCharacterPreview();
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const discovery = useDiscovery();
  if (discovery.isLoading)
    return (
      <div role="status" className="p-8 text-center">
        {t("auth:working")}
      </div>
    );
  if (discovery.error || !discovery.data)
    return <PageError onRetry={() => void discovery.refetch()} />;
  const { characters, home } = discovery.data;
  const listed = characters.filter(item => item.listed);
  const featured = home.featuredIds
    .flatMap(id => {
      const item = characters.find(role => role.id === id);
      return item ? [item] : [];
    })
    .slice(0, 4);
  const featuredIds = new Set(featured.map(item => item.id));
  const catalogue = listed
    .filter(item => !featuredIds.has(item.id))
    .slice(0, home.homeCharacterLimit);
  return (
    <div className="explore-page landing-page">
      <LandingCarousel
        slides={home.slides}
        intervalMs={home.carouselIntervalMs}
      />
      {user && <HomeCompanions />}
      {featured.length > 0 && (
        <section
          className="featured-section"
          aria-labelledby="featured-heading"
        >
          <div className="section-heading">
            <h2 id="featured-heading">{t("explore:featured")}</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/explore">
                {t("explore:viewAll")}
                <ArrowRight size={14} />
              </Link>
            </Button>
          </div>
          <p className="landing-selection-hint">{t("landing:selectionHint")}</p>
          <CharacterCatalogueGrid
            characters={featured}
            onSelect={preview.showCharacter}
            priorityCount={2}
          />
        </section>
      )}
      {catalogue.length > 0 && (
        <section
          className="landing-catalogue"
          aria-labelledby="home-catalogue-heading"
        >
          <div className="section-heading">
            <div>
              <h2 id="home-catalogue-heading">{t("landing:moreCharacters")}</h2>
            </div>
            <span className="landing-count">
              {t("explore:results", { count: catalogue.length })}
            </span>
          </div>
          <CharacterCatalogueGrid
            characters={catalogue}
            onSelect={preview.showCharacter}
          />
          <div className="catalogue-more">
            <Button asChild variant="outline" size="lg">
              <Link href="/explore">
                {t("landing:exploreAll")}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      )}
      {home.faqs.length > 0 && (
        <section className="landing-faq" aria-labelledby="faq-heading">
          <div className="landing-section-intro">
            <h2 id="faq-heading">{t("landing:faqTitle")}</h2>
          </div>
          <div className="faq-list">
            {home.faqs.map(faq => (
              <Collapsible
                key={faq.id}
                open={openFaq === faq.id}
                onOpenChange={open => setOpenFaq(open ? faq.id : null)}
                className="faq-item"
              >
                <h3>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="plain"
                      size="none"
                      className="faq-question"
                    >
                      {faq.question}
                      <ChevronDown size={18} />
                    </Button>
                  </CollapsibleTrigger>
                </h3>
                <CollapsibleContent className="faq-answer">
                  <p>{faq.answer}</p>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </section>
      )}
      <section className="landing-signup" aria-labelledby="signup-heading">
        <div className="signup-symbol">
          <Heart size={25} />
        </div>
        <h2 id="signup-heading">
          {t(user ? "landing:welcomeBackTitle" : "landing:signupTitle")}
        </h2>
        {user ? (
          <Button asChild size="lg">
            <Link href="/explore">
              {t("explore:heroAction")}
              <ArrowRight />
            </Link>
          </Button>
        ) : (
          <SignInButton
            returnTo="/explore"
            initialMode="register"
            label={t("landing:signupAction")}
            className="landing-signup-button"
            disabled={loading}
          />
        )}
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
