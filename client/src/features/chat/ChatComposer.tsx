import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecordButton } from "@/components/VoiceRecordButton";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import { flushSync } from "react-dom";
import { ArrowUp, Camera, Keyboard, Loader2, Mic, Square } from "lucide-react";

import type { ChatController } from "./useChatController";
type Props = Pick<
  ChatController,
  | "maxMessageLength"
  | "handleSendMessage"
  | "setShowPoseDialog"
  | "isAccepting"
  | "chatStream"
  | "handleStopGeneration"
  | "generateSelfie"
  | "generateCouple"
  | "isRecording"
  | "isTranscribing"
  | "apiConfig"
  | "selfieRemaining"
  | "t"
  | "inputMode"
  | "inputRef"
  | "message"
  | "setMessage"
  | "voiceSupported"
  | "switchInputMode"
  | "duration"
  | "startRecording"
  | "handleRecordingComplete"
  | "cancelRecording"
> & { girlfriend: NonNullable<ChatController["girlfriend"]> };

/** 紧凑输入区支持多行草稿；等待回复时仍可继续输入。 */
export function ChatComposer({
  maxMessageLength,
  handleSendMessage,
  setShowPoseDialog,
  isAccepting,
  chatStream,
  handleStopGeneration,
  generateSelfie,
  generateCouple,
  isRecording,
  isTranscribing,
  apiConfig,
  selfieRemaining,
  t,
  inputMode,
  inputRef,
  message,
  setMessage,
  girlfriend,
  voiceSupported,
  switchInputMode,
  duration,
  startRecording,
  handleRecordingComplete,
  cancelRecording,
}: Props) {
  // 已保存的语音偏好不能阻止不支持录音的环境继续使用文字聊天。
  const textInput = inputMode === "text" || !voiceSupported;
  useAutosizeTextarea(inputRef, message, textInput);
  const busy =
    isAccepting ||
    generateSelfie.isPending ||
    generateCouple.isPending ||
    isRecording ||
    isTranscribing;
  const photoLabel =
    apiConfig?.imageProvider.configured === false
      ? t("chat:imageGenerationIsNotConfigured")
      : selfieRemaining === null || selfieRemaining === Infinity
        ? t("chat:askForASelfie")
        : selfieRemaining > 0
          ? t("chat:askForASelfieRemaining", { count: selfieRemaining })
          : t("chat:selfieQuotaReached");

  return (
    <form onSubmit={handleSendMessage} className="chat-composer">
      <div className="chat-composer-surface">
        {(chatStream.isGenerating ||
          chatStream.connection === "reconnecting") && (
          <div className="chat-composer-status">
            <span className="chat-composer-state" role="status">
              {chatStream.connection === "reconnecting" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <span className="chat-composer-state-dot" aria-hidden="true" />
              )}
              <span>
                {t(
                  chatStream.connection === "reconnecting"
                    ? "chat:streamReconnecting"
                    : "chat:streamGenerating"
                )}
                {chatStream.connection !== "reconnecting" && (
                  <span className="chat-composer-hint">
                    {t("chat:streamSupplementHint")}
                  </span>
                )}
              </span>
            </span>
            {chatStream.isGenerating && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="chat-composer-stop"
                aria-label={t("chat:streamStop")}
                disabled={chatStream.isStopping || isAccepting}
                onClick={() => void handleStopGeneration()}
              >
                {chatStream.isStopping ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Square className="size-3" />
                )}
                {t("chat:streamStop")}
              </Button>
            )}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowPoseDialog(true)}
          disabled={
            busy ||
            apiConfig?.imageProvider.configured === false ||
            (selfieRemaining !== null && selfieRemaining <= 0)
          }
          aria-label={photoLabel}
          title={photoLabel}
          className="chat-composer-tool relative"
        >
          {generateSelfie.isPending || generateCouple.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Camera />
          )}
          {selfieRemaining !== null && selfieRemaining !== Infinity && (
            <span className="chat-photo-quota" aria-hidden="true">
              {selfieRemaining}
            </span>
          )}
        </Button>

        {textInput ? (
          <>
            <Textarea
              ref={inputRef}
              rows={1}
              maxLength={maxMessageLength}
              value={message}
              onChange={event => setMessage(event.target.value)}
              placeholder={t("chat:messagePlaceholder")}
              aria-label={t("chat:saySomethingTo", { name: girlfriend.name })}
              className="chat-composer-input"
              onKeyDown={event => {
                if (
                  event.key !== "Enter" ||
                  event.shiftKey ||
                  event.altKey ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229
                )
                  return;
                const desktop = window.matchMedia?.(
                  "(hover: hover) and (pointer: fine)"
                ).matches;
                if (!desktop && !event.ctrlKey && !event.metaKey) return;
                event.preventDefault();
                if (!busy && message.trim())
                  event.currentTarget.form?.requestSubmit();
              }}
            />
            {voiceSupported && !message.trim() && !isAccepting ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => switchInputMode("voice")}
                disabled={busy}
                aria-label={t("chat:switchToVoiceInput")}
                title={t("chat:switchToVoiceInput")}
                className="chat-composer-tool"
              >
                <Mic />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!message.trim() || busy}
                aria-label={t("chat:sendMessage")}
                title={t("chat:sendMessage")}
                className="chat-composer-send"
                onMouseDown={event => {
                  // 保留焦点；不取消 pointerdown，避免 Safari 吞掉触摸 click。
                  if (event.button === 0) event.preventDefault();
                }}
              >
                {isAccepting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ArrowUp />
                )}
              </Button>
            )}
          </>
        ) : (
          <>
            <VoiceRecordButton
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              duration={duration}
              onStart={startRecording}
              onEnd={handleRecordingComplete}
              onCancel={cancelRecording}
              disabled={
                isAccepting ||
                generateSelfie.isPending ||
                generateCouple.isPending
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                // 在点击手势内挂载并聚焦，兼容 iOS 的软键盘唤起规则。
                flushSync(() => switchInputMode("text"));
                inputRef.current?.focus({ preventScroll: true });
              }}
              disabled={isRecording || isTranscribing}
              aria-label={t("chat:switchToTextInput")}
              title={t("chat:switchToTextInput")}
              className="chat-composer-tool"
            >
              <Keyboard />
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
