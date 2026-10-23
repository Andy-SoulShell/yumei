/** 每次只提交一个操作；写入结果和读取失败分开处理，离开后不再回填。 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import type { MemoryAction, MemoryFeedback } from "./types";

export function useMemoryActions(girlfriendId: number, onEdited: () => void) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [feedback, setFeedback] = useState<MemoryFeedback | null>(null);
  const [confirmation, setConfirmation] = useState<MemoryAction | null>(null);
  const inFlight = useRef<MemoryAction | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = async (allRoles = false) => {
    await Promise.all([
      utils.memory.list.invalidate(
        allRoles ? undefined : { girlfriendId },
        undefined,
        { throwOnError: true }
      ),
      utils.memory.state.invalidate(
        allRoles ? undefined : { girlfriendId },
        undefined,
        { throwOnError: true }
      ),
    ]);
  };
  const succeeded = async () => {
    const action = inFlight.current;
    if (!action || !mounted.current) return;
    // 已有服务器成功回包才更新列表；读取暂不可用也不显示旧内容冒充新结果。
    utils.memory.list.setData({ girlfriendId }, previous => {
      if (!previous) return previous;
      if (action.type === "clear") return [];
      if (action.type === "delete")
        return previous.filter(item => item.id !== action.memory.id);
      if (action.type === "edit")
        return previous.map(item =>
          item.id === action.memory.id
            ? {
                ...item,
                content: action.content,
                sourceType: "user_edit",
                sourceMessageId: null,
                sourceCreatedAt: new Date(),
                eventDay: null,
                eventStatus: "unknown",
              }
            : item
        );
      if (action.type === "setPinned")
        return previous.map(item =>
          item.id === action.id ? { ...item, pinned: action.pinned } : item
        );
      return previous;
    });
    if (action.type !== "setPinned")
      utils.memory.state.setData({ girlfriendId }, previous =>
        previous
          ? {
              ...previous,
              summary: null,
              ...(action.type === "setEnabled"
                ? { enabled: action.enabled }
                : {}),
              ...(action.type === "setTimeZone"
                ? { timeZone: action.timeZone }
                : {}),
            }
          : previous
      );
    if (action.type === "edit" || action.type === "clear") onEdited();
    setConfirmation(null);
    setFeedback({ action, status: "success" });
    const message =
      action.type === "edit"
        ? t("memories:memoryUpdated")
        : action.type === "delete"
          ? t("memories:memoryDeleted")
          : action.type === "clear"
            ? t("memories:memoriesCleared")
            : action.type === "setEnabled"
              ? t(
                  action.enabled
                    ? "memories:memoryResumed"
                    : "memories:memoryPaused"
                )
              : action.type === "setTimeZone"
                ? t("memories:timeZoneSaved")
                : t("memoryFlow:pinSaved");
    toast.success(message);
    try {
      await refresh(action.type === "setTimeZone");
    } catch {
      if (mounted.current)
        setFeedback({ action, status: "success", refreshFailed: true });
    } finally {
      inFlight.current = null;
    }
  };
  const failed = (error: { data?: { code?: string } | null }) => {
    const action = inFlight.current;
    inFlight.current = null;
    if (!action || !mounted.current) return;
    setFeedback({
      action,
      status: "error",
      conflict:
        error.data?.code === "CONFLICT" || error.data?.code === "NOT_FOUND",
    });
    toast.error(t("memoryFlow:failed"));
  };
  const options = { onSuccess: succeeded, onError: failed };
  const edit = trpc.memory.edit.useMutation(options);
  const remove = trpc.memory.delete.useMutation(options);
  const clear = trpc.memory.clear.useMutation(options);
  const pin = trpc.memory.setPinned.useMutation(options);
  const enabled = trpc.memory.setEnabled.useMutation(options);
  const zone = trpc.memory.setTimeZone.useMutation(options);
  const busy =
    [edit, remove, clear, pin, enabled, zone].some(
      mutation => mutation.isPending
    ) || feedback?.status === "saving";
  const run = (action: MemoryAction) => {
    if (!mounted.current || inFlight.current || busy) return;
    inFlight.current = action;
    setFeedback({ action, status: "saving" });
    switch (action.type) {
      case "edit":
        edit.mutate({
          id: action.memory.id,
          content: action.content,
          expectedVersion: action.memory.contentVersion,
        });
        break;
      case "delete":
        remove.mutate({
          id: action.memory.id,
          expectedVersion: action.memory.contentVersion,
        });
        break;
      case "clear":
        clear.mutate({ girlfriendId });
        break;
      case "setPinned":
        pin.mutate({ id: action.id, pinned: action.pinned });
        break;
      case "setEnabled":
        enabled.mutate({ girlfriendId, enabled: action.enabled });
        break;
      case "setTimeZone":
        zone.mutate({ timeZone: action.timeZone });
        break;
    }
  };
  const retryRefresh = async () => {
    if (!feedback) return;
    try {
      await refresh(feedback.action.type === "setTimeZone");
      if (mounted.current)
        setFeedback(current =>
          current ? { ...current, refreshFailed: false } : current
        );
    } catch {
      /* 保留读取失败提示，禁止重新提交已成功的修改。 */
    }
  };
  return {
    feedback,
    setFeedback,
    confirmation,
    setConfirmation,
    run,
    busy,
    retryRefresh,
  };
}
