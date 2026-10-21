/** 单条消息独立复用，输入草稿和其他轮次更新时不重绘整段历史。 */
import { memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Square, Volume2 } from "lucide-react";
import type { ChatController } from "./useChatController";

type Props = {
  msg: ChatController["chatMessages"][number];
  companionName: string;
  companionImage?: string | null;
  userInitial: string;
  t: ChatController["t"];
  ttsLabel: string;
  isPlaying: boolean;
  retryDisabled: boolean;
  onRetry?: (id: number) => void;
  onSpeak: ChatController["handleSpeakMessage"];
  onViewPhoto?: (id: number, opener: HTMLButtonElement) => void;
};

function sameMessage(a: Props["msg"], b: Props["msg"]) {
  if (a === b) return true;
  const left = a.segments ?? [];
  const right = b.segments ?? [];
  // 刷新会重建 Date 和片段对象；比较实际显示值，避免结束回复时重绘整页。
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.content === b.content &&
    a.imageUrl === b.imageUrl &&
    a.generationStatus === b.generationStatus &&
    left.length === right.length &&
    left.every(
      (segment, i) =>
        segment.id === right[i].id && segment.content === right[i].content
    )
  );
}

function sameProps(a: Props, b: Props) {
  return (
    sameMessage(a.msg, b.msg) &&
    a.companionName === b.companionName &&
    a.companionImage === b.companionImage &&
    a.userInitial === b.userInitial &&
    a.t === b.t &&
    a.ttsLabel === b.ttsLabel &&
    a.isPlaying === b.isPlaying &&
    a.retryDisabled === b.retryDisabled &&
    a.onRetry === b.onRetry &&
    a.onSpeak === b.onSpeak &&
    a.onViewPhoto === b.onViewPhoto
  );
}
export const ChatMessage = memo(function ChatMessage({
  msg,
  companionName,
  companionImage,
  userInitial,
  t,
  ttsLabel,
  isPlaying,
  retryDisabled,
  onRetry,
  onSpeak,
  onViewPhoto,
}: Props) {
  return (
    <div
      data-message-id={msg.id}
      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "flex-row"}`}
    >
      {msg.role === "assistant" && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={companionImage || undefined} alt={companionName} />
          <AvatarFallback>{companionName[0]}</AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col gap-1 max-w-[80%] sm:max-w-[75%]">
        {msg.role === "assistant" &&
          !msg.imageUrl &&
          msg.segments
            ?.filter(segment => segment.content.trim())
            .map(segment => (
              <div
                key={segment.id}
                data-segment-id={segment.id}
                className="chat-bubble-assistant rounded-2xl bg-muted px-4 py-2 text-foreground"
              >
                <p className="whitespace-pre-wrap break-words">
                  {segment.content}
                </p>
              </div>
            ))}
        {(!msg.segments?.length || msg.role === "user" || msg.imageUrl) &&
          (msg.content || msg.imageUrl) && (
            <div
              className={`rounded-2xl px-4 py-2 ${
                msg.role === "user"
                  ? "chat-bubble-user bg-primary text-primary-foreground"
                  : "chat-bubble-assistant bg-muted text-foreground"
              }`}
            >
              {msg.imageUrl ? (
                <div className="space-y-2">
                  <Button
                    variant="plain"
                    size="none"
                    className="block h-auto max-w-full rounded-lg cursor-zoom-in"
                    aria-label={t("chat:selfie")}
                    onClick={event =>
                      onViewPhoto?.(msg.id, event.currentTarget)
                    }
                  >
                    <img
                      src={msg.imageUrl}
                      alt={t("chat:selfie")}
                      loading="lazy"
                      decoding="async"
                      className="rounded-lg max-w-full max-h-[65vh] w-auto h-auto object-contain"
                    />
                  </Button>
                  {msg.content && msg.content !== "[自拍照片]" && (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              )}
            </div>
          )}
        {msg.role === "assistant" &&
          msg.generationStatus &&
          msg.generationStatus !== "succeeded" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span role="status">
                {t(
                  msg.generationStatus === "stopped"
                    ? "chat:streamStopped"
                    : msg.generationStatus === "failed"
                      ? "chat:streamFailed"
                      : "chat:streamGenerating"
                )}
              </span>
              {msg.generationStatus === "failed" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={retryDisabled}
                  onClick={() => onRetry?.(msg.id)}
                >
                  {t("explore:retry")}
                </Button>
              )}
            </div>
          )}

        {/* AI 消息的语音播放按钮 */}
        {msg.role === "assistant" &&
          msg.content &&
          msg.content !== "[自拍照片]" && (
            <Button
              variant="plain"
              size="none"
              type="button"
              onClick={() => onSpeak(msg.content, msg.id)}
              className="self-start size-8 rounded-full text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
              aria-pressed={isPlaying}
              aria-label={
                isPlaying
                  ? t("chat:stopAudio")
                  : t("chat:playAudio", {
                      suffix: ttsLabel ? ` (${ttsLabel})` : "",
                    })
              }
              title={
                isPlaying
                  ? t("chat:stopAudio")
                  : t("chat:playAudio", {
                      suffix: ttsLabel ? ` (${ttsLabel})` : "",
                    })
              }
            >
              {isPlaying ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
      </div>

      {msg.role === "user" && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarFallback>{userInitial}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}, sameProps);
