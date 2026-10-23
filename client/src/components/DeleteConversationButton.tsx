import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { clearConversationChatDrafts } from "@/lib/chatStreamDrafts";
import { clearPrivateMediaCaches } from "@/lib/privateMediaCache";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
export function DeleteConversationButton({ id }: { id: number }) {
  const { user } = useAuth();
  const { t } = useI18n(),
    utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const remove = trpc.conversation.delete.useMutation({
    onSuccess: async () => {
      if (user) clearConversationChatDrafts(user.id, id);
      await clearPrivateMediaCaches().catch(() => {});
      await utils.conversation.invalidate();
      await utils.memory.invalidate();
      await utils.girlfriend.invalidate();
      setOpen(false);
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="shrink-0 text-destructive">
          {t("privacy:deleteConversation")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("privacy:deleteConversation")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("privacy:conversationWarning")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert">{t("auth:networkErrorPleaseTryAgain")}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {t("common:cancel")}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ id })}
          >
            {t("privacy:deleteConversation")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
