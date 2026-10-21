/** 首页产品轮播，支持暂停、键盘操作与触摸切换，遵循减少动画偏好。 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import type { localizeDiscovery } from "@shared/discovery";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** 自动轮播在鼠标悬停、焦点进入或用户主动暂停时停止。 */
export function LandingCarousel({
  slides,
  intervalMs,
  preview = false,
}: {
  slides: ReturnType<typeof localizeDiscovery>["home"]["slides"];
  intervalMs: number;
  preview?: boolean;
}) {
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
    if (paused || hovered || focused || reducedMotion || slides.length < 2)
      return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden")
        setIndex(value => (value + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    paused,
    hovered,
    focused,
    reducedMotion,
    index,
    slides.length,
    intervalMs,
  ]);
  const move = (delta: number) =>
    setIndex(value =>
      slides.length ? (value + delta + slides.length) % slides.length : 0
    );
  const activeIndex = slides.length ? index % slides.length : 0;
  const slide = slides[activeIndex];
  if (!slide) return null;
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
      <div
        className="hero-art"
        data-image-count={slide.images.length}
        aria-hidden="true"
      >
        {slide.images.map(src => (
          <img key={src} src={src} alt="" draggable={false} />
        ))}
      </div>
      <div className="hero-shade" />
      <div className="hero-content">
        <div
          aria-live={focused || paused ? "polite" : "off"}
          aria-atomic="true"
        >
          <h1>
            {slide.title}
            <span>{slide.highlight}</span>
          </h1>
        </div>
        <div className="hero-actions">
          {preview ? (
            <Button className="hero-primary" disabled>
              {slide.action}
              <ArrowRight />
            </Button>
          ) : (
            <Button asChild className="hero-primary">
              <Link href={slide.href}>
                {slide.action}
                <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
      {slides.length > 1 && (
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
                key={slides[number].id}
                variant="plain"
                size="none"
                aria-label={t("landing:goToSlide", { count: number + 1 })}
                aria-pressed={activeIndex === number}
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
      )}
    </section>
  );
}
