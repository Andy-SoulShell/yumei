import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useProductConfig } from "@/features/product/useProductConfig";
import { formDraftEpoch } from "@/lib/formDrafts";
import { chatInputDraftKey, writeChatInputDraft } from "@/lib/chatStreamDrafts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function ChatBranchDialog({
  conversationId,
  message,
  onClose,
  coinCost,
}: {
  conversationId: number;
  message: { id: number; content: string; role: string };
  onClose: () => void;
  coinCost?: number;
}) {
  const epoch = useRef(formDraftEpoch());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { t } = useI18n(),
    { user } = useAuth(),
    policy = useProductConfig(),
    [, navigate] = useLocation();
  const owner = useRef(user?.id);
  const current = useRef(user?.id);
  current.current = user?.id;
  const [content, setContent] = useState(message.content);
  const [error, setError] = useState("");
  const request = useRef<{ text: string; id: string } | null>(null);
  const utils = trpc.useUtils();
  const mutation = trpc.conversation.branch.useMutation({
    onSuccess: result => {
      if (
        !mounted.current ||
        epoch.current !== formDraftEpoch() ||
        current.current !== owner.current
      )
        return;
      writeChatInputDraft(
        chatInputDraftKey(owner.current, result.id),
        result.draft
      );
      void utils.conversation.invalidate();
      if (!result.accepted) toast.info(t("studio:branchDraftSaved"));
      onClose();
      navigate(`/chat/${result.id}`);
    },
    onError: () => setError(t("economy:error")),
  });
  const editing = message.role === "user";
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!mutation.isPending}
        onEscapeKeyDown={event => {
          if (mutation.isPending) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(editing ? "studio:editMessage" : "studio:regenerateReply")}
          </DialogTitle>
          <DialogDescription>{t("studio:branchHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            const text = editing ? content.trim() : "";
            if (!request.current || request.current.text !== text)
              request.current = { text, id: crypto.randomUUID() };
            mutation.mutate({
              conversationId,
              messageId: message.id,
              clientRequestId: request.current.id,
              ...(editing ? { content: text } : {}),
            });
          }}
        >
          {editing && (
            <label className="block text-sm">
              {t("chat:you")}
              <Textarea
                className="mt-2 min-h-32 text-base"
                value={content}
                required
                maxLength={policy.raw?.runtime.chat.maxInputChars ?? 10000}
                onChange={event => setContent(event.target.value)}
                disabled={mutation.isPending}
              />
            </label>
          )}
          {coinCost !== undefined && (
            <p role="status" className="text-sm">
              {t("economy:cost", { count: coinCost })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {t("common:cancel")}
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                !policy.raw ||
                (editing && !content.trim())
              }
            >
              {mutation.isPending
                ? t("auth:working")
                : t("studio:branchAndGenerate")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
