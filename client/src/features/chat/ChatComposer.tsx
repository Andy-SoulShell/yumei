import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceRecordButton } from "@/components/VoiceRecordButton";
import { Camera, Keyboard, Loader2, Mic, Send } from "lucide-react";

import type { ChatController } from "./useChatController";
type Props = Pick<
  ChatController,
  | "handleSendMessage"
  | "setShowPoseDialog"
  | "sendMessage"
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

/** 组合文字输入、按住录音和图片入口，保持发送与录音互斥。 */
export function ChatComposer({
  handleSendMessage,
  setShowPoseDialog,
  sendMessage,
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
  return (
    <form
      onSubmit={handleSendMessage}
      className="chat-composer flex items-center gap-2 p-2 sm:p-4 border-t bg-card"
    >
      {/* 拍照按钮（打开姿势选择器；徽章显示剩余额度） */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setShowPoseDialog(true)}
        disabled={
          sendMessage.isPending ||
          generateSelfie.isPending ||
          generateCouple.isPending ||
          isRecording ||
          isTranscribing ||
          apiConfig?.imageProvider.configured === false ||
          (selfieRemaining !== null && selfieRemaining <= 0)
        }
        title={
          apiConfig?.imageProvider.configured === false
            ? t("chat:imageGenerationIsNotConfigured")
            : selfieRemaining === null || selfieRemaining === Infinity
              ? t("chat:askForASelfie")
              : selfieRemaining > 0
                ? t("chat:askForASelfieRemaining", { count: selfieRemaining })
                : t("chat:selfieQuotaReached")
        }
        className="relative shrink-0 text-primary hover:text-primary hover:bg-primary/10"
      >
        {generateSelfie.isPending || generateCouple.isPending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Camera className="w-5 h-5" />
        )}
        {selfieRemaining !== null && selfieRemaining !== Infinity && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 text-center">
            {selfieRemaining}
          </span>
        )}
      </Button>

      {inputMode === "text" ? (
        <>
          {/* 文字输入模式 */}
          <Input
            ref={inputRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t("chat:saySomethingTo", { name: girlfriend.name })}
            disabled={sendMessage.isPending || generateSelfie.isPending}
            className="flex-1"
          />
          {/* 语音切换按钮（输入框为空且浏览器支持时显示） */}
          {voiceSupported && !message.trim() ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => switchInputMode("voice")}
              disabled={sendMessage.isPending || generateSelfie.isPending}
              title={t("chat:switchToVoiceInput")}
              className="shrink-0 text-muted-foreground hover:text-primary"
            >
              <Mic className="w-5 h-5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={
                !message.trim() ||
                sendMessage.isPending ||
                generateSelfie.isPending
              }
              className="shrink-0"
            >
              {sendMessage.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          )}
        </>
      ) : (
        <>
          {/* 语音输入模式 */}
          <VoiceRecordButton
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            duration={duration}
            onStart={startRecording}
            onEnd={handleRecordingComplete}
            onCancel={cancelRecording}
            disabled={sendMessage.isPending || generateSelfie.isPending}
          />
          {/* 键盘切换按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => switchInputMode("text")}
            disabled={isRecording || isTranscribing}
            title={t("chat:switchToTextInput")}
            className="shrink-0 text-muted-foreground hover:text-primary"
          >
            <Keyboard className="w-5 h-5" />
          </Button>
        </>
      )}
    </form>
  );
}
