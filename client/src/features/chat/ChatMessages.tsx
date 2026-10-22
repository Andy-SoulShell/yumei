import { PhotoViewer } from "@/components/PhotoViewer";
import { downloadImage } from "@/lib/downloadImage";
import { toast } from "sonner";
import { PageError } from "@/components/PageError";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useChatScrollAnchor } from "@/hooks/useChatScrollAnchor";

import { ChatMessage } from "./ChatMessage";
import { ChatStarters } from "./ChatStarters";
import type { ChatController } from "./useChatController";
type Props = Pick<
  ChatController,
  | "ttsLabel"
  | "messageListRef"
  | "messagesQuery"
  | "loadOlderMessages"
  | "t"
  | "chatMessages"
  | "failedMessages"
  | "retryMessage"
  | "currentConversationId"
  | "sendMediaMessage"
  | "isAccepting"
  | "chatStream"
  | "retryStreamSubmission"
  | "retryFailedGeneration"
  | "handleSpeakMessage"
  | "insertChatDraft"
  | "quoteMessage"
  | "isRecording"
  | "isTranscribing"
  | "isSpeaking"
  | "activeMessageId"
  | "user"
  | "pendingMediaAfterId"
  | "generateSelfie"
  | "generateCouple"
  | "messagesEndRef"
> & { girlfriend: NonNullable<ChatController["girlfriend"]> };

