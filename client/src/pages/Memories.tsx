/** 先管理记忆，再按需查看回顾与配置；修改前解释影响并确认，修改后回到原会话。 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  BookHeart,
  ChevronDown,
  Loader2,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { usePageBack } from "@/hooks/usePageBack";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { contentText } from "@shared/discovery";
import { PageError } from "@/components/PageError";
import { TimeZonePicker } from "@/components/TimeZonePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  MemoryConfirmation,
  MemoryImpact,
} from "@/features/memory/MemoryConfirmation";
import { useMemoryActions } from "@/features/memory/useMemoryActions";
import type { MemoryAction, SavedMemory } from "@/features/memory/types";
import "@/features/memory/memory.css";

export default function Memories() {
  const params = useParams<{ id: string }>();
  const auth = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });
  return (
    <MemoryPage
      key={`${auth.user?.id ?? "guest"}:${params.id}`}
      girlfriendId={Number(params.id)}
      isAuthenticated={auth.isAuthenticated}
      authLoading={auth.loading}
    />
  );
}
function MemoryPage({
  girlfriendId,
  isAuthenticated,
  authLoading,
}: {
  girlfriendId: number;
  isAuthenticated: boolean;
  authLoading: boolean;
}) {
  const { t, locale } = useI18n();
  const goBack = usePageBack("/characters");
  const [, navigate] = useLocation();
  const search = useSearch();
  const origin = Number(new URLSearchParams(search).get("conversation"));
  const hasOrigin = Number.isSafeInteger(origin) && origin > 0;
  const validId = Number.isSafeInteger(girlfriendId) && girlfriendId > 0;
  const [editing, setEditing] = useState<{
    memory: SavedMemory;
    content: string;
  } | null>(null);
  const [editInvalid, setEditInvalid] = useState(false);
  const [timeZoneDraft, setTimeZoneDraft] = useState<string | null>(null);
  const [timeZoneInvalid, setTimeZoneInvalid] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [leaving, setLeaving] = useState<"back" | "chat" | null>(null);
  const [opening, setOpening] = useState(false);
  const [returnError, setReturnError] = useState(false);
  const returnLock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { open: openChat, pending } = useCompanionChat();
  const rolesQuery = trpc.girlfriend.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const girlfriend = rolesQuery.data?.find(g => g.id === girlfriendId);
  const memoryQuery = trpc.memory.list.useQuery(
    { girlfriendId },
    { enabled: isAuthenticated && validId, refetchInterval: 5000 }
  );
  const stateQuery = trpc.memory.state.useQuery(
    { girlfriendId },
    { enabled: isAuthenticated && validId, refetchInterval: 5000 }
  );
  const conversationQuery = trpc.conversation.get.useQuery(
    { id: origin },
    { enabled: isAuthenticated && hasOrigin, retry: false }
  );
  const originAvailable =
    conversationQuery.data?.girlfriendId === girlfriendId && hasOrigin;
  const memories = memoryQuery.data;
  const memoryState = stateQuery.data;
  const {
    feedback,
    setFeedback,
    confirmation,
    setConfirmation,
    run,
    busy,
    retryRefresh,
  } = useMemoryActions(girlfriendId, () => {
    setEditing(null);
    setEditInvalid(false);
  });
  const successAction = feedback?.status === "success" ? feedback.action : null;
  useEffect(() => {
    if (
      !successAction ||
      !["edit", "delete", "clear"].includes(successAction.type)
    )
      return;
    const frame = requestAnimationFrame(() => {
      const result = document.getElementById("memory-result");
      result?.focus({ preventScroll: true });
      result?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [successAction]);
  const returningBlocked = busy && feedback?.status !== "success";
  const timeZoneValue = timeZoneDraft ?? memoryState?.timeZone ?? "UTC";
  const dirty =
    !!editing && editing.content.trim() !== editing.memory.content.trim();
  const changedContext =
    feedback?.status === "success" &&
    ["edit", "delete", "clear", "setEnabled", "setTimeZone"].includes(
      feedback.action.type
    );
  const returnToChat = async () => {
    if (
      returnLock.current ||
      returningBlocked ||
      (hasOrigin && conversationQuery.isLoading)
    )
      return;
    returnLock.current = true;
    setOpening(true);
    setReturnError(false);
    try {
      if (originAvailable)
        navigate(`/chat/${origin}${changedContext ? "?memoryUpdated=1" : ""}`);
      else {
        const opened = await openChat(girlfriendId);
        if (!opened && mounted.current) setReturnError(true);
      }
    } finally {
      returnLock.current = false;
      if (mounted.current) setOpening(false);
    }
  };
  const leave = (destination: "back" | "chat") => {
    if (returningBlocked || opening) return;
    if (dirty) {
      setLeaving(destination);
      return;
    }
    if (destination === "back") goBack();
    else void returnToChat();
  };
  const requestConfirmation = (action: MemoryAction) => {
    if (busy) return;
    setFeedback(null);
    setConfirmation(action);
  };
  const retryAll = () => {
    void memoryQuery.refetch();
    void stateQuery.refetch();
    void rolesQuery.refetch();
  };
  const saveTimeZone = (event: FormEvent) => {
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
        throw new Error();
      setTimeZoneInvalid(false);
      run({ type: "setTimeZone", timeZone: canonical });
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
  useEffect(() => {
    if (
      feedback?.status === "success" &&
      feedback.action.type === "setTimeZone"
    )
      setTimeZoneDraft(null);
  }, [feedback]);
  if (
    authLoading ||
    rolesQuery.isLoading ||
    (!memories && memoryQuery.isLoading) ||
    (!memoryState && stateQuery.isLoading)
  )
    return (
      <div
        className="min-h-full flex items-center justify-center"
        role="status"
      >
        <Loader2
          className="size-8 animate-spin text-primary"
          aria-label={t("auth:working")}
        />
      </div>
    );
  if (!validId || (!rolesQuery.error && !girlfriend))
    return (
      <PageError
        title={t("common:contentUnavailable")}
        actionLabel={t("explore:navCharacters")}
        onRetry={() => navigate("/characters")}
      />
    );
  if (!memories || !memoryState || !girlfriend)
    return <PageError onRetry={retryAll} />;
  const categories = memoryState.rules.categories;
  const hasEditingRecord =
    !editing || memories.some(memory => memory.id === editing.memory.id);
  const displayMemories =
    editing && !hasEditingRecord ? [...memories, editing.memory] : memories;
  const filtered = displayMemories.filter(
    memory =>
      (categoryFilter === "all" || memory.category === categoryFilter) &&
      memory.content
        .toLocaleLowerCase(locale)
        .includes(query.trim().toLocaleLowerCase(locale))
  );
  const grouped = categories
    .map(category => ({
      category: category.id,
      items: filtered.filter(memory => memory.category === category.id),
    }))
    .filter(group => group.items.length);
  const capacity = memoryState.capacity;
  const openLabel =
    hasOrigin && !originAvailable && !conversationQuery.isLoading
      ? t("memoryFlow:returnLatest")
      : t("memoryFlow:continue");
  return (
    <div className="memories-page min-h-full bg-background">
      <header className="page-toolbar sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t("setup:back")}
          disabled={returningBlocked || opening}
          onClick={() => leave("back")}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-sm font-semibold sm:text-base"
            title={t("memories:whatRemembersAboutYou", {
              name: girlfriend.name,
            })}
          >
            {t("memories:whatRemembersAboutYou", { name: girlfriend.name })}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("memories:capacity", { count: memories.length, capacity })}
          </p>
        </div>
        <Button
          className="memory-return min-h-11 max-w-36 shrink-0 whitespace-normal text-xs"
          disabled={
            returningBlocked ||
            opening ||
            pending !== null ||
            (hasOrigin && conversationQuery.isLoading)
          }
          onClick={() => leave("chat")}
        >
          {opening ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageCircle className="size-4 shrink-0" />
          )}
          {opening ? t("memoryFlow:opening") : openLabel}
        </Button>
      </header>
      <div className="mx-auto max-w-2xl space-y-5 p-3 pb-8 sm:p-5">
        <p className="text-sm text-muted-foreground">{t("memoryFlow:intro")}</p>
        <details className="memory-details rounded-2xl border bg-card px-4">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3 text-sm font-medium">
            <span>
              {t("memoryFlow:impactTitle")}
              <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                {t("memoryFlow:impactShort")}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0" />
          </summary>
          <div className="space-y-3 pb-4">
            <MemoryImpact name={girlfriend.name} />
            <p className="text-sm text-muted-foreground">
              {t("memoryFlow:impactOther")}
            </p>
          </div>
        </details>
        {(memoryQuery.error || stateQuery.error || rolesQuery.error) && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border p-3 text-sm text-destructive"
          >
            <p>{t("memoryFlow:stale")}</p>
            <Button variant="outline" onClick={retryAll}>
              {t("memoryFlow:refresh")}
            </Button>
          </div>
        )}
        {hasOrigin && !conversationQuery.isLoading && !originAvailable && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("memoryFlow:returnUnavailable")}
          </p>
        )}
        {returnError && (
          <p role="alert" className="text-sm text-destructive">
            {t("memoryFlow:returnFailed")}
          </p>
        )}
        {feedback && (
          <section
            id="memory-result"
            tabIndex={-1}
            aria-busy={feedback.status === "saving"}
            className={`memory-result space-y-3 rounded-2xl border p-4 ${feedback.status === "error" ? "border-destructive/40" : "border-primary/25 bg-primary/5"}`}
          >
            <p
              role={feedback.status === "error" ? "alert" : "status"}
              className={`text-sm leading-relaxed ${feedback.status === "error" ? "text-destructive" : ""}`}
            >
              {t(
                feedback.status === "saving"
                  ? "memoryFlow:working"
                  : feedback.status === "error"
                    ? feedback.conflict
                      ? "memoryFlow:conflict"
                      : "memoryFlow:failed"
                    : feedback.action.type === "edit"
                      ? "memoryFlow:edited"
                      : feedback.action.type === "delete"
                        ? "memoryFlow:deleted"
                        : feedback.action.type === "clear"
                          ? "memoryFlow:cleared"
                          : feedback.action.type === "setEnabled"
                            ? feedback.action.enabled
                              ? "memories:memoryResumed"
                              : "memories:memoryPaused"
                            : feedback.action.type === "setTimeZone"
                              ? "memories:timeZoneSaved"
                              : "memoryFlow:pinSaved"
              )}
            </p>
            {changedContext && (
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("memoryFlow:impactShort")}
                </p>
                {!memoryState.enabled && (
                  <p className="text-xs text-muted-foreground">
                    {t("memoryFlow:paused")}
                  </p>
                )}
                <Button
                  className="min-h-11 w-full whitespace-normal"
                  disabled={returningBlocked || opening}
                  onClick={() => leave("chat")}
                >
                  {originAvailable ? t("memoryFlow:returnCurrent") : openLabel}
                </Button>
              </>
            )}
            {feedback.refreshFailed && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{t("memoryFlow:refreshFailed")}</p>
                <Button variant="outline" onClick={() => void retryRefresh()}>
                  {t("memoryFlow:refresh")}
                </Button>
              </div>
            )}
            {feedback.status === "error" &&
              !confirmation &&
              !feedback.conflict && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    ["edit", "delete", "clear"].includes(feedback.action.type)
                      ? setConfirmation(feedback.action)
                      : run(feedback.action)
                  }
                >
                  {t("memoryFlow:retry")}
                </Button>
              )}
          </section>
        )}
        <section aria-labelledby="memory-list-title" className="space-y-4">
          <h2 id="memory-list-title" tabIndex={-1} className="font-semibold">
            {t("memoryFlow:listTitle")}{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {memories.length}
            </span>
          </h2>
          {memories.length > 0 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <Input
                  disabled={busy || !!editing}
                  aria-label={t("memoryFlow:search")}
                  placeholder={t("memoryFlow:searchPlaceholder")}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  className="min-h-11 pl-10"
                />
              </div>
              <select
                disabled={busy || !!editing}
                aria-label={t("memoryFlow:filter")}
                value={categoryFilter}
                onChange={event => setCategoryFilter(event.target.value)}
                className="min-h-11 w-full rounded-xl border bg-card px-3 text-sm"
              >
                <option value="all">{t("memoryFlow:all")}</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {contentText(category.label, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!displayMemories.length ? (
            <div className="flex flex-col items-center rounded-2xl border bg-card px-4 py-10 text-center">
              <BookHeart className="mb-3 size-10 text-muted-foreground/50" />
              <p>{t("memories:noMemoriesYet")}</p>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                {t(
                  memoryState.enabled
                    ? "memories:shareYourWorkInterestsAndRecentExperiencesImportant"
                    : "memories:emptyPausedHelp"
                )}
              </p>
            </div>
          ) : !filtered.length ? (
            <div className="rounded-2xl border p-5 text-center">
              <p className="text-sm text-muted-foreground">
                {t("memoryFlow:noMatches")}
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setQuery("");
                  setCategoryFilter("all");
                }}
              >
                {t("memoryFlow:reset")}
              </Button>
            </div>
          ) : (
            grouped.map(group => (
              <section key={group.category} className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {contentText(
                    categories.find(category => category.id === group.category)!
                      .label,
                    locale
                  )}{" "}
                  <span className="ml-1 opacity-60">{group.items.length}</span>
                </h3>
                <div className="space-y-3">
                  {group.items.map(memory => (
                    <Card key={memory.id} className="memory-card gap-0 py-0">
                      <CardContent className="space-y-3 p-4">
                        <div className="min-w-0">
                          {editing?.memory.id === memory.id ? (
                            <form
                              className="space-y-3"
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
                                requestConfirmation({
                                  type: "edit",
                                  memory: editing.memory,
                                  content: editing.content.trim(),
                                });
                              }}
                            >
                              <p className="text-xs font-medium text-muted-foreground">
                                {t("memoryFlow:original")}
                              </p>
                              <p className="memory-text rounded-xl bg-muted/50 p-3 text-sm">
                                {editing.memory.content}
                              </p>
                              {!hasEditingRecord ? (
                                <p
                                  role="alert"
                                  className="text-sm text-destructive"
                                >
                                  {t("memoryFlow:gone")}
                                </p>
                              ) : memory.contentVersion !==
                                editing.memory.contentVersion ? (
                                <div
                                  role="alert"
                                  className="space-y-2 rounded-xl border border-amber-400/40 p-3 text-sm"
                                >
                                  <p>{t("memoryFlow:latest")}</p>
                                  <p className="memory-text">
                                    {memory.content}
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setEditing({ ...editing, memory });
                                      setFeedback(null);
                                    }}
                                  >
                                    {t("memoryFlow:useLatest")}
                                  </Button>
                                </div>
                              ) : null}
                              <Label htmlFor={`memory-edit-${memory.id}`}>
                                {t("memories:correctedMemory")}
                              </Label>
                              <Textarea
                                id={`memory-edit-${memory.id}`}
                                className="memory-text min-h-32"
                                rows={4}
                                maxLength={memoryState.rules.maxEditedLength}
                                value={editing.content}
                                disabled={busy}
                                autoFocus
                                aria-invalid={editInvalid}
                                aria-describedby={`memory-edit-help-${memory.id}${editInvalid ? ` memory-edit-error-${memory.id}` : ""}`}
                                onChange={event => {
                                  setEditing({
                                    ...editing,
                                    content: event.target.value,
                                  });
                                  setEditInvalid(false);
                                }}
                              />
                              <p
                                id={`memory-edit-help-${memory.id}`}
                                className="text-xs leading-relaxed text-muted-foreground"
                              >
                                {t("memoryFlow:editLimit", {
                                  max: memoryState.rules.maxEditedLength,
                                })}
                              </p>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {t("memoryFlow:impactShort")}
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
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  type="submit"
                                  disabled={
                                    busy ||
                                    !dirty ||
                                    !hasEditingRecord ||
                                    memory.contentVersion !==
                                      editing.memory.contentVersion
                                  }
                                >
                                  {t("memoryFlow:editReview")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
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
                            <p className="memory-text text-sm leading-relaxed">
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
                        <div className="memory-actions grid grid-cols-3 gap-1 border-t pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-11 whitespace-normal px-1 text-xs"
                            disabled={busy || !!editing}
                            aria-label={t("memories:editMemory")}
                            onClick={() => {
                              setEditing({ memory, content: memory.content });
                              setEditInvalid(false);
                              setFeedback(null);
                            }}
                          >
                            <Pencil className="size-4" />
                            {t("memoryFlow:edit")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-11 whitespace-normal px-1 text-xs"
                            aria-pressed={memory.pinned}
                            aria-label={t(
                              memory.pinned
                                ? "memories:unpin"
                                : "memories:pinToKeepThisMemory"
                            )}
                            disabled={busy || !!editing}
                            onClick={() =>
                              run({
                                type: "setPinned",
                                id: memory.id,
                                pinned: !memory.pinned,
                              })
                            }
                          >
                            {memory.pinned ? (
                              <PinOff className="size-4" />
                            ) : (
                              <Pin className="size-4" />
                            )}
                            {t(
                              memory.pinned
                                ? "memoryFlow:unpin"
                                : "memoryFlow:pin"
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-11 whitespace-normal px-1 text-xs text-destructive"
                            aria-label={t("memories:deleteMemory")}
                            disabled={busy || !!editing}
                            onClick={() =>
                              requestConfirmation({ type: "delete", memory })
                            }
                          >
                            <Trash2 className="size-4" />
                            {t("memoryFlow:remove")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))
          )}
        </section>
        <details className="memory-details rounded-2xl border bg-card px-4">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3 text-sm font-medium">
            {t("memoryFlow:controls")}
            <ChevronDown className="size-4 shrink-0" />
          </summary>
          <section
            className="space-y-4 pb-4"
            aria-labelledby="memory-controls-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label
                  id="memory-controls-title"
                  htmlFor="memory-enabled"
                  className="font-semibold"
                >
                  {t("memories:memoryControl")}
                </Label>
                <p
                  id="memory-enabled-help"
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {t(
                    memoryState.enabled
                      ? "memories:memoryEnabledHelp"
                      : "memories:memoryPausedHelp"
                  )}
                </p>
              </div>
              <Switch
                id="memory-enabled"
                className="mt-1"
                checked={memoryState.enabled}
                disabled={busy || !!editing || !memoryState.rules.enabled}
                aria-describedby="memory-enabled-help memory-control-impact"
                onCheckedChange={enabled =>
                  run({ type: "setEnabled", enabled })
                }
              />
            </div>
            <p
              id="memory-control-impact"
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {t("memoryFlow:controlImpact")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                memoryState.semantic.supported &&
                  memoryState.semantic.configured
                  ? "memories:recallMeaning"
                  : "memories:recallWords"
              )}
            </p>
            <form onSubmit={saveTimeZone} className="space-y-3">
              <Label htmlFor="memory-timezone">{t("memories:timeZone")}</Label>
              <TimeZonePicker
                id="memory-timezone"
                value={timeZoneValue}
                disabled={busy || !!editing}
                invalid={timeZoneInvalid}
                describedBy={`memory-timezone-help${timeZoneInvalid ? " memory-timezone-error" : ""}`}
                onChange={zone => {
                  setTimeZoneDraft(zone);
                  setTimeZoneInvalid(false);
                }}
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={
                  busy ||
                  !!editing ||
                  timeZoneValue.trim() === memoryState.timeZone
                }
              >
                {t("memories:saveTimeZone")}
              </Button>
              <p
                id="memory-timezone-help"
                className="text-xs leading-relaxed text-muted-foreground"
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
        </details>
        <details className="memory-details rounded-2xl border bg-card px-4">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3 text-sm font-medium">
            {t("memories:conversationSummary")}
            <ChevronDown className="size-4 shrink-0" />
          </summary>
          <p className="pb-3 text-xs text-muted-foreground">
            {t("memoryFlow:recapHelp")}
          </p>
          <section
            className="space-y-3 pb-4"
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
        </details>
        <details className="memory-details rounded-2xl border px-4">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3 text-sm font-medium text-destructive">
            {t("memoryFlow:dangerTitle")}
            <ChevronDown className="size-4 shrink-0" />
          </summary>
          <div className="space-y-3 pb-4">
            <p className="text-sm text-muted-foreground">
              {t("memoryFlow:dangerHelp")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("memories:forgettingHelp")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("memoryFlow:pinHelp")}
            </p>
            <Button
              variant="outline"
              className="min-h-11 w-full text-destructive"
              disabled={busy || !!editing}
              onClick={() => requestConfirmation({ type: "clear" })}
            >
              <Trash2 className="size-4" />
              {t("memories:clearAll")}
            </Button>
          </div>
        </details>
      </div>
      <MemoryConfirmation
        action={confirmation}
        name={girlfriend.name}
        busy={busy}
        feedback={feedback}
        onCancel={() => {
          if (!busy) setConfirmation(null);
        }}
        onConfirm={run}
        enabled={memoryState.enabled}
      />
      <AlertDialog
        open={leaving !== null}
        onOpenChange={open => {
          if (!open) setLeaving(null);
        }}
      >
        <AlertDialogContent className="memory-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("memoryFlow:discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("memoryFlow:discardHelp")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setLeaving(null)}>
              {t("memoryFlow:stay")}
            </Button>
            <Button
              onClick={() => {
                const destination = leaving;
                setLeaving(null);
                setEditing(null);
                if (destination === "back") goBack();
                else void returnToChat();
              }}
            >
              {t("memoryFlow:leave")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
