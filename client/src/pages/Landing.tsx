/** 公开首页：读取已发布的轮播、精选角色、目录配置和常见问题。 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronDown, Heart } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { PageError } from "@/components/PageError";
import { LandingCarousel } from "@/features/discovery/LandingCarousel";
import { HomeCompanions } from "@/features/home/HomeCompanions";
import { CatalogueDirectory } from "@/features/discovery/CatalogueDirectory";
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
  const { home } = discovery.data;
  return (
    <div className="explore-page landing-page">
      {user && <HomeCompanions />}
      <CatalogueDirectory />
      <div className="studio-secondary-banner">
        <LandingCarousel
          slides={home.slides}
          intervalMs={home.carouselIntervalMs}
        />
      </div>
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
    </div>
  );
}
