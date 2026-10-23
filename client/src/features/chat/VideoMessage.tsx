/** 从持久任务恢复视频消息状态，完成后使用原生播放器播放音画内容。 */
import { useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProductConfig } from "@/features/product/useProductConfig";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/errors";
import { createUuid } from "@/lib/uuid";
import { contentText } from "@shared/discovery";

/** 请求编号只用于查询，任务归属在服务端逐次校验。 */
export function VideoMessage({ requestId }: { requestId: string }) {
  const { t, locale } = useI18n();
  const policy = useProductConfig();
  const utils = trpc.useUtils();
  const retryId = useRef<string | null>(null);
  const query = trpc.video.get.useQuery(
    { id: requestId },
    {
      refetchInterval: result =>
        result.state.data?.status === "pending"
          ? (policy.raw?.runtime.video?.pollMs ?? false)
          : false,
      refetchOnWindowFocus: true,
    }
  );
  const cancel = trpc.video.cancel.useMutation({
    onSuccess: data => {
      utils.video.get.setData({ id: requestId }, data);
    },
    onError: error => toast.error(apiErrorMessage(error, t)),
  });
  const retry = trpc.video.create.useMutation({
    onSuccess: () => {
      void utils.conversation.getMessages.invalidate({
        conversationId: query.data?.conversationId,
      });
    },
    onError: error => {
      void utils.conversation.getMessages.invalidate({
        conversationId: query.data?.conversationId,
      });
      toast.error(apiErrorMessage(error, t));
    },
  });
  const data = query.data;
  if (query.error)
    return (
      <div role="alert" className="space-y-2 rounded-xl border p-3">
        <p>{t("video:loadFailed")}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("video:reload")}
        </Button>
      </div>
    );
  if (!data) return <p role="status">{t("video:loading")}</p>;
  return (
    <div className="w-72 max-w-full space-y-2 rounded-xl border bg-muted/30 p-3">
      {data.videoUrl ? (
        <>
          <video
            src={data.videoUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={t("video:player")}
            className="max-h-[65vh] w-full rounded-lg"
          />
          <a
            href={`${data.videoUrl}?download=1`}
            download="video.mp4"
            className="inline-block text-sm underline"
          >
            {t("video:download")}
          </a>
        </>
      ) : (
        <>
          {!!data.coinCost && (
            <p className="text-xs text-muted-foreground">
              {t(
                data.status === "succeeded"
                  ? "economy:coinsCharged"
                  : data.status === "pending"
                    ? "economy:coinsReserved"
                    : "economy:coinsReturned",
                { count: data.coinCost }
              )}
            </p>
          )}
          <p role="status" className="flex items-center gap-2 text-sm">
            {data.status === "pending" && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {t(
              data.status === "pending"
                ? `video:${data.phase}`
                : `video:${data.status}`
            )}
          </p>
          {data.status === "pending" ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("video:backgroundHint")}
              </p>
              {data.phase === "queued" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate({ id: requestId })}
                >
                  {t("video:cancel")}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {t("video:cancelHint")}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("video:refundHint")}
              </p>
              {!retry.isSuccess && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={retry.isPending}
                  onClick={() => {
                    retryId.current ??= createUuid();
                    retry.mutate({
                      ...data.input,
                      clientRequestId: retryId.current,
                    });
                  }}
                >
                  {t("video:retry")}
                </Button>
              )}
            </>
          )}
        </>
      )}
      <p className="whitespace-pre-wrap break-words text-sm">
        {data.prompt ||
          (data.preset
            ? `${data.preset.emoji} ${contentText(data.preset.label, locale)}`
            : "")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("video:actualDuration", {
          seconds: Math.round(data.durationSeconds * 100) / 100,
        })}
      </p>
    </div>
  );
}
