import { useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import type { MemoryAction, MemoryFeedback } from "./types";
export function MemoryImpact({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
      <p>{t("memoryFlow:impactScope", { name })}</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>{t("memoryFlow:impactHistory")}</li>
        <li>{t("memoryFlow:impactContext")}</li>
      </ul>
      <p>{t("memoryFlow:impactPending")}</p>
      <p>{t("memoryFlow:relearn")}</p>
    </div>
  );
}
export function MemoryConfirmation({
  action,
  name,
  busy,
  feedback,
  onCancel,
  onConfirm,
  enabled,
}: {
  action: MemoryAction | null;
  name: string;
  busy: boolean;
  feedback: MemoryFeedback | null;
  onCancel: () => void;
  onConfirm: (action: MemoryAction) => void;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const title = useRef<HTMLHeadingElement>(null);
  if (!action || !["edit", "delete", "clear"].includes(action.type))
    return null;
  const kind = action.type as "edit" | "delete" | "clear";
  const failed = feedback?.status === "error";
  return (
    <AlertDialog
      open
      onOpenChange={open => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent
        className="memory-confirmation gap-4 p-4 sm:p-6"
        onEscapeKeyDown={event => {
          if (busy) event.preventDefault();
        }}
        onOpenAutoFocus={event => {
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          requestAnimationFrame(() =>
            document
              .getElementById(
                feedback?.status === "success"
                  ? "memory-result"
                  : kind === "edit"
                    ? `memory-edit-${"memory" in action ? action.memory.id : 0}`
                    : "memory-list-title"
              )
              ?.focus({ preventScroll: true })
          );
        }}
      >
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle ref={title} tabIndex={-1}>
            {t(`memoryFlow:${kind}Confirm`)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(`memoryFlow:${kind}Scope`, { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {"memory" in action && (
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t("memoryFlow:original")}
              </p>
              <p className="memory-text max-h-32 overflow-y-auto text-sm">
                {action.memory.content}
              </p>
            </div>
            {action.type === "edit" && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="mb-1 text-xs font-medium text-primary">
                  {t("memoryFlow:corrected")}
                </p>
                <p className="memory-text max-h-32 overflow-y-auto text-sm">
                  {action.content}
                </p>
              </div>
            )}
          </div>
        )}
        <MemoryImpact name={name} />
        {!enabled && kind === "edit" && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t("memoryFlow:paused")}
          </p>
        )}
        {(busy || failed) && (
          <p
            role={failed ? "alert" : "status"}
            className={`text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}
          >
            {t(
              busy
                ? "memoryFlow:working"
                : feedback?.conflict
                  ? "memoryFlow:conflict"
                  : "memoryFlow:failed"
            )}
          </p>
        )}
        <AlertDialogFooter>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={onCancel}
          >
            {t("common:cancel")}
          </Button>
          <Button
            variant={kind === "edit" ? "default" : "destructive"}
            className="min-h-11 whitespace-normal"
            disabled={busy || !!feedback?.conflict}
            onClick={() => onConfirm(action)}
          >
            {t(
              busy
                ? "memoryFlow:working"
                : failed
                  ? "memoryFlow:retry"
                  : kind === "edit"
                    ? "memoryFlow:confirmEdit"
                    : kind === "delete"
                      ? "memoryFlow:confirmDelete"
                      : "memoryFlow:confirmClear"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
