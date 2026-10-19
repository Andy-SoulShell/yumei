/** 可公开浏览的角色探索首页，提供精选、搜索、画风筛选和真实聊天入口。 */
import { useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowRight,
  Check,
  Compass,
  Heart,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  CHARACTER_PRESETS,
  getCharacterPreset,
  type CharacterPreset,
} from "@shared/characterPresets";
import { useI18n } from "@/lib/i18n";
import { presetMessages } from "@/locales/domain";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CharacterCard } from "@/components/CharacterCard";

/** 展示内置目录；开始聊天时按现有套餐规则创建个人角色并恢复会话。 */
export default function Explore() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const query = useSearch();
  const selectedId = new URLSearchParams(query).get("character");
  const selected = selectedId ? getCharacterPreset(selectedId) : undefined;
  const [search, setSearch] = useState("");
  const [style, setStyle] = useState<"all" | CharacterPreset["style"]>("all");
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const catalogue = useRef<HTMLElement>(null);
  const { pending, findPreset, open } = useCompanionChat();
  const hasFilters = search.trim().length > 0 || style !== "all";
  const reset = () => {
    setSearch("");
    setStyle("all");
    input.current?.focus();
  };
  const show = (id: string) => {
    returnFocus.current = document.activeElement as HTMLElement;
    navigate(`/?character=${encodeURIComponent(id)}`, { replace: true });
  };
  const results = CHARACTER_PRESETS.filter(preset => {
    if (style !== "all" && preset.style !== style) return false;
    const text = [
      preset.name,
      preset.label,
      preset.tagline,
      preset.interests,
      t(presetMessages[preset.id].label),
      t(presetMessages[preset.id].tagline),
      t(`explore:${preset.style}`),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return text.includes(search.trim().toLocaleLowerCase());
  });
  return (
    <div className="explore-page">
      {!hasFilters && (
        <>
          <section className="explore-hero" aria-labelledby="hero-heading">
            <div className="hero-art" aria-hidden="true">
              <img src="/characters/char_mature.jpg" alt="" />
              <img src="/characters/char_cute.jpg" alt="" />
              <img src="/characters/char_anime_cute.jpg" alt="" />
            </div>
            <div className="hero-shade" />
            <div className="hero-content">
              <span className="hero-eyebrow">
                <Sparkles size={14} />
                {t("explore:heroEyebrow")}
              </span>
              <h1 id="hero-heading">
                {t("explore:heroTitle")}
                <span>{t("explore:heroHighlight")}</span>
              </h1>
              <p>{t("explore:heroDescription")}</p>
              <div className="hero-actions">
                <Button
                  onClick={() => {
                    catalogue.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                    input.current?.focus({ preventScroll: true });
                  }}
                  className="hero-primary"
                >
                  {t("explore:heroAction")}
                  <ArrowRight />
                </Button>
                <Link href="/setup" className="hero-secondary">
                  {t("explore:heroSecondary")}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
            <span className="hero-footnote">
              <Heart size={12} />
              {t("explore:heroFootnote")}
            </span>
          </section>
          <section
            className="featured-section"
            aria-labelledby="featured-heading"
          >
            <div className="section-heading">
              <h2 id="featured-heading">
                {t("explore:featured")}
                <span className="section-kicker">
                  {t("explore:brandCaption")}
                </span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  catalogue.current?.scrollIntoView({ behavior: "smooth" })
                }
              >
                {t("explore:viewAll")}
                <ArrowRight size={14} />
              </Button>
            </div>
            <div className="featured-grid">
              {CHARACTER_PRESETS.map(preset => (
                <Button
                  key={preset.id}
                  variant="plain"
                  size="none"
                  className="featured-character"
                  onClick={() => show(preset.id)}
                  aria-label={t("explore:viewCharacter", { name: preset.name })}
                >
                  <span className="featured-avatar">
                    <img src={preset.imageUrl} alt="" loading="lazy" />
                    <span className="featured-spark">
                      <Sparkles size={10} />
                    </span>
                  </span>
                  <span className="featured-name">{preset.name}</span>
                  <span className="featured-label">
                    {t(presetMessages[preset.id].label)}
                  </span>
                </Button>
              ))}
            </div>
          </section>
        </>
      )}
      <section
        ref={catalogue}
        className="catalogue-section"
        aria-labelledby="catalogue-heading"
      >
        <div className="catalogue-intro">
          <div>
            <span className="section-eyebrow">
              <Compass size={14} />
              {t("explore:navExplore")}
            </span>
            <h2 id="catalogue-heading">{t("explore:title")}</h2>
            <p>{t("explore:subtitle")}</p>
          </div>
          <div className="explore-search">
            <Search size={18} aria-hidden="true" />
            <Input
              ref={input}
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label={t("explore:search")}
              placeholder={t("explore:search")}
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("home:clearSearch")}
                onClick={() => {
                  setSearch("");
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
              value={style}
              onValueChange={value => setStyle(value as typeof style)}
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
                  {t(`explore:${value}`)}
                </RadioGroupChoice>
              ))}
            </RadioGroup>
            {hasFilters && (
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
          {t("explore:results", { count: results.length })}
          <span className="catalogue-ai-note">{t("explore:aiNote")}</span>
        </div>
        {results.length ? (
          <div className="character-grid">
            {results.map((preset, index) => (
              <CharacterCard
                key={preset.id}
                name={preset.name}
                age={preset.age}
                image={preset.imageUrl}
                label={t(presetMessages[preset.id].label)}
                description={t(presetMessages[preset.id].tagline)}
                styleLabel={t(`explore:${preset.style}`)}
                onClick={() => show(preset.id)}
                priority={index < 2}
              />
            ))}
          </div>
        ) : (
          <div className="explore-empty">
            <Search size={32} />
            <h3>{t("explore:emptyTitle")}</h3>
            <p>{t("explore:emptyDescription")}</p>
            <Button variant="outline" onClick={reset}>
              {t("explore:resetFilters")}
            </Button>
          </div>
        )}
      </section>
      <footer className="explore-footer">
        <Sparkles size={15} />
        <span>{t("explore:disclosure")}</span>
        <span>YUMEI — {t("explore:brandCaption")}</span>
      </footer>
      <Dialog
        open={!!selected}
        onOpenChange={isOpen => {
          if (!isOpen && pending === null) navigate("/", { replace: true });
        }}
      >
        <DialogContent
          className="character-detail"
          onCloseAutoFocus={event => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
        >
          {selected && (
            <>
              <div className="detail-portrait">
                <img src={selected.imageUrl} alt={selected.name} />
                <span className="detail-style">
                  <Sparkles size={12} />
                  {t(`explore:${selected.style}`)} · AI
                </span>
              </div>
              <div className="detail-content">
                <span className="section-eyebrow">
                  {t(presetMessages[selected.id].label)}
                </span>
                <DialogHeader>
                  <DialogTitle>
                    {selected.name}
                    <span className="detail-age">
                      {t("explore:age", { age: selected.age })}
                    </span>
                  </DialogTitle>
                  <DialogDescription>
                    {t(presetMessages[selected.id].tagline)}
                  </DialogDescription>
                </DialogHeader>
                <div className="detail-traits">
                  <span>
                    <Heart size={15} />
                    {t("explore:detailMemory")}
                  </span>
                  <span>
                    <Sparkles size={15} />
                    {t("explore:detailPhotos")}
                  </span>
                </div>
                <p className="detail-disclosure">
                  {t("explore:detailDisclosure")}
                </p>
                <Button
                  className="detail-start"
                  disabled={pending !== null}
                  onClick={() => void open(selected)}
                >
                  {pending !== null ? (
                    <Loader2 className="animate-spin" />
                  ) : findPreset(selected) ? (
                    <Check />
                  ) : (
                    <Heart />
                  )}
                  {pending !== null
                    ? t("explore:opening")
                    : findPreset(selected)
                      ? t("explore:continueChat")
                      : t("explore:addChat")}
                  <ArrowRight />
                </Button>
                <Button variant="ghost" asChild>
                  <Link href={`/setup?preset=${selected.id}`}>
                    {t("explore:customizeCharacter")}
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
