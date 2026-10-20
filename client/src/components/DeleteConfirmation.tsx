/** 不可撤销的删除操作在同一个确认框内说明对象与后果。 */
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
export function DeleteConfirmation({
  children,
  subject,
  onConfirm,
  disabled,
}: {
  children: ReactNode;
  subject: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common:confirmDeletion")}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {subject} {t("common:cannotUndo")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={disabled} onClick={onConfirm}>
            {t("common:delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
