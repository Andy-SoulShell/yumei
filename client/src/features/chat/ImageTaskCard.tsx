/** 聊天和作品入口共用同一份服务端任务状态与额度结算信息。 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { ImageTaskView } from "@shared/imageTasks";
import { contentText } from "@shared/discovery";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "@/components/PhotoViewer";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/errors";
import { downloadImage } from "@/lib/downloadImage";

export function ImageTaskCard({
  requestId,
  task: supplied,
  companionName,
  inChat = false,
}: {
  requestId: string;
  task?: ImageTaskView;
  companionName?: string;
  inChat?: boolean;
}) {
  const { t, locale } = useI18n();
  const utils = trpc.useUtils();
  const query = trpc.selfie.task.useQuery(
    { id: requestId },
    {
      enabled: !supplied,
      refetchInterval: result =>
        result.state.data &&
        ["queued", "generating"].includes(result.state.data.status)
          ? 2500
          : false,
      refetchOnWindowFocus: true,
    }
  );
  const task = supplied ?? query.data;
  const [viewing, setViewing] = useState(false);
  const [expandedScene, setExpandedScene] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const terminal = useRef(false);
  useEffect(() => {
    if (
      !task ||
      !["completed", "failed"].includes(task.status) ||
      terminal.current
    )
      return;
    terminal.current = true;
    void utils.selfie.quota.invalidate();
    void utils.billing.getInfo.invalidate();
    void utils.girlfriend.invalidate();
    if (inChat)
      void utils.conversation.getMessages.invalidate({
        conversationId: task.conversationId,
      });
  }, [task, utils, inChat]);
  const retry = trpc.selfie.retryTask.useMutation({
    onSuccess: async data => {
      utils.selfie.task.setData({ id: data.id }, data);
      await Promise.all([
        utils.selfie.task.invalidate({ id: requestId }),
        utils.selfie.tasks.invalidate(),
        utils.selfie.quota.invalidate(),
        utils.conversation.getMessages.invalidate({
          conversationId: data.conversationId,
        }),
      ]);
      toast.success(t("works:retryAccepted"));
    },
    onError: error => toast.error(apiErrorMessage(error, t)),
  });
  if (!task)
    return (
      <div
        className="rounded-2xl border p-4 text-sm"
        role={query.error ? "alert" : "status"}
      >
        <p>{t(query.error ? "works:loadFailed" : "auth:working")}</p>
        {query.error && (
          <Button
            className="mt-2 min-h-11"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            {t("explore:retry")}
          </Button>
        )}
      </div>
    );
  const pending = task.status === "queued" || task.status === "generating";
  const scene =
    task.scene ||
    (task.preset
      ? `${task.preset.emoji} ${contentText(task.preset.label, locale)}`
      : "");
  const Icon =
    task.status === "queued"
      ? Clock3
      : task.status === "generating"
        ? Loader2
        : task.status === "completed"
          ? CheckCircle2
          : AlertCircle;
  const download = async () => {
    if (!task.imageUrl) return;
    try {
      await downloadImage(task.imageUrl, task.messageId ?? 0);
    } catch {
      toast.error(t("gallery:downloadFailed"));
    }
  };
  return (
    <article
      id={`image-task-${task.id}`}
      className="image-task-card min-w-0 rounded-2xl border bg-card p-3 sm:p-4"
      aria-label={`${companionName ?? ""} ${t(`works:${task.status}`)}`}
    >
      {query.error && !supplied && (
        <div role="alert" className="mb-3 text-sm text-destructive">
          <p>{t("works:refreshFailed")}</p>
          <Button
            variant="outline"
            className="mt-2 min-h-11"
            onClick={() => void query.refetch()}
          >
            {t("works:refresh")}
          </Button>
        </div>
      )}
      <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {companionName ??
              t(task.kind === "couple" ? "works:couple" : "works:selfie")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(task.createdAt))}
          </p>
        </div>
        <span
          role="status"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${task.status === "failed" ? "bg-destructive/10 text-destructive" : task.status === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}
        >
          <Icon
            className={`size-3.5 ${task.status === "generating" ? "animate-spin" : ""}`}
          />
          {t(`works:${task.status}`)}
        </span>
      </div>
      {task.imageUrl ? (
        <>
          <button
            ref={opener}
            type="button"
            className="block w-full overflow-hidden rounded-xl bg-muted focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={t("works:viewImage")}
            onClick={() => setViewing(true)}
          >
            <img
              src={task.imageUrl}
              alt={t("works:generatedImage")}
              loading="lazy"
              className="max-h-80 w-full object-contain"
            />
          </button>
          <PhotoViewer
            photos={[
              {
                id: task.messageId ?? 0,
                imageUrl: task.imageUrl,
                caption: scene,
              },
            ]}
            index={viewing ? 0 : null}
            onIndexChange={index => setViewing(index !== null)}
            returnFocus={opener}
            onDownload={() => download()}
          />
        </>
      ) : (
        <div
          className={`rounded-xl p-3 text-sm ${task.status === "failed" ? "bg-destructive/5" : "bg-muted/60"}`}
        >
          <p>
            {t(
              pending
                ? task.phase === "submitting"
                  ? "works:checkingRemote"
                  : "works:backgroundHint"
                : task.failure === "unconfirmed"
                  ? "works:unconfirmedFailure"
                  : task.failure === "timeout"
                    ? "works:timeoutFailure"
                    : task.failure === "context"
                      ? "works:contextFailure"
                      : "works:providerFailure"
            )}
          </p>
          {pending && (
            <ol
              className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
              aria-label={t("works:progress")}
            >
              {["queued", "generating", "completed"].map((status, index) => (
                <li
                  key={status}
                  aria-current={task.status === status ? "step" : undefined}
                  className={`flex-1 border-t-2 pt-2 ${index <= (task.status === "queued" ? 0 : 1) ? "border-primary text-primary" : "border-border"}`}
                >
                  {t(
                    `works:${status}` as
                      "works:queued" | "works:generating" | "works:completed"
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {scene && (
        <p
          className={`mt-3 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere] ${expandedScene ? "" : "line-clamp-3"}`}
        >
          {scene}
        </p>
      )}
      {scene && (scene.length > 60 || scene.split("\n").length > 3) && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 min-h-11"
          aria-expanded={expandedScene}
          onClick={() => setExpandedScene(value => !value)}
        >
          {t(expandedScene ? "works:collapseScene" : "works:expandScene")}
        </Button>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {t(
          task.quota === "reserved"
            ? "works:quotaReserved"
            : task.quota === "charged"
              ? "works:quotaCharged"
              : task.quota === "refunded"
                ? "works:quotaRefunded"
                : task.isByok
                  ? "works:quotaByok"
                  : "works:quotaUnmetered"
        )}
      </p>
      {task.status === "failed" && task.retryUntil && !task.retryTaskId && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("works:coupleRetention", {
            time: new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(task.retryUntil)),
          })}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {task.imageUrl && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => void download()}
          >
            <Download className="size-4" />
            {t("gallery:downloadPhoto")}
          </Button>
        )}
        {task.status === "failed" && !task.retryTaskId && task.canRetry && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={retry.isPending}
            onClick={() => retry.mutate({ id: task.id })}
          >
            <RefreshCw
              className={`size-4 ${retry.isPending ? "animate-spin" : ""}`}
            />
            {t("works:retry")}
          </Button>
        )}
        {task.retryTaskId && (
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link href={`/generate?task=${task.retryTaskId}`}>
              {t("works:viewRetry")}
            </Link>
          </Button>
        )}
        {!inChat && (
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link href={`/chat/${task.conversationId}`}>
              <MessageCircle className="size-4" />
              {t("works:backToChat")}
            </Link>
          </Button>
        )}
        {inChat && pending && (
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link href="/generate">{t("works:title")}</Link>
          </Button>
        )}
      </div>
      {task.status === "failed" && !task.retryTaskId && task.canRetry && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("works:retryQuota")}
        </p>
      )}
    </article>
  );
}
