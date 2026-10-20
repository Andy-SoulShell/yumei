import { memoryMessages } from "@/locales/domain";
/** 指定角色的长期记忆列表与用户管理入口。 */

import { useI18n } from "@/lib/i18n";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { memoryCapacity, type MemoryCategory } from "../../../shared/memory";
import {
  ArrowLeft,
  BookHeart,
  Loader2,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { useParams } from "wouter";
import { toast } from "sonner";

/** 读取角色记忆，并提供置顶、取消置顶和删除操作。 */
export default function Memories() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const girlfriendId = Number(params.id);

  const { isAuthenticated, loading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });

  const { open: openChat, pending } = useCompanionChat();
  const utils = trpc.useUtils();
  const { data: girlfriends } = trpc.girlfriend.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const girlfriend = girlfriends?.find(g => g.id === girlfriendId);

  const { data: memories, isLoading } = trpc.memory.list.useQuery(
    { girlfriendId },
    { enabled: isAuthenticated && Number.isFinite(girlfriendId) }
  );

  const deleteMemory = trpc.memory.delete.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate({ girlfriendId });
      toast.success(t("memories:memoryDeleted"));
    },
    onError: e => toast.error(t("common:couldNotDelete", { error: e.message })),
  });

  const setPinned = trpc.memory.setPinned.useMutation({
    onSuccess: () => utils.memory.list.invalidate({ girlfriendId }),
    onError: e => toast.error(t("memories:actionFailed", { error: e.message })),
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const categories = Object.keys(memoryMessages) as MemoryCategory[];
  const grouped = categories
    .map(category => ({
      category,
      items: (memories ?? []).filter(m => m.category === category),
    }))
    .filter(g => g.items.length > 0);

  const capacity = memoryCapacity(girlfriend?.intimacyLevel || 1);

  return (
    <div className="min-h-full bg-background">
      <header className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b bg-card sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => history.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <BookHeart className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm sm:text-base truncate">
            {girlfriend
              ? t("memories:whatRemembersAboutYou", { name: girlfriend.name })
              : t("common:memoriesAboutYou")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("memories:capacity", { count: memories?.length ?? 0, capacity })}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-3 sm:p-4 space-y-6 pb-10">
        {!memories || memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookHeart className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {t("memories:noMemoriesYet")}
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">
              {t(
                "memories:shareYourWorkInterestsAndRecentExperiencesImportant"
              )}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              disabled={pending !== null}
              onClick={() => void openChat(girlfriendId)}
            >
              {t("common:openChat")}
            </Button>
          </div>
        ) : (
          grouped.map(group => (
            <section key={group.category}>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {t(memoryMessages[group.category])}
                <span className="ml-2 opacity-60">{group.items.length}</span>
              </h2>
              <div className="space-y-2">
                {group.items.map(memory => (
                  <Card key={memory.id} className="py-0">
                    <CardContent className="flex items-start gap-2 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed break-words">
                          {memory.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {memory.pinned && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {t("memories:pinned")}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(memory.createdAt).toLocaleDateString(
                              locale
                            )}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 shrink-0 text-muted-foreground hover:text-primary"
                        title={
                          memory.pinned
                            ? t("memories:unpin")
                            : t("memories:pinToKeepThisMemory")
                        }
                        onClick={() =>
                          setPinned.mutate({
                            id: memory.id,
                            pinned: !memory.pinned,
                          })
                        }
                      >
                        {memory.pinned ? (
                          <PinOff className="w-4 h-4" />
                        ) : (
                          <Pin className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 shrink-0 text-muted-foreground hover:text-destructive"
                        title={t("memories:deleteMemory")}
                        onClick={() => deleteMemory.mutate({ id: memory.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
