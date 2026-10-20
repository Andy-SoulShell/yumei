/** 首页产品轮播，支持暂停、键盘操作与触摸切换，遵循减少动画偏好。 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import type { StaticMessageKey } from "@shared/i18n";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

type Slide = {
  title: StaticMessageKey;
  highlight: StaticMessageKey;
  description: StaticMessageKey;
  action: StaticMessageKey;
  href: string;
  images: readonly string[];
};
const slides: readonly Slide[] = [
  {
    title: "explore:heroTitle",
    highlight: "explore:heroHighlight",
    description: "explore:heroDescription",
    action: "explore:heroAction",
    href: "/explore",
    images: [
      "/characters/char_mature.jpg",
      "/characters/char_cute.jpg",
      "/characters/char_anime_cute.jpg",
    ],
  },
  {
    title: "landing:createTitle",
    highlight: "landing:createHighlight",
    description: "landing:createDescription",
    action: "explore:heroSecondary",
    href: "/setup",
    images: [
      "/characters/linxi.jpg",
      "/characters/hikari.jpg",
      "/characters/shiyu.jpg",
    ],
  },
  {
    title: "landing:photosTitle",
    highlight: "landing:photosHighlight",
    description: "landing:photosDescription",
    action: "landing:photosAction",
    href: "/generate",
    images: [
      "/characters/zhixia.jpg",
      "/characters/kaede.jpg",
      "/characters/jiangyue.jpg",
    ],
  },
];

/** 自动轮播在鼠标悬停、焦点进入或用户主动暂停时停止。 */
export function LandingCarousel() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media?.matches ?? false);
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden")
        setIndex(value => (value + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, reducedMotion, index]);
  const move = (delta: number) =>
    setIndex(value => (value + delta + slides.length) % slides.length);
  const slide = slides[index];
  return (
    <section
      className="explore-hero landing-carousel"
      aria-label={t("landing:bannerLabel")}
      aria-roledescription={t("landing:carousel")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
      onPointerDown={event => {
        pointer.current = event.isPrimary ? event.clientX : null;
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
      onPointerUp={event => {
        if (
          pointer.current !== null &&
          Math.abs(event.clientX - pointer.current) > 45
        ) {
          move(event.clientX < pointer.current ? 1 : -1);
        }
        pointer.current = null;
      }}
    >
      <div className="hero-art" aria-hidden="true">
        {slide.images.map(src => (
          <img key={src} src={src} alt="" draggable={false} />
        ))}
      </div>
      <div className="hero-shade" />
      <div className="hero-content">
        <span className="hero-eyebrow">
          <Sparkles size={14} />
          {t("explore:heroEyebrow")}
        </span>
        <div
          aria-live={focused || paused ? "polite" : "off"}
          aria-atomic="true"
        >
          <h1>
            {t(slide.title)}
            <span>{t(slide.highlight)}</span>
          </h1>
          <p>{t(slide.description)}</p>
        </div>
        <div className="hero-actions">
          <Button asChild className="hero-primary">
            <Link href={slide.href}>
              {t(slide.action)}
              <ArrowRight />
            </Link>
          </Button>
          <Link
            href={index === 0 ? "/setup" : "/explore"}
            className="hero-secondary"
          >
            {t(index === 0 ? "explore:heroSecondary" : "explore:viewAll")}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
      <div className="carousel-controls">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => move(-1)}
          aria-label={t("landing:previousSlide")}
        >
          <ChevronLeft />
        </Button>
        <div className="carousel-dots">
          {slides.map((_, number) => (
            <Button
              key={number}
              variant="plain"
              size="none"
              aria-label={t("landing:goToSlide", { count: number + 1 })}
              aria-pressed={index === number}
              onClick={() => setIndex(number)}
            >
              <span />
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => move(1)}
          aria-label={t("landing:nextSlide")}
        >
          <ChevronRight />
        </Button>
        {!reducedMotion && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPaused(value => !value)}
            aria-label={t(
              paused ? "landing:playSlides" : "landing:pauseSlides"
            )}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
        )}
      </div>
    </section>
  );
}
