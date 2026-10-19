import { Loader2, Mic } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface VoiceRecordButtonProps {
  isRecording: boolean;
  isTranscribing: boolean;
  duration: number;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecordButton({
  isRecording,
  isTranscribing,
  duration,
  onStart,
  onEnd,
  onCancel,
  disabled = false,
}: VoiceRecordButtonProps) {
  const [cancelZone, setCancelZone] = useState(false);
  const startYRef = useRef(0);
  const isActiveRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
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

  // 转写中状态
  if (isTranscribing) {
    return (
      <div className="flex-1 h-11 rounded-full bg-muted flex items-center justify-center gap-2 select-none">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">正在识别语音...</span>
      </div>
    );
  }

  return (
    <button
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
      onPointerCancel={handlePointerUp}
    >
      {isRecording ? (
        <>
          {/* 波形动画 */}
          <div className="flex items-center gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
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
            {cancelZone ? "松手取消" : "松手发送"}
          </span>
        </>
      ) : (
        <>
          <Mic className="w-4 h-4" />
          <span className="text-sm">按住说话</span>
        </>
      )}

      {/* 波形动画 CSS */}
      <style>{`
        @keyframes voiceWave {
          0% { height: 6px; }
          100% { height: 18px; }
        }
      `}</style>
    </button>
  );
}
