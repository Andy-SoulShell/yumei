/** 首页与探索共用完整目录，条件写入 URL，打开详情或刷新后可继续浏览。 */
import { useRef } from "react";
import { Heart, Search, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useExploreController } from "./useExploreController";
import { useCharacterPreview } from "@/hooks/useCharacterPreview";
import { CharacterCatalogueGrid } from "@/components/CharacterCatalogueGrid";
import { CharacterDetailDialog } from "@/components/CharacterDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageError } from "@/components/PageError";
import {
  AGE_FILTERS,
  CATALOGUE_SORTS,
  CATALOGUE_TAGS,
} from "./catalogueFilters";

export function CatalogueDirectory() {
  const { t } = useI18n();
  const state = useExploreController();
  const preview = useCharacterPreview();
  const input = useRef<HTMLInputElement>(null);
  const reset = () => {
    state.reset();
    input.current?.focus();
  };
  if (state.isLoading)
    return (
      <div role="status" className="studio-catalogue-loading">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} />
        ))}
        <span className="sr-only">{t("auth:working")}</span>
      </div>
    );
  if (state.error) return <PageError onRetry={() => void state.refetch()} />;
  return (
    <section
      className="catalogue-section studio-directory"
      aria-labelledby="catalogue-heading"
    >
      <h1 id="catalogue-heading" className="sr-only">
        {t("explore:title")}
      </h1>
      <div className="studio-discovery-toolbar">
        <label className="studio-select studio-sort">
          <SlidersHorizontal size={16} />
          <span className="sr-only">{t("studio:sortLabel")}</span>
          <select
            value={state.sort}
            onChange={e => state.setSort(e.target.value)}
          >
            {CATALOGUE_SORTS.map(value => (
              <option key={value} value={value}>
                {t(`studio:sort_${value}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="explore-search">
          <Search size={18} aria-hidden="true" />
          <Input
            ref={input}
            type="search"
            value={state.search}
            onChange={e => state.setSearch(e.target.value)}
            aria-label={t("explore:search")}
            placeholder={t("studio:searchPlaceholder")}
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
        <div className="studio-compact-filters">
          <label className="studio-select">
            <span className="sr-only">{t("characters:characterStyle")}</span>
            <select
              value={state.style}
              onChange={e => state.setStyle(e.target.value)}
            >
              {["all", "realistic", "anime"].map(value => (
                <option key={value} value={value}>
                  {t(
                    value === "all"
                      ? "studio:anyStyle"
                      : value === "anime"
                        ? "explore:anime"
                        : "explore:realistic"
                  )}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-select">
            <span className="sr-only">{t("studio:ageLabel")}</span>
            <select
              value={state.age}
              onChange={e => state.setAge(e.target.value)}
            >
              {AGE_FILTERS.map(value => (
                <option key={value} value={value}>
                  {value === "all"
                    ? t("studio:anyAge")
                    : t("studio:ageRange", { range: value })}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="ghost"
            className={`studio-saved-filter ${state.savedOnly ? "is-selected" : ""}`}
            aria-pressed={state.savedOnly}
            onClick={() => state.setSavedOnly(!state.savedOnly)}
          >
            <Heart size={17} fill={state.savedOnly ? "currentColor" : "none"} />
            <span>{t("studio:myFavorites")}</span>
          </Button>
        </div>
      </div>
      <div
        className="studio-category-bar"
        role="group"
        aria-label={t("studio:tagsLabel")}
      >
        {CATALOGUE_TAGS.map(tag => (
          <Button
            key={tag}
            variant="ghost"
            className="studio-category"
            aria-pressed={state.tag === tag}
            onClick={() => state.setTag(tag)}
          >
            {t(`studio:tag_${tag}`)}
          </Button>
        ))}
      </div>
      <div className="studio-results-row">
        <p role="status">
          {t("explore:results", { count: state.results.length })}
        </p>
        {state.hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="filter-reset"
            onClick={reset}
          >
            <X size={14} />
            {t("studio:clearFilters")}
          </Button>
        )}
      </div>
      {state.collection.error && (
        <div role="alert" className="studio-inline-notice">
          <span>{t("studio:favoritesError")}</span>
          <Button variant="outline" onClick={state.collection.retry}>
            {t("explore:retry")}
          </Button>
        </div>
      )}
      {state.savedOnly && state.collection.loading ? (
        <p role="status">{t("auth:working")}</p>
      ) : state.results.length ? (
        <CharacterCatalogueGrid
          characters={state.visible}
          onSelect={preview.showCharacter}
          priorityCount={4}
        />
      ) : (
        <div className="explore-empty">
          <Search size={32} />
          <h2>
            {t(state.savedOnly ? "studio:noFavorites" : "explore:emptyTitle")}
          </h2>
          <p>
            {t(
              state.savedOnly
                ? "studio:noFavoritesHint"
                : "explore:emptyDescription"
            )}
          </p>
          <Button variant="outline" onClick={reset}>
            {t("studio:clearFilters")}
          </Button>
        </div>
      )}
      {state.hasMore && (
        <div className="catalogue-more">
          <Button variant="outline" onClick={state.loadMore}>
            {t("common:loadMore")}
          </Button>
        </div>
      )}
      <CharacterDetailDialog
        selected={preview.selected}
        onClose={preview.closeCharacter}
        returnFocus={preview.returnFocus}
      />
    </section>
  );
}
