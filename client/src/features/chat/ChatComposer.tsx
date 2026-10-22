import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecordButton } from "@/components/VoiceRecordButton";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useId, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowUp,
  Camera,
  Heart,
  Keyboard,
  Loader2,
  MessageCircle,
  Mic,
  Plus,
  Square,
} from "lucide-react";
import { ChatVoicePreview } from "./ChatVoicePreview";
import { ChatQuoteCard } from "./ChatQuoteCard";
import { VideoComposer } from "./VideoComposer";
import { formatChatQuote, parseChatQuote } from "./chatQuote";

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
  | "insertChatDraft"
  | "jumpToQuote"
  | "jumpingFromMessageId"
  | "voicePreview"
  | "updateVoicePreview"
  | "discardVoicePreview"
  | "sendVoicePreview"
> &
  Partial<Pick<ChatController, "currentConversationId" | "chatMessages">> & {
    girlfriend: NonNullable<ChatController["girlfriend"]>;
  };

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
  currentConversationId,
  chatMessages,
  voiceSupported,
  switchInputMode,
  duration,
  startRecording,
  handleRecordingComplete,
  cancelRecording,
  insertChatDraft,
  jumpToQuote,
  jumpingFromMessageId,
  voicePreview,
  updateVoicePreview,
  discardVoicePreview,
  sendVoicePreview,
}: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsId = useId();
  // 已保存的语音偏好不能阻止不支持录音的环境继续使用文字聊天。
  const textInput = inputMode === "text" || !voiceSupported;
  const quote = parseChatQuote(message);
  const draftText = quote?.reply ?? message;
  const textLimit =
    maxMessageLength === undefined
      ? undefined
      : Math.max(
          0,
          maxMessageLength - (quote ? formatChatQuote(quote, "").length : 0)
        );
  useAutosizeTextarea(inputRef, draftText, textInput && !voicePreview);
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
    <form
      onSubmit={event => {
        if (voicePreview) {
          event.preventDefault();
          sendVoicePreview();
        } else handleSendMessage(event);
      }}
      className="chat-composer"
    >
      <Collapsible
        open={toolsOpen && !voicePreview}
        onOpenChange={setToolsOpen}
      >
        <CollapsibleContent id={toolsId} className="chat-quick-panel">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("chat:draftSuggestionHint")}
          </p>
          <div
            className="chat-quick-actions"
            role="group"
            aria-label={t("chat:quickCompanionActions")}
          >
            {currentConversationId && (
              <VideoComposer
                key={currentConversationId}
                conversationId={currentConversationId}
                referenceImage={girlfriend.referenceImageUrl}
                intimacyPoints={girlfriend.intimacyPoints}
                draft={draftText}
                photos={(chatMessages ?? [])
                  .filter(
                    item => !!item.imageUrl && item.generationKind !== "video"
                  )
                  .map(item => ({ id: item.id, imageUrl: item.imageUrl! }))}
                disabled={busy}
              />
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setToolsOpen(false);
                insertChatDraft(
                  t("chat:comfortDraft", { name: girlfriend.name })
                );
              }}
            >
              <Heart />
              {t("chat:comfortAction")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setToolsOpen(false);
                insertChatDraft(t("chat:changeTopicDraft"));
              }}
            >
              <MessageCircle />
              {t("chat:changeTopicAction")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setToolsOpen(false);
                setShowPoseDialog(true);
              }}
              disabled={
                busy ||
                apiConfig?.imageProvider.configured === false ||
                (selfieRemaining !== null && selfieRemaining <= 0)
              }
              aria-label={photoLabel}
              title={photoLabel}
            >
              <Camera />
              {t("chat:askForASelfie")}
              {selfieRemaining !== null && selfieRemaining !== Infinity && (
                <span className="chat-quick-quota">{selfieRemaining}</span>
              )}
            </Button>
          </div>
        </CollapsibleContent>
        <div className="chat-composer-surface">
          {(chatStream.isGenerating ||
            chatStream.connection === "reconnecting") && (
            <div className="chat-composer-status">
              <span className="chat-composer-state" role="status">
                {chatStream.connection === "reconnecting" ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="chat-composer-state-dot"
                    aria-hidden="true"
                  />
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
          {voicePreview ? (
            <ChatVoicePreview
              text={voicePreview.text}
              t={t}
              maxMessageLength={maxMessageLength}
              busy={busy}
              updateVoicePreview={updateVoicePreview}
              discardVoicePreview={discardVoicePreview}
            />
          ) : (
            <>
              {quote && textInput && (
                <div className="chat-composer-quote">
                  <ChatQuoteCard
                    author={quote.author}
                    text={quote.text}
                    onNavigate={
                      jumpToQuote ? () => void jumpToQuote(quote) : undefined
                    }
                    navigateLabel={t(
                      jumpingFromMessageId === 0
                        ? "chat:loadingOriginal"
                        : "chat:jumpToOriginal"
                    )}
                    loading={jumpingFromMessageId === 0}
                    removeLabel={t("chat:removeQuote")}
                    onRemove={() => {
                      flushSync(() => setMessage(draftText));
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                  />
                </div>
              )}
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={t("chat:quickCompanionActions")}
                  title={t("chat:quickCompanionActions")}
                  aria-controls={toolsId}
                  className="chat-composer-tool relative"
                >
                  {generateSelfie.isPending || generateCouple.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus className={toolsOpen ? "rotate-45" : ""} />
                  )}
                </Button>
              </CollapsibleTrigger>

              {textInput ? (
                <>
                  <Textarea
                    ref={inputRef}
                    rows={1}
                    maxLength={textLimit}
                    value={draftText}
                    onChange={event =>
                      setMessage(
                        quote
                          ? formatChatQuote(quote, event.target.value)
                          : event.target.value
                      )
                    }
                    placeholder={t("chat:messagePlaceholder")}
                    aria-label={t("chat:saySomethingTo", {
                      name: girlfriend.name,
                    })}
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
                      if (!busy && draftText.trim())
                        event.currentTarget.form?.requestSubmit();
                    }}
                  />
                  {voiceSupported &&
                  !quote &&
                  !draftText.trim() &&
                  !isAccepting ? (
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
                      disabled={!draftText.trim() || busy}
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
                    onClick={event => {
                      // 同步切换会把此按钮复用为发送按钮，阻止同一次点击的默认提交。
                      event.preventDefault();
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
            </>
          )}
        </div>
      </Collapsible>
    </form>
  );
}
