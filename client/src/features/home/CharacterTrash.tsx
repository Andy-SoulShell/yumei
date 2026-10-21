import { DeleteConfirmation } from "@/components/DeleteConfirmation";
import { PageError } from "@/components/PageError";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Trash, Trash2, Undo2 } from "lucide-react";
import type { HomeController } from "./useHomeController";
type Props = Pick<
  HomeController,
  | "trashDays"
  | "trashOpen"
  | "setTrashOpen"
  | "t"
  | "trashItems"
  | "trashLoading"
  | "trashError"
  | "refetchTrash"
  | "getRemainingDays"
  | "restoreGirlfriend"
  | "permanentDelete"
>;

/** 展示回收站角色及恢复、永久删除操作。 */
export function CharacterTrash({
  trashDays,
  trashOpen,
  setTrashOpen,
  t,
  trashItems,
  trashLoading,
  trashError,
  refetchTrash,
  getRemainingDays,
  restoreGirlfriend,
  permanentDelete,
}: Props) {
  return (
    <Sheet open={trashOpen} onOpenChange={setTrashOpen}>
      <SheetContent side="right" className="w-[85vw] max-w-[360px] p-0">
        <SheetHeader className="p-4 pb-3">
          <SheetTitle className="flex items-center gap-2">
            <Trash className="w-5 h-5 text-destructive" />
            {t("home:trash")}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t("home:deletedCompanionsAreKeptFor7DaysBefore", {
              days: trashDays,
            })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          {trashLoading ? (
            <div className="flex justify-center py-16">
              <Loader2
                className="size-6 animate-spin"
                aria-label={t("auth:working")}
              />
            </div>
          ) : trashError && !trashItems ? (
            <PageError onRetry={() => void refetchTrash()} />
          ) : !trashItems || trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Trash className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("home:trashIsEmpty")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {trashItems.map(gf => {
                const remaining = getRemainingDays(gf.deletedAt);
                return (
                  <div
                    key={gf.id}
                    className="px-4 py-3 flex items-center gap-3"
                  >
                    <Avatar className="w-12 h-12 flex-shrink-0 opacity-60">
                      <AvatarImage src={gf.referenceImageUrl} alt={gf.name} />
                      <AvatarFallback>{gf.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{gf.name}</p>
                      <p className="text-xs text-destructive">
                        {remaining > 0
                          ? t("home:permanentlyDeletedInDays", {
                              count: remaining,
                            })
                          : t("home:deletionPending")}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => restoreGirlfriend.mutate({ id: gf.id })}
                        disabled={restoreGirlfriend.isPending}
                      >
                        <Undo2 className="w-3 h-3 mr-1" />
                        {t("home:restore")}
                      </Button>
                      <DeleteConfirmation
                        subject={gf.name}
                        onConfirm={() => permanentDelete.mutate({ id: gf.id })}
                        disabled={permanentDelete.isPending}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive border-destructive/30"
                          disabled={permanentDelete.isPending}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          {t("home:deletePermanently")}
                        </Button>
                      </DeleteConfirmation>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
