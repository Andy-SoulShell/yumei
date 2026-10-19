/** 按住录音、上滑取消与松手提交的指针交互组件。 */

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Loader2, Mic } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/** 父级维护的录音状态及开始、结束、取消回调。 */
interface VoiceRecordButtonProps {
  /** 录音状态由父组件或录音 Hook 驱动。 */
  isRecording: boolean;
  /** 音频是否正在提交并等待转写。 */
  isTranscribing: boolean;
  /** 当前录音时长，单位为秒。 */
  duration: number;
  /** 按下录音按钮时触发，授权和开始录音由父组件处理。 */
  onStart: () => void;
  /** 松开录音按钮且未进入取消区域时触发。 */
  onEnd: () => void;
  /** 松开时处于取消区域则触发，父组件应丢弃录音。 */
  onCancel: () => void;
  disabled?: boolean;
}

/** 将秒数格式化为分秒文本，供录音按钮展示。 */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** 将按下、松开和取消手势转成父组件回调，并显示秒级录音状态。 */
export function VoiceRecordButton({
  isRecording,
  isTranscribing,
  duration,
  onStart,
  onEnd,
  onCancel,
  disabled = false,
}: VoiceRecordButtonProps) {
  const { t } = useI18n();
  const [cancelZone, setCancelZone] = useState(false);
  const startYRef = useRef(0);
  const isActiveRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (
        disabled ||
        isActiveRef.current ||
        (e.pointerType === "mouse" && e.button !== 0)
      )
        return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      startYRef.current = e.clientY;
      isActiveRef.current = true;
      setCancelZone(false);
      onStart();
    },
    [disabled, onStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isActiveRef.current || !isRecording) return;
      const deltaY = startYRef.current - e.clientY;
      setCancelZone(deltaY > 80);
    },
    [isRecording]
  );

  const handlePointerUp = useCallback(() => {
    if (!isActiveRef.current) return;
    isActiveRef.current = false;
    if (cancelZone) {
      onCancel();
    } else {
      onEnd();
    }
    setCancelZone(false);
  }, [cancelZone, onCancel, onEnd]);

  /** 系统取消手势、失焦或 Escape 时丢弃录音，避免误发送。 */
  const cancelRecording = useCallback(() => {
    if (!isActiveRef.current) return;
    isActiveRef.current = false;
    setCancelZone(false);
    onCancel();
  }, [onCancel]);

  // 转写中状态
  if (isTranscribing) {
    return (
      <div className="flex-1 h-11 rounded-full bg-muted flex items-center justify-center gap-2 select-none">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          {t("voice:transcribing")}
        </span>
      </div>
    );
  }

  return (
    <Button
      variant="plain"
      size="none"
      type="button"
      disabled={disabled}
      className={`flex-1 h-11 rounded-full flex items-center justify-center gap-2 
        transition-all select-none touch-none cursor-pointer
        ${
          isRecording
            ? cancelZone
              ? "bg-red-500/20 text-red-500 scale-95"
              : "bg-primary/20 text-primary"
            : "bg-muted hover:bg-muted/80 text-muted-foreground"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelRecording}
      onLostPointerCapture={cancelRecording}
      onBlur={cancelRecording}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelRecording();
          return;
        }
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (disabled || event.repeat || isActiveRef.current) return;
        isActiveRef.current = true;
        setCancelZone(false);
        onStart();
      }}
      onKeyUp={event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        handlePointerUp();
      }}
    >
      {isRecording ? (
        <>
          {/* 波形动画 */}
          <div className="flex items-center gap-[3px]">
            {[0, 1, 2, 3, 4].map(i => (
              <span
                key={i}
                className={`w-[3px] rounded-full ${
                  cancelZone ? "bg-red-500" : "bg-primary"
                }`}
                style={{
                  height: "16px",
                  animation: `voiceWave 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </div>
          <span className="text-sm font-mono font-medium min-w-[40px]">
            {formatDuration(duration)}
          </span>
          <span className="text-xs opacity-80">
            {cancelZone ? t("voice:releaseToCancel") : t("voice:releaseToSend")}
          </span>
        </>
      ) : (
        <>
          <Mic className="w-4 h-4" />
          <span className="text-sm">{t("voice:holdToTalk")}</span>
        </>
      )}

      {/* 波形动画 CSS */}
      <style>{`
        @keyframes voiceWave {
          0% { height: 6px; }
          100% { height: 18px; }
        }
      `}</style>
    </Button>
  );
}
