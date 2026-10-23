/** 已发布角色的沉浸式发现流；收藏、聊天和混合创作均复用真实业务入口。 */
import { useRef } from "react";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowUp,
  Heart,
  MessageCircle,
  WandSparkles,
} from "lucide-react";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { useCharacterCollection } from "@/features/discovery/CharacterCollection";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { PageError } from "@/components/PageError";
export default function Feed() {
  const { t } = useI18n();
  const discovery = useDiscovery();
  const chat = useCompanionChat();
  const collection = useCharacterCollection();
  const root = useRef<HTMLDivElement>(null);
  if (discovery.error)
    return <PageError onRetry={() => void discovery.refetch()} />;
  if (!discovery.data)
    return (
      <p role="status" className="p-8">
        {t("auth:working")}
      </p>
    );
  const move = (delta: number) => {
    const el = root.current;
    if (!el) return;
    const cards = Array.from(
      el.querySelectorAll<HTMLElement>(".studio-feed-card")
    );
    const active = Math.max(
      0,
      cards.findIndex(
        card =>
          card.offsetTop + card.offsetHeight >
          el.scrollTop + el.clientHeight / 2
      )
    );
    const next = cards[Math.min(cards.length - 1, Math.max(0, active + delta))];
    if (next)
      el.scrollTo({
        top: next.offsetTop - el.offsetTop,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  return (
    <div
      ref={root}
      className="studio-feed"
      role="region"
      aria-label={t("studio:feedIntro")}
      tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          move(event.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      {discovery.data.characters
        .filter(role => role.listed)
        .map(role => (
          <article className="studio-feed-card" key={role.id}>
            <img src={role.imageUrl} alt={role.name} loading="lazy" />
            <div className="studio-feed-caption">
              <p className="!mb-2 text-xs">
                AI · {t("explore:age", { age: role.age })}
              </p>
              <h2>{role.name}</h2>
              <p>{role.tagline}</p>
              <div className="studio-choice-row">
                <Button
                  variant="plain"
                  disabled={chat.pending !== null}
                  onClick={() => void chat.open(role)}
                >
                  <MessageCircle />
                  {t("explore:addChat")}
                </Button>
                <Button variant="plain" asChild>
                  <Link href={"/create?preset=" + role.id}>
                    <WandSparkles />
                    {t("studio:remix")}
                  </Link>
                </Button>
                <Button
                  variant="plain"
                  aria-label={t(
                    collection.ids.includes(role.id)
                      ? "studio:removeFavorite"
                      : "studio:addFavorite",
                    { name: role.name }
                  )}
                  aria-pressed={collection.ids.includes(role.id)}
                  disabled={collection.busy !== null || collection.loading}
                  onClick={() => collection.toggle(role.id)}
                >
                  <Heart
                    fill={
                      collection.ids.includes(role.id) ? "currentColor" : "none"
                    }
                  />
                </Button>
              </div>
            </div>
          </article>
        ))}
      <div className="studio-feed-controls">
        <Button
          variant="secondary"
          size="icon"
          aria-label={t("studio:previous")}
          onClick={() => move(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={t("studio:next")}
          onClick={() => move(1)}
        >
          <ArrowDown />
        </Button>
      </div>
    </div>
  );
}
