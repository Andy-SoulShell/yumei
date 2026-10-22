/** 录音转写的独立编辑区；确认或取消前不改变已有文字草稿。 */
import { useId, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import { ArrowUp, AudioLines, X } from "lucide-react";
import type { ChatController } from "./useChatController";

type Props = Pick<
  ChatController,
  "t" | "maxMessageLength" | "updateVoicePreview" | "discardVoicePreview"
> & {
  text: string;
  busy: boolean;
};

/** 在输入区预览转写，触屏回车保留换行并通过按钮确认发送。 */
export function ChatVoicePreview({
  text,
  t,
  maxMessageLength,
  busy,
  updateVoicePreview,
  discardVoicePreview,
}: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  useAutosizeTextarea(field, text);
  const tooLong =
    maxMessageLength !== undefined && text.trim().length > maxMessageLength;
  return (
    <div className="chat-voice-preview">
      <div className="chat-voice-preview-heading">
        <span
          className="flex min-w-0 items-center gap-2 text-sm font-medium"
          role="status"
        >
          <AudioLines className="size-4 shrink-0 text-primary" />
          {t("chat:voicePreviewTitle")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="chat-composer-tool"
          onClick={discardVoicePreview}
          aria-label={t("chat:discardVoicePreview")}
          title={t("chat:discardVoicePreview")}
        >
          <X />
        </Button>
      </div>
      <Textarea
        ref={field}
        rows={2}
        value={text}
        maxLength={maxMessageLength}
        onChange={event => updateVoicePreview(event.target.value)}
        aria-label={t("chat:voicePreviewText")}
        aria-describedby={hintId}
        aria-invalid={tooLong}
        className="chat-composer-input chat-transcript-input"
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
          if (!busy && text.trim() && !tooLong)
            event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="chat-voice-preview-footer">
        <p
          id={hintId}
          className={`min-w-0 text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
        >
          {tooLong
            ? t("chat:draftTooLong", { max: maxMessageLength! })
            : t("chat:voicePreviewHint")}
        </p>
        <Button
          type="submit"
          size="icon"
          className="chat-composer-send"
          aria-label={t("chat:sendVoicePreview")}
          title={t("chat:sendVoicePreview")}
          disabled={busy || !text.trim() || tooLong}
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  );
}
