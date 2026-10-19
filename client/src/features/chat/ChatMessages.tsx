import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { detectSelfieRequest } from "@shared/selfieRequest";
import { Heart, Loader2, Volume2 } from "lucide-react";

import type { ChatController } from "./useChatController";
type Props = Pick<
  ChatController,
  | "ttsLabel"
  | "messageListRef"
  | "messagesQuery"
  | "loadOlderMessages"
  | "t"
  | "chatMessages"
  | "sendMessage"
  | "handleSpeakMessage"
  | "isSpeaking"
  | "user"
  | "pendingMessageAfterId"
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
  sendMessage,
  girlfriend,
  handleSpeakMessage,
  isSpeaking,
  user,
  pendingMessageAfterId,
  generateSelfie,
  generateCouple,
  messagesEndRef,
}: Props) {
  return (
    <div
      ref={messageListRef}
      className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4"
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
      {!chatMessages || chatMessages.length === 0
        ? !sendMessage.isPending && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Heart className="w-12 h-12 text-primary mb-4" />
              <p className="text-muted-foreground">
                {t("chat:empty.start", { name: girlfriend.name })}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t("chat:askForASelfieOrTapTheCamera")}
              </p>
            </div>
          )
        : chatMessages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {msg.role === "assistant" && (
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarImage
                    src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
                    alt={girlfriend.name}
                  />
                  <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
                </Avatar>
              )}

              <div className="flex flex-col gap-1 max-w-[80%] sm:max-w-[75%]">
                <div
                  className={`rounded-2xl px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.imageUrl ? (
                    <div className="space-y-2">
                      <Button
                        asChild
                        variant="plain"
                        size="none"
                        className="block h-auto max-w-full rounded-lg"
                      >
                        <a
                          href={msg.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("chat:selfie")}
                        >
                          <img
                            src={msg.imageUrl}
                            alt={t("chat:selfie")}
                            className="rounded-lg max-w-full max-h-[65vh] w-auto h-auto object-contain"
                          />
                        </a>
                      </Button>
                      {msg.content && msg.content !== "[自拍照片]" && (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  )}
                </div>

                {/* AI 消息的语音播放按钮 */}
                {msg.role === "assistant" &&
                  msg.content &&
                  msg.content !== "[自拍照片]" && (
                    <Button
                      variant="plain"
                      size="none"
                      type="button"
                      onClick={() => handleSpeakMessage(msg.content)}
                      className="self-start ml-1 text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                      title={t("chat:playAudio", {
                        suffix: ttsLabel ? ` (${ttsLabel})` : "",
                      })}
                    >
                      {isSpeaking ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
              </div>

              {msg.role === "user" && (
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback>
                    {user?.name?.[0] || t("chat:u")}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

      {sendMessage.isPending &&
        sendMessage.variables &&
        !chatMessages?.some(
          msg =>
            msg.id > pendingMessageAfterId.current &&
            msg.role === "user" &&
            msg.content === sendMessage.variables?.content
        ) && (
          <div className="flex justify-end gap-3">
            <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[80%] whitespace-pre-wrap">
              {sendMessage.variables.content}
            </div>
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback>{user?.name?.[0] || t("chat:u")}</AvatarFallback>
            </Avatar>
          </div>
        )}

      {sendMessage.isPending && (
        <div className="flex gap-3">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage
              src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
              alt={girlfriend.name}
            />
            <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
          </Avatar>
          <div className="bg-muted rounded-2xl px-4 py-3">
            {detectSelfieRequest(sendMessage.variables?.content || "") ? (
              <div
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("chat:yourSelfieIsQueuedOrBeingGeneratedPlease")}
              </div>
            ) : (
              <div className="flex gap-1.5">
                <span
                  className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                ></span>
                <span
                  className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                ></span>
                <span
                  className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                ></span>
              </div>
            )}
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
  );
}
