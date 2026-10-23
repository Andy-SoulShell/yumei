/** 图片作品入口：生成入口、可恢复任务及历史相册。 */
import { Link, useLocation, useSearch } from "wouter";
import { ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { loginUrl } from "@/lib/navigation";
import { MediaStudio } from "@/features/chat/MediaStudio";
import { Button } from "@/components/ui/button";
import { PageError } from "@/components/PageError";
import { ImageTaskCard } from "@/features/chat/ImageTaskCard";
import { ImageSubmissionRecovery } from "@/features/chat/ImageSubmissionRecovery";
import Gallery from "./Gallery";

export default function Generate() {
  const { isAuthenticated, loading } = useAuth();
  if (loading)
    return (
      <div role="status" className="p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  return isAuthenticated ? <AuthenticatedGenerate /> : <GuestGenerate />;
}
function GuestGenerate() {
  const { t } = useI18n();
  return (
    <div className="hub-page works-page">
      <div className="hub-heading !mb-5">
        <h1>{t("studio:imageStudio")}</h1>
        <p>{t("works:subtitle")}</p>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="secondary" className="min-h-11">
          {t("works:create")}
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href={loginUrl("/generate?view=tasks")}>
            {t("works:tasks")}
          </Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href={loginUrl("/generate?view=gallery")}>
            {t("works:gallery")}
          </Link>
        </Button>
      </div>
      <MediaStudio />
    </div>
  );
}
function AuthenticatedGenerate() {
  const { t } = useI18n();
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const view =
    params.get("view") === "tasks"
      ? "tasks"
      : params.get("view") === "gallery"
        ? "gallery"
        : "create";
  const selectedTask = params.get("task");
  const taskId =
    selectedTask && /^[0-9a-f-]{36}$/i.test(selectedTask) ? selectedTask : null;
  const setView = (value: string) =>
    navigate(`/generate?view=${value}`, { replace: true });
  const [filter, setFilter] = useState<
    "all" | "active" | "completed" | "failed"
  >("all");
  const tasks = trpc.selfie.tasks.useInfiniteQuery(
    { filter, limit: 20 },
    {
      enabled: view === "tasks",
      getNextPageParam: page => page.nextCursor,
      refetchInterval: result =>
        result.state.data?.pages.some(page =>
          page.items.some(
            task => task.status === "queued" || task.status === "generating"
          )
        )
          ? 2500
          : false,
      refetchOnWindowFocus: true,
    }
  );
  const items = tasks.data?.pages.flatMap(page => page.items) ?? [];
  return (
    <div className="hub-page works-page">
      <div className="hub-heading !mb-5">
        <h1>{t("works:title")}</h1>
        <p>{t("works:subtitle")}</p>
      </div>
      <div
        className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1"
        role="tablist"
        aria-label={t("works:sections")}
      >
        {(["tasks", "gallery", "create"] as const).map(value => (
          <Button
            key={value}
            role="tab"
            aria-selected={view === value}
            aria-controls={`works-${value}`}
            id={`works-tab-${value}`}
            tabIndex={view === value ? 0 : -1}
            onKeyDown={event => {
              const values = ["tasks", "gallery", "create"];
              const current = values.indexOf(view);
              const next =
                event.key === "ArrowRight"
                  ? values[(current + 1) % 3]
                  : event.key === "ArrowLeft"
                    ? values[(current + 2) % 3]
                    : event.key === "Home"
                      ? values[0]
                      : event.key === "End"
                        ? values[2]
                        : null;
              if (!next) return;
              event.preventDefault();
              setView(next);
              document.getElementById(`works-tab-${next}`)?.focus();
            }}
            variant={view === value ? "secondary" : "ghost"}
            className={`min-h-11 rounded-xl px-2 ${view === value ? "bg-background shadow-sm" : ""}`}
            onClick={() => setView(value)}
          >
            {t(`works:${value}`)}
          </Button>
        ))}
      </div>
      <ImageSubmissionRecovery />
      <section
        id={`works-${view}`}
        role="tabpanel"
        aria-labelledby={`works-tab-${view}`}
        className="mt-4"
      >
        {view === "tasks" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(["all", "active", "completed", "failed"] as const).map(
                value => (
                  <Button
                    key={value}
                    className="min-h-11"
                    variant={filter === value ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {t(
                      `works:filter${value === "all" ? "All" : value === "active" ? "Active" : value === "completed" ? "Completed" : "Failed"}`
                    )}
                  </Button>
                )
              )}
              <Button
                variant="ghost"
                className="ml-auto min-h-11"
                aria-label={t("works:refresh")}
                disabled={tasks.isFetching}
                onClick={() => void tasks.refetch()}
              >
                <RefreshCw
                  className={`size-4 ${tasks.isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            {taskId && (
              <div className="mb-4">
                <ImageTaskCard key={taskId} requestId={taskId} />
              </div>
            )}
            {tasks.isLoading ? (
              <div role="status" className="flex justify-center py-12">
                <Loader2
                  className="animate-spin"
                  aria-label={t("auth:working")}
                />
              </div>
            ) : tasks.error && !tasks.data ? (
              <PageError onRetry={() => void tasks.refetch()} />
            ) : (
              <>
                {tasks.error && (
                  <p role="alert" className="mb-3 text-sm text-destructive">
                    {t("works:refreshFailed")}
                  </p>
                )}
                {items.length ? (
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items
                      .filter(item => item.id !== taskId)
                      .map(task => (
                        <ImageTaskCard
                          key={task.id}
                          requestId={task.id}
                          task={task}
                          companionName={task.companionName}
                        />
                      ))}
                  </div>
                ) : (
                  !taskId && (
                    <div className="explore-empty">
                      <ImagePlus size={34} />
                      <h2>{t("works:noTasks")}</h2>
                      <p>{t("works:noTasksHint")}</p>
                      <Button
                        className="mt-3 min-h-11"
                        onClick={() => setView("create")}
                      >
                        {t("works:create")}
                      </Button>
                    </div>
                  )
                )}
                {tasks.hasNextPage && (
                  <Button
                    variant="outline"
                    className="mx-auto mt-5 flex min-h-11"
                    disabled={tasks.isFetchingNextPage}
                    onClick={() => void tasks.fetchNextPage()}
                  >
                    {t("common:loadMore")}
                  </Button>
                )}
              </>
            )}
          </>
        ) : view === "gallery" ? (
          <Gallery embedded onGenerate={() => setView("create")} />
        ) : (
          <MediaStudio />
        )}
      </section>
    </div>
  );
}
