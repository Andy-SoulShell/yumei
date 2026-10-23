/** 只核对原提交；查不到任务后，用户可用同一编号补发小型输入。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  finishImageSubmission,
  imageSubmissionEvent,
  pendingImageSubmissions,
  type PendingImageSubmission,
} from "@/lib/imageSubmissions";

export function ImageSubmissionRecovery({
  conversationId,
}: {
  conversationId?: number | null;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [stored, setStored] = useState<{
    accountId: string | undefined;
    items: PendingImageSubmission[];
  }>({ accountId: user?.id, items: [] });
  const items =
    stored.accountId === user?.id
      ? stored.items.filter(
          item => !conversationId || item.conversationId === conversationId
        )
      : [];
  const scope = useRef({ accountId: user?.id, conversationId, mounted: true });
  scope.current.accountId = user?.id;
  scope.current.conversationId = conversationId;
  useEffect(() => {
    const current = scope.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
    };
  }, []);
  const [checked, setChecked] = useState<Record<string, "absent" | "error">>(
    {}
  );
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setBusy(null);
    setChecked({});
  }, [user?.id, conversationId]);
  const refresh = useCallback(
    () =>
      setStored({
        accountId: user?.id,
        items: pendingImageSubmissions(user?.id).filter(
          item => !conversationId || item.conversationId === conversationId
        ),
      }),
    [user?.id, conversationId]
  );
  useEffect(() => {
    refresh();
    window.addEventListener(imageSubmissionEvent, refresh);
    return () => window.removeEventListener(imageSubmissionEvent, refresh);
  }, [refresh]);
  const camera = trpc.selfie.createTask.useMutation();
  const chat = trpc.chat.sendMessage.useMutation();
  const check = async (item: PendingImageSubmission, resend = false) => {
    if (busy) return;
    setBusy(item.clientRequestId);
    const current = () =>
      scope.current.mounted &&
      scope.current.accountId === user?.id &&
      scope.current.conversationId === conversationId;
    try {
      let found = await utils.selfie.findTask.fetch({
        clientRequestId: item.clientRequestId,
      });
      if (!current()) return;
      if (!found && resend && item.kind !== "couple") {
        if (item.kind === "chat")
          found =
            (
              await chat.mutateAsync({
                conversationId: item.conversationId,
                clientRequestId: item.clientRequestId,
                content: item.input.userContext,
                transcriptionId: item.transcriptionId,
              })
            ).task ?? null;
        else
          found = await camera.mutateAsync({
            ...item.input,
            clientRequestId: item.clientRequestId,
          });
      }
      if (!current()) return;
      if (found) {
        finishImageSubmission(user?.id, item.clientRequestId);
        await Promise.all([
          utils.selfie.tasks.invalidate(),
          utils.selfie.quota.invalidate(),
          utils.conversation.getMessages.invalidate({
            conversationId: item.conversationId,
          }),
        ]);
      } else
        setChecked(current => ({
          ...current,
          [item.clientRequestId]: "absent",
        }));
    } catch {
      if (current())
        setChecked(current => ({
          ...current,
          [item.clientRequestId]: "error",
        }));
    } finally {
      if (current()) setBusy(null);
    }
  };
  // 每次挂载先查询原编号；不会因刷新自动发起第二次模型调用。
  useEffect(() => {
    const initial = pendingImageSubmissions(user?.id).filter(
      item => !conversationId || item.conversationId === conversationId
    );
    let active = true;
    void (async () => {
      for (const item of initial) {
        try {
          const found = await utils.selfie.findTask.fetch({
            clientRequestId: item.clientRequestId,
          });
          if (!active) return;
          if (found) finishImageSubmission(user?.id, item.clientRequestId);
          else
            setChecked(current => ({
              ...current,
              [item.clientRequestId]: "absent",
            }));
        } catch {
          if (active)
            setChecked(current => ({
              ...current,
              [item.clientRequestId]: "error",
            }));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, conversationId, utils]);
  if (!items.length) return null;
  return (
    <aside
      className="space-y-3 rounded-2xl border border-primary/20 bg-muted/40 p-3"
      aria-label={t("works:pendingSubmissions")}
    >
      {items.map(item => (
        <div key={item.clientRequestId} className="space-y-2 text-sm">
          <p role="status">
            {t(
              checked[item.clientRequestId] === "absent"
                ? "works:submissionAbsent"
                : "works:submissionUnknown"
            )}
          </p>
          {item.kind === "couple" &&
            checked[item.clientRequestId] === "absent" && (
              <p>{t("works:reselectCouple")}</p>
            )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy !== null}
              onClick={() =>
                void check(
                  item,
                  checked[item.clientRequestId] === "absent" &&
                    item.kind !== "couple"
                )
              }
            >
              {t(
                checked[item.clientRequestId] === "absent" &&
                  item.kind !== "couple"
                  ? "works:resend"
                  : "works:checkSubmission"
              )}
            </Button>
            {checked[item.clientRequestId] === "absent" && (
              <Button
                variant="ghost"
                className="min-h-11"
                onClick={() =>
                  finishImageSubmission(user?.id, item.clientRequestId)
                }
              >
                {t("works:dismissSubmission")}
              </Button>
            )}
            <Button asChild variant="ghost" className="min-h-11">
              <Link href="/generate">{t("works:title")}</Link>
            </Button>
          </div>
        </div>
      ))}
    </aside>
  );
}
