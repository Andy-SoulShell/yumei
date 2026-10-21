/** 公开首页：产品轮播、精选陪伴、前二十个角色、常见问题与注册引导。 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronDown, Heart } from "lucide-react";
import type { StaticMessageKey } from "@shared/i18n";
import { CHARACTER_PRESETS } from "@shared/characterPresets";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { presetMessages } from "@/locales/domain";
import { useCharacterPreview } from "@/hooks/useCharacterPreview";
import {
  FEATURED_CHARACTERS,
  HOME_CHARACTER_LIMIT,
} from "@/features/discovery/catalogue";
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

const faqs: readonly {
  question: StaticMessageKey;
  answer: StaticMessageKey;
}[] = [
  { question: "landing:faq.what.question", answer: "landing:faq.what.answer" },
  { question: "landing:faq.free.question", answer: "landing:faq.free.answer" },
  {
    question: "landing:faq.memory.question",
    answer: "landing:faq.memory.answer",
  },
  {
    question: "landing:faq.create.question",
    answer: "landing:faq.create.answer",
  },
  {
    question: "landing:faq.devices.question",
    answer: "landing:faq.devices.answer",
  },
];

/** 游客默认入口；已登录用户通过相同 Logo 访问首页并继续探索。 */
export default function Landing() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const preview = useCharacterPreview();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <div className="explore-page landing-page">
      <LandingCarousel />
      {user && <HomeCompanions />}
      <section className="featured-section" aria-labelledby="featured-heading">
        <div className="section-heading">
          <h2 id="featured-heading">{t("explore:featured")}</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/explore">
              {t("explore:viewAll")}
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
        <div className="featured-grid">
          {FEATURED_CHARACTERS.map(preset => (
            <Button
              key={preset.id}
              variant="plain"
              size="none"
              className="featured-character"
              onClick={event =>
                preview.showCharacter(preset.id, event.currentTarget)
              }
              aria-label={t("explore:viewCharacter", { name: preset.name })}
            >
              <span className="featured-avatar">
                <img src={preset.imageUrl} alt="" loading="lazy" />
              </span>
              <span className="featured-name">{preset.name}</span>
              <span className="featured-label">
                {t(presetMessages[preset.id].label)}
              </span>
            </Button>
          ))}
        </div>
      </section>
      <section
        className="landing-catalogue"
        aria-labelledby="home-catalogue-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="home-catalogue-heading">{t("landing:allCharacters")}</h2>
          </div>
          <span className="landing-count">
            {t("explore:results", { count: CHARACTER_PRESETS.length })}
          </span>
        </div>
        <CharacterCatalogueGrid
          characters={CHARACTER_PRESETS.slice(0, HOME_CHARACTER_LIMIT)}
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
      <section className="landing-faq" aria-labelledby="faq-heading">
        <div className="landing-section-intro">
          <h2 id="faq-heading">{t("landing:faqTitle")}</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <Collapsible
              key={faq.question}
              open={openFaq === index}
              onOpenChange={open => setOpenFaq(open ? index : null)}
              className="faq-item"
            >
              <h3>
                <CollapsibleTrigger asChild>
                  <Button variant="plain" size="none" className="faq-question">
                    {t(faq.question)}
                    <ChevronDown size={18} />
                  </Button>
                </CollapsibleTrigger>
              </h3>
              <CollapsibleContent className="faq-answer">
                <p>{t(faq.answer)}</p>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </section>
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