/** 展示分页消息、图片和生成状态，并保留历史消息加载入口。 */
export function ChatMessages({
  ttsLabel,
  messageListRef,
  messagesQuery,
  loadOlderMessages,
  t,
  chatMessages,
  failedMessages,
  retryMessage,
  currentConversationId,
  sendMediaMessage,
  isAccepting,
  chatStream,
  retryStreamSubmission,
  retryFailedGeneration,
  girlfriend,
  handleSpeakMessage,
  insertChatDraft,
  quoteMessage,
  isRecording,
  isTranscribing,
  isSpeaking,
  activeMessageId,
  user,
  pendingMediaAfterId,
  generateSelfie,
  generateCouple,
  messagesEndRef,
}: Props) {
  const [viewing, setViewing] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const photos = useMemo(
    () =>
      (chatMessages ?? [])
        .filter(msg => msg.imageUrl)
        .map(msg => ({
          id: msg.id,
          imageUrl: msg.imageUrl!,
          caption: msg.content === "[自拍照片]" ? null : msg.content,
        })),
    [chatMessages]
  );
  const viewPhoto = useCallback((id: number, button: HTMLButtonElement) => {
    opener.current = button;
    setViewing(id);
  }, []);
  const firstUserId = chatMessages.find(msg => msg.role === "user")?.id;
  const retryBusy =
    isAccepting || generateSelfie.isPending || generateCouple.isPending;
  const contentRef = useRef<HTMLDivElement>(null);
  useChatScrollAnchor(messageListRef, contentRef, currentConversationId);
  return (
    <div
      ref={messageListRef}
      className="chat-messages flex-1 min-h-0 overflow-y-auto p-3 sm:p-4"
    >
      <div
        ref={contentRef}
        className="chat-messages-content space-y-3 sm:space-y-4"
      >
        {messagesQuery.hasNextPage && (
          <Button
            variant="outline"
            disabled={messagesQuery.isFetchingNextPage}
            onClick={() => void loadOlderMessages()}
          >
            {t("common:loadMore")}
          </Button>
        )}
        {messagesQuery.isLoading && (
          <div className="flex justify-center py-12">
            <Loader2
              className="size-6 animate-spin"
              aria-label={t("auth:working")}
            />
          </div>
        )}
        {messagesQuery.error && !chatMessages?.length && (
          <PageError onRetry={() => void messagesQuery.refetch()} />
        )}
        {!chatMessages || chatMessages.length === 0
          ? !messagesQuery.error &&
            !messagesQuery.isLoading &&
            !isAccepting && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Heart className="w-12 h-12 text-primary mb-4" />
                <p className="text-muted-foreground">
                  {t("chat:empty.start", { name: girlfriend.name })}
                </p>
                <ChatStarters
                  name={girlfriend.name}
                  t={t}
                  onSelect={insertChatDraft}
                  disabled={isRecording || isTranscribing}
                />
              </div>
            )
          : chatMessages.map(msg => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                companionName={girlfriend.name}
                companionImage={
                  girlfriend.avatarUrl || girlfriend.referenceImageUrl
                }
                userInitial={user?.name?.[0] || t("chat:u")}
                t={t}
                ttsLabel={ttsLabel}
                isPlaying={isSpeaking && activeMessageId === msg.id}
                retryDisabled={
                  msg.generationStatus === "failed" &&
                  (retryBusy ||
                    firstUserId === undefined ||
                    firstUserId >= msg.id)
                }
                onRetry={
                  msg.generationStatus === "failed"
                    ? retryFailedGeneration
                    : undefined
                }
                onSpeak={handleSpeakMessage}
                onQuote={quoteMessage}
                onViewPhoto={msg.imageUrl ? viewPhoto : undefined}
              />
            ))}

        {failedMessages
          .filter(
            item =>
              item.conversationId === currentConversationId &&
              !(
                sendMediaMessage.isPending &&
                sendMediaMessage.variables?.content === item.content
              )
          )
          .map((item, index) => (
            <div key={index} className="flex flex-col items-end gap-1.5">
              <div className="max-w-[80%] rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {item.content}
              </div>
              <div className="flex items-center gap-2 text-xs text-destructive">
                <span role="status">{t("chat:messageNotSent")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={
                    isAccepting ||
                    generateSelfie.isPending ||
                    generateCouple.isPending
                  }
                  onClick={() => retryMessage(item)}
                >
                  {t("explore:retry")}
                </Button>
              </div>
            </div>
          ))}

        {chatStream.failures.map(item => (
          <div
            key={item.submission.clientRequestId}
            className="flex flex-col items-end gap-1.5"
          >
            <div className="max-w-[80%] rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-2 whitespace-pre-wrap break-words">
              {item.submission.content}
            </div>
            <div className="flex items-center gap-2 text-xs text-destructive">
              <span role="status">
                {t(
                  item.uncertain
                    ? "chat:streamNetworkUnknown"
                    : "chat:messageNotSent"
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  isAccepting ||
                  generateSelfie.isPending ||
                  generateCouple.isPending
                }
                onClick={() => retryStreamSubmission(item)}
              >
                {t("explore:retry")}
              </Button>
            </div>
          </div>
        ))}

        {chatStream.pending &&
          !chatStream.turns.some(
            turn => turn.clientRequestId === chatStream.pending?.clientRequestId
          ) && (
            <div className="flex justify-end gap-3">
              <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground whitespace-pre-wrap">
                {chatStream.pending.content}
              </div>
              <Avatar className="size-8 shrink-0">
                <AvatarFallback>
                  {user?.name?.[0] || t("chat:u")}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

        {sendMediaMessage.isPending &&
          sendMediaMessage.variables &&
          !chatMessages?.some(
            msg =>
              msg.id > pendingMediaAfterId.current &&
              msg.role === "user" &&
              msg.content === sendMediaMessage.variables?.content
          ) && (
            <div className="flex justify-end gap-3">
              <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[80%] whitespace-pre-wrap">
                {sendMediaMessage.variables.content}
              </div>
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback>
                  {user?.name?.[0] || t("chat:u")}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

        {sendMediaMessage.isPending && (
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage
                src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
                alt={girlfriend.name}
              />
              <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
            </Avatar>
            <div className="bg-muted rounded-2xl px-4 py-3">
              <div
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("chat:yourSelfieIsQueuedOrBeingGeneratedPlease")}
              </div>
            </div>
          </div>
        )}

        {(generateSelfie.isPending || generateCouple.isPending) && (
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage
                src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
                alt={girlfriend.name}
              />
              <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
            </Avatar>
            <div className="bg-muted rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("chat:yourImageIsQueuedOrBeingGeneratedPlease")}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      <PhotoViewer
        photos={photos}
        index={
          viewing === null
            ? null
            : photos.findIndex(photo => photo.id === viewing)
        }
        onIndexChange={index =>
          setViewing(index === null ? null : (photos[index]?.id ?? null))
        }
        returnFocus={opener}
        onDownload={async photo => {
          try {
            await downloadImage(photo.imageUrl, photo.id);
          } catch {
            toast.error(t("gallery:downloadFailed"));
          }
        }}
      />
    </div>
  );
}
