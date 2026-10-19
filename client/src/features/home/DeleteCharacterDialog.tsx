import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import type { HomeController } from "./useHomeController";
type Props = Pick<
  HomeController,
  "deleteTarget" | "setDeleteTarget" | "t" | "deleteGirlfriend"
>;

/** 确认单个角色移入回收站及关联对话处理方式。 */
export function DeleteCharacterDialog({
  deleteTarget,
  setDeleteTarget,
  t,
  deleteGirlfriend,
}: Props) {
  return (
    <AlertDialog
      open={!!deleteTarget}
      onOpenChange={open => !open && setDeleteTarget(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deleteTarget?.isActive
              ? t("home:deleteActiveCompanion")
              : t("common:confirmDeletion")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {deleteTarget?.isActive && (
                <p className="text-amber-600 dark:text-amber-400 font-medium">
                  {t("home:deleteActive", { name: deleteTarget.name })}
                </p>
              )}
              <p>
                {deleteTarget?.isActive
                  ? t("home:doYouWantToContinue")
                  : t("home:deleteConfirm", {
                      name: deleteTarget?.name ?? "",
                    })}
                {t("home:thisCompanionWillBeMovedToTrashAnd")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              deleteTarget && deleteGirlfriend.mutate({ id: deleteTarget.id })
            }
            disabled={deleteGirlfriend.isPending}
          >
            {deleteGirlfriend.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {t("common:deleting")}
              </>
            ) : (
              t("common:moveToTrash")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
