import { DeleteConfirmation } from "@/components/DeleteConfirmation";
import { usePageBack } from "@/hooks/usePageBack";
import { PageError } from "@/components/PageError";
import { contentText } from "@shared/discovery";
/** 指定角色的长期记忆列表与用户管理入口。 */

import { useI18n } from "@/lib/i18n";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TimeZonePicker } from "@/components/TimeZonePicker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  BookHeart,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

/** 读取角色记忆，并提供置顶、取消置顶和删除操作。 */
export default function Memories() {
  const goBack = usePageBack("/characters");
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const girlfriendId = Number(params.id);
  const validId = Number.isInteger(girlfriendId) && girlfriendId > 0;
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState<{
    id: number;
    content: string;
  } | null>(null);
  const [editInvalid, setEditInvalid] = useState(false);
  const [timeZoneDraft, setTimeZoneDraft] = useState<string | null>(null);
  const [timeZoneInvalid, setTimeZoneInvalid] = useState(false);

  const { isAuthenticated, loading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });

  const { open: openChat, pending } = useCompanionChat();
  const utils = trpc.useUtils();
  const {
    data: girlfriends,
    isLoading: rolesLoading,
    error: rolesError,
    refetch: retryRoles,
  } = trpc.girlfriend.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const girlfriend = girlfriends?.find(g => g.id === girlfriendId);

  const {
    data: memories,
    isLoading,
    error,
    refetch,
  } = trpc.memory.list.useQuery(
    { girlfriendId },
    // 后台提取可能在进入页面后才完成，定期刷新以展示新记忆。
    { enabled: isAuthenticated && validId, refetchInterval: 5_000 }
  );
  const {
    data: memoryState,
    isLoading: stateLoading,
    error: stateError,
    refetch: retryState,
  } = trpc.memory.state.useQuery(
    { girlfriendId },
    { enabled: isAuthenticated && validId, refetchInterval: 5_000 }
  );
  const refreshMemory = async () => {
    await Promise.all([
      utils.memory.list.invalidate({ girlfriendId }),
      utils.memory.state.invalidate({ girlfriendId }),
    ]);
  };

  const deleteMemory = trpc.memory.delete.useMutation({
    onSuccess: async () => {
      await refreshMemory();
      toast.success(t("memories:memoryDeleted"));
    },
    onError: e =>
      toast.error(t("common:couldNotDelete", { error: apiErrorMessage(e, t) })),
  });

  const setPinned = trpc.memory.setPinned.useMutation({
    onSuccess: () => utils.memory.list.invalidate({ girlfriendId }),
    onError: e =>
      toast.error(t("memories:actionFailed", { error: apiErrorMessage(e, t) })),
  });

  const setEnabled = trpc.memory.setEnabled.useMutation({
    onSuccess: async (_data, variables) => {
      await refreshMemory();
      toast.success(
        t(
          variables.enabled ? "memories:memoryResumed" : "memories:memoryPaused"
        )
      );
    },
    onError: e =>
      toast.error(t("memories:actionFailed", { error: apiErrorMessage(e, t) })),
  });
  const editMemory = trpc.memory.edit.useMutation({
    onSuccess: async () => {
      await refreshMemory();
      setEditing(null);
      setEditInvalid(false);
      toast.success(t("memories:memoryUpdated"));
    },
    onError: e =>
      toast.error(t("memories:actionFailed", { error: apiErrorMessage(e, t) })),
  });
  const clearMemories = trpc.memory.clear.useMutation({
    onSuccess: async () => {
      await refreshMemory();
      setEditing(null);
      toast.success(t("memories:memoriesCleared"));
    },
    onError: e =>
      toast.error(t("memories:actionFailed", { error: apiErrorMessage(e, t) })),
  });
  const setTimeZone = trpc.memory.setTimeZone.useMutation({
    onSuccess: async () => {
      await utils.memory.state.invalidate();
      setTimeZoneDraft(null);
      setTimeZoneInvalid(false);
      toast.success(t("memories:timeZoneSaved"));
    },
    onError: e =>
      toast.error(t("memories:actionFailed", { error: apiErrorMessage(e, t) })),
  });
  const busy =
    deleteMemory.isPending ||
    setPinned.isPending ||
    setEnabled.isPending ||
    editMemory.isPending ||
    clearMemories.isPending ||
    setTimeZone.isPending;
  const timeZoneValue = timeZoneDraft ?? memoryState?.timeZone ?? "UTC";

  const saveTimeZone = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    try {
      const canonical = new Intl.DateTimeFormat("en", {
        timeZone: timeZoneValue.trim(),
      }).resolvedOptions().timeZone;
      if (
        !canonical ||
        /^[+-]/.test(canonical) ||
        timeZoneValue.trim().length > 64
      )
        throw new Error("Invalid time zone");
      setTimeZoneInvalid(false);
      setTimeZone.mutate({ timeZone: canonical });
    } catch {
      setTimeZoneInvalid(true);
      document.getElementById("memory-timezone")?.focus();
    }
  };

  const sourceDate = (value: Date | string | null, timeZone: string) => {
    if (!value) return null;
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone,
      }).format(new Date(value));
    } catch {
      return null;
    }
  };

  if (authLoading || isLoading || rolesLoading || stateLoading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!validId || (!rolesError && !girlfriend))
    return (
      <PageError
        title={t("common:contentUnavailable")}
        actionLabel={t("explore:navCharacters")}
        onRetry={() => navigate("/characters")}
      />
    );
  if (error || rolesError || stateError)
    return (
      <PageError
        onRetry={() => {
          void refetch();
          void retryRoles();
          void retryState();
        }}
      />
    );

  const categories = memoryState!.rules.categories.map(category => category.id);
  const grouped = categories
    .map(category => ({
      category,
      items: (memories ?? []).filter(m => m.category === category),
    }))
    .filter(g => g.items.length > 0);

  const capacity = memoryState!.capacity;

  return (
    <div className="memories-page min-h-full bg-background">
      <header className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 page-toolbar sticky top-0 z-10">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("setup:back")}
          onClick={goBack}
        >
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

      <div className="max-w-2xl mx-auto p-3 sm:p-4 space-y-6 pb-10">
        <section
          className="surface-card space-y-4 rounded-xl border p-4"
          aria-labelledby="memory-controls-title"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                id="memory-controls-title"
                htmlFor="memory-enabled"
                className="text-base font-semibold"
              >
                {t("memories:memoryControl")}
              </Label>
              <p
                id="memory-enabled-help"
                className="text-sm text-muted-foreground"
              >
                {t(
                  memoryState?.enabled
                    ? "memories:memoryEnabledHelp"
                    : "memories:memoryPausedHelp"
                )}
              </p>
            </div>
            <Switch
              id="memory-enabled"
              checked={memoryState?.enabled ?? false}
              disabled={busy || !memoryState || !memoryState.rules.enabled}
              aria-describedby="memory-enabled-help"
              onCheckedChange={enabled =>
                setEnabled.mutate({ girlfriendId, enabled })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              memoryState?.semantic.supported && memoryState.semantic.configured
                ? "memories:recallMeaning"
                : "memories:recallWords"
            )}
          </p>
          <form onSubmit={saveTimeZone} className="space-y-2">
            <Label htmlFor="memory-timezone">{t("memories:timeZone")}</Label>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-0 flex-1 basis-48">
                <TimeZonePicker
                  id="memory-timezone"
                  value={timeZoneValue}
                  disabled={busy}
                  invalid={timeZoneInvalid}
                  describedBy={
                    timeZoneInvalid
                      ? "memory-timezone-help memory-timezone-error"
                      : "memory-timezone-help"
                  }
                  onChange={zone => {
                    setTimeZoneDraft(zone);
                    setTimeZoneInvalid(false);
                  }}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={
                  busy || timeZoneValue.trim() === memoryState?.timeZone
                }
              >
                {t("memories:saveTimeZone")}
              </Button>
            </div>
            <p
              id="memory-timezone-help"
              className="text-xs text-muted-foreground"
            >
              {t("memories:timeZoneHelp")}
            </p>
            {timeZoneInvalid && (
              <p
                id="memory-timezone-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {t("memories:timeZoneInvalid")}
              </p>
            )}
          </form>
        </section>

        <section
          className="surface-card space-y-3 rounded-xl border p-4"
          aria-labelledby="memory-summary-title"
        >
          <h2 id="memory-summary-title" className="font-semibold">
            {t("memories:conversationSummary")}
          </h2>
          {memoryState?.summary ? (
            <>
              {memoryState.summary.facts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {t("memories:rememberedFacts")}
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                    {memoryState.summary.facts.map((fact, index) => (
                      <li
                        key={`${index}-${fact}`}
                        className="whitespace-pre-wrap break-words"
                      >
                        {fact}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {memoryState.summary.topics.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {t("memories:recentTopics")}
                  </h3>
                  <ul className="space-y-2">
                    {memoryState.summary.topics.map((topic, index) => (
                      <li
                        key={`${topic.sourceMessageId}-${index}`}
                        className="rounded-lg bg-muted/50 p-3 text-sm"
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {topic.quote}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(
                            topic.speaker === "user"
                              ? "memories:topicFromYou"
                              : "memories:topicFromCompanion",
                            { id: topic.sourceMessageId }
                          )}{" "}
                          ·{" "}
                          {t(
                            topic.open
                              ? "memories:topicOpen"
                              : "memories:topicClosed"
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!memoryState.summary.facts.length &&
                !memoryState.summary.topics.length && (
                  <p className="text-sm text-muted-foreground">
                    {t("memories:noSummary")}
                  </p>
                )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                memoryState?.enabled
                  ? "memories:noSummary"
                  : "memories:summaryPaused"
              )}
            </p>
          )}
        </section>

        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("memories:forgettingHelp")}
          </p>
          <DeleteConfirmation
            subject={t("memories:clearConfirm", {
              name: girlfriend?.name ?? "",
            })}
            onConfirm={() => clearMemories.mutate({ girlfriendId })}
            disabled={busy}
          >
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={busy}
            >
              <Trash2 className="mr-2 size-4" />
              {t("memories:clearAll")}
            </Button>
          </DeleteConfirmation>
        </div>

        {!memories || memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookHeart className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {t("memories:noMemoriesYet")}
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">
              {t(
                memoryState?.enabled
                  ? "memories:shareYourWorkInterestsAndRecentExperiencesImportant"
                  : "memories:emptyPausedHelp"
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
                {contentText(
                  memoryState!.rules.categories.find(
                    category => category.id === group.category
                  )!.label,
                  locale
                )}
                <span className="ml-2 opacity-60">{group.items.length}</span>
              </h2>
              <div className="space-y-2">
                {group.items.map(memory => (
                  <Card key={memory.id} className="py-0">
                    <CardContent className="flex items-start gap-2 p-3">
                      <div className="flex-1 min-w-0">
                        {editing?.id === memory.id ? (
                          <form
                            className="space-y-2"
                            onSubmit={event => {
                              event.preventDefault();
                              if (busy) return;
                              if (!editing.content.trim()) {
                                setEditInvalid(true);
                                document
                                  .getElementById(`memory-edit-${memory.id}`)
                                  ?.focus();
                                return;
                              }
                              editMemory.mutate({
                                id: memory.id,
                                content: editing.content.trim(),
                              });
                            }}
                          >
                            <Label htmlFor={`memory-edit-${memory.id}`}>
                              {t("memories:correctedMemory")}
                            </Label>
                            <Textarea
                              id={`memory-edit-${memory.id}`}
                              rows={3}
                              maxLength={memoryState!.rules.maxEditedLength}
                              value={editing.content}
                              disabled={busy}
                              autoFocus
                              aria-invalid={editInvalid}
                              aria-describedby={
                                editInvalid
                                  ? `memory-edit-help-${memory.id} memory-edit-error-${memory.id}`
                                  : `memory-edit-help-${memory.id}`
                              }
                              onChange={event => {
                                setEditing({
                                  id: memory.id,
                                  content: event.target.value,
                                });
                                setEditInvalid(false);
                              }}
                            />
                            <p
                              id={`memory-edit-help-${memory.id}`}
                              className="text-xs text-muted-foreground"
                            >
                              {t("memories:editHelp")}
                            </p>
                            {editInvalid && (
                              <p
                                id={`memory-edit-error-${memory.id}`}
                                role="alert"
                                className="text-sm text-destructive"
                              >
                                {t("memories:editEmptyError")}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <Button type="submit" size="sm" disabled={busy}>
                                {t("memories:saveCorrection")}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setEditing(null);
                                  setEditInvalid(false);
                                }}
                              >
                                {t("common:cancel")}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <p className="text-sm leading-relaxed break-words">
                            {memory.content}
                          </p>
                        )}
                        {memory.pinned && (
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {t("memories:pinned")}
                            </Badge>
                          </div>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {memory.sourceType === "user_edit"
                            ? t("memories:sourceEdited")
                            : memory.sourceMessageId
                              ? t("memories:sourceUserMessage", {
                                  id: memory.sourceMessageId,
                                })
                              : t("memories:sourceLegacy")}
                          {sourceDate(
                            memory.sourceCreatedAt ?? memory.createdAt,
                            memory.sourceTimeZone
                          ) && (
                            <>
                              {" "}
                              ·{" "}
                              {sourceDate(
                                memory.sourceCreatedAt ?? memory.createdAt,
                                memory.sourceTimeZone
                              )}{" "}
                              ({memory.sourceTimeZone})
                            </>
                          )}
                        </p>
                        {memory.category === "event" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("memories:eventInfo", {
                              date:
                                memory.eventDay ??
                                t("memories:eventDateUnknown"),
                              status: t(
                                memory.eventStatus === "planned"
                                  ? "memories:eventPlanned"
                                  : memory.eventStatus === "completed"
                                    ? "memories:eventCompleted"
                                    : memory.eventStatus === "cancelled"
                                      ? "memories:eventCancelled"
                                      : "memories:eventUnknown"
                              ),
                            })}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground"
                        disabled={busy || editing?.id === memory.id}
                        aria-label={t("memories:editMemory")}
                        title={t("memories:editMemory")}
                        onClick={() => {
                          setEditing({
                            id: memory.id,
                            content: memory.content,
                          });
                          setEditInvalid(false);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 shrink-0 text-muted-foreground hover:text-primary"
                        aria-label={
                          memory.pinned
                            ? t("memories:unpin")
                            : t("memories:pinToKeepThisMemory")
                        }
                        disabled={busy}
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
                      <DeleteConfirmation
                        subject={t("memories:deleteConfirm", {
                          content: memory.content,
                        })}
                        onConfirm={() => deleteMemory.mutate({ id: memory.id })}
                        disabled={busy}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t("memories:deleteMemory")}
                          disabled={busy}
                          title={t("memories:deleteMemory")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </DeleteConfirmation>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
