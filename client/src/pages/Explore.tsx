/** 可公开访问的角色搜索页，提供画风筛选、分页目录和角色详情。 */
import { useRef } from "react";
import { Link } from "wouter";
import { Compass, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useExploreController } from "@/features/discovery/useExploreController";
import { useCharacterPreview } from "@/hooks/useCharacterPreview";
import { CharacterCatalogueGrid } from "@/components/CharacterCatalogueGrid";
import { CharacterDetailDialog } from "@/components/CharacterDetailDialog";
import { DiscoveryFooter } from "@/components/DiscoveryFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";

/** 首屏直接展示搜索和目录，首页的产品介绍在独立路由展示。 */
export default function Explore() {
  const { t } = useI18n();
  const state = useExploreController();
  const preview = useCharacterPreview();
  const input = useRef<HTMLInputElement>(null);
  const reset = () => {
    state.reset();
    input.current?.focus();
  };
  return (
    <div className="explore-page explore-directory">
      <section
        className="catalogue-section"
        aria-labelledby="catalogue-heading"
      >
        <div className="catalogue-intro">
          <div>
            <span className="section-eyebrow">
              <Compass size={14} />
              {t("explore:navExplore")}
            </span>
            <h1 id="catalogue-heading">{t("explore:title")}</h1>
            <p>{t("explore:subtitle")}</p>
          </div>
          <div className="explore-search">
            <Search size={18} aria-hidden="true" />
            <Input
              ref={input}
              type="search"
              value={state.search}
              onChange={event => state.setSearch(event.target.value)}
              aria-label={t("explore:search")}
              placeholder={t("explore:search")}
            />
            {state.search && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("home:clearSearch")}
                onClick={() => {
                  state.setSearch("");
                  input.current?.focus();
                }}
              >
                <X />
              </Button>
            )}
          </div>
        </div>
        <div className="explore-filter-bar">
          <div className="explore-filter-options">
            <SlidersHorizontal
              size={16}
              className="filter-icon"
              aria-hidden="true"
            />
            <RadioGroup
              value={state.style}
              onValueChange={state.setStyle}
              className="explore-filters"
              orientation="horizontal"
              aria-label={t("characters:characterStyle")}
            >
              {(["all", "realistic", "anime"] as const).map(value => (
                <RadioGroupChoice
                  variant="segment"
                  key={value}
                  value={value}
                  className="explore-filter"
                >
                  {value === "all" && <Sparkles size={14} />}
                  {t(
                    value === "all"
                      ? "explore:all"
                      : value === "anime"
                        ? "explore:anime"
                        : "explore:realistic"
                  )}
                </RadioGroupChoice>
              ))}
            </RadioGroup>
            {state.hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="filter-reset"
                onClick={reset}
              >
                <X size={13} />
                {t("explore:resetFilters")}
              </Button>
            )}
          </div>
          <Link href="/setup" className="catalogue-create">
            <span>＋</span>
            {t("explore:navCreate")}
          </Link>
        </div>
        <div className="catalogue-count" role="status">
          <span />
          {t("explore:results", { count: state.results.length })}
          <span className="catalogue-ai-note">{t("explore:aiNote")}</span>
        </div>
        {state.results.length ? (
          <>
            <CharacterCatalogueGrid
              characters={state.visible}
              onSelect={preview.showCharacter}
              priorityCount={5}
            />
            {state.hasMore && (
              <div className="catalogue-more">
                <Button variant="outline" onClick={state.loadMore}>
                  {t("explore:loadMore")}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="explore-empty">
            <Search size={32} />
            <h2>{t("explore:emptyTitle")}</h2>
            <p>{t("explore:emptyDescription")}</p>
            <Button variant="outline" onClick={reset}>
              {t("explore:resetFilters")}
            </Button>
          </div>
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
