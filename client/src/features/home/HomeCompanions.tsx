/** 登录首页的角色捷径，展示顺序由服务端按实际聊天时间确定。 */
import { Link } from "wouter";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export function HomeCompanions() {
  const { t } = useI18n();
  const chat = useCompanionChat();
  const {
    data: roles,
    isLoading,
    error,
    refetch,
  } = trpc.girlfriend.recent.useQuery();
  if (isLoading) return null;
  if (error && !roles)
    return (
      <div className="home-companions-notice" role="alert">
        <span>{t("auth:networkErrorPleaseTryAgain")}</span>
        <Button variant="ghost" onClick={() => void refetch()}>
          {t("explore:retry")}
        </Button>
      </div>
    );
  if (!roles?.length)
    return (
      <Link href="/explore" className="home-companions-add">
        <Plus size={18} aria-hidden="true" />
        {t("home:chooseOrCreateACompanion")}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    );
  return (
    <section
      className="featured-section home-companions-section"
      aria-labelledby="home-companions-heading"
    >
      <div className="section-heading">
        <h2 id="home-companions-heading">{t("explore:navCharacters")}</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/characters">
            {t("explore:viewAll")}
            <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
      <div className="featured-grid home-companions-grid">
        {roles.map(role => (
          <Button
            key={role.id}
            variant="plain"
            size="none"
            className="featured-character"
            aria-label={t("landing:continueWithCharacter", { name: role.name })}
            aria-busy={chat.pending === role.id}
            disabled={chat.pending !== null}
            onClick={() => void chat.open(role.id)}
          >
            <Avatar className="featured-avatar" aria-hidden="true">
              <AvatarImage
                src={role.avatarUrl || role.referenceImageUrl}
                alt=""
              />
              <AvatarFallback>{Array.from(role.name)[0]}</AvatarFallback>
              {chat.pending === role.id && (
                <span className="home-companion-pending" aria-hidden="true">
                  <Loader2 className="size-5 animate-spin" />
                </span>
              )}
            </Avatar>
            <span className="featured-name" title={role.name}>
              {role.name}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
