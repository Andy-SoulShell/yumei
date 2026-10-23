import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { formDraftEpoch } from "@/lib/formDrafts";
import { apiErrorMessage } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { loginUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
type Characters = inferRouterOutputs<AppRouter>["economy"]["community"];
export function PublishedCharacterCards({
  characters,
  selected,
}: {
  characters: Characters;
  selected?: string | null;
}) {
  const { user } = useAuth(),
    { t } = useI18n();
  const autoStart = new URLSearchParams(useSearch()).get("start") === "1";
  const startedIntent = useRef<string | null>(null);
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [, navigate] = useLocation();
  const [notice, setNotice] = useState("");
  const adopt = trpc.economy.adoptCharacter.useMutation();
  const resume = trpc.conversation.resume.useMutation();
  const openCharacter = useCallback(
    async (id: string) => {
      if (!user) {
        navigate(loginUrl(`/community?character=${id}&start=1`));
        return;
      }
      const started = owner.current,
        epoch = formDraftEpoch();
      const valid = () =>
        mounted.current &&
        owner.current === started &&
        epoch === formDraftEpoch();
      setNotice("");
      try {
        const role = await adopt.mutateAsync({ id });
        if (!valid()) return;
        const conversation = await resume.mutateAsync({
          girlfriendId: role.id,
        });
        if (!valid()) return;
        navigate(`/chat/${conversation.id}`);
      } catch (error) {
        if (valid()) {
          const message = apiErrorMessage(error as { message: string }, t);
          setNotice(message);
          toast.error(message);
        }
      }
    },
    [user, navigate, adopt, resume, t]
  );
  useEffect(() => {
    if (
      !autoStart ||
      !user ||
      !selected ||
      !characters.some(item => item.id === selected)
    )
      return;
    const intent = `${user.id}:${selected}`;
    if (startedIntent.current === intent) return;
    startedIntent.current = intent;
    window.history.replaceState(
      null,
      "",
      `/community?character=${encodeURIComponent(selected)}`
    );
    void openCharacter(selected);
  }, [autoStart, user, selected, characters, openCharacter]);
  return (
    <>
      {notice && <p role="alert">{notice}</p>}
      <div className="studio-community-cards">
        {[...characters]
          .sort((a, b) => Number(b.id === selected) - Number(a.id === selected))
          .map(role => (
            <article
              key={role.id}
              className={
                role.id === selected ? "ring-2 ring-pink-400" : undefined
              }
            >
              <img
                src={role.snapshot.imageUrl}
                alt={role.snapshot.name}
                loading="lazy"
              />
              <div className="content">
                <h3 className="text-lg font-semibold">{role.snapshot.name}</h3>
                <Link
                  href={`/u/${role.handle}`}
                  className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline"
                >
                  {t("economy:byCreator", { name: role.creator })}
                </Link>
                <p className="text-sm">{role.snapshot.summary}</p>
                <details>
                  <summary>{t("economy:scenario")}</summary>
                  <p className="mt-3 text-sm">{role.snapshot.scenario}</p>
                </details>
                <Button
                  disabled={adopt.isPending || resume.isPending}
                  onClick={() => void openCharacter(role.id)}
                >
                  {t("economy:chat")}
                </Button>
              </div>
            </article>
          ))}
      </div>
    </>
  );
}
