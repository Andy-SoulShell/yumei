import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface VoiceRecorderResult {
  blob: Blob;
  mimeType: string;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const maxDurationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMaxDurationRef = useRef<(() => void) | null>(null);

  // 检测浏览器支持
  useEffect(() => {
    const supported =
      typeof MediaRecorder !== "undefined" &&
      typeof navigator?.mediaDevices?.getUserMedia === "function";
    setIsSupported(supported);
  }, []);

  // 清理资源
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxDurationRef.current) {
      clearTimeout(maxDurationRef.current);
      maxDurationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
  }, []);

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // 选择最佳编码格式
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      if (!mimeType) {
        toast.error("当前浏览器不支持音频录制");
        cleanup();
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(100); // 每 100ms 收集一次数据
      setIsRecording(true);
      setDuration(0);

      // 启动计时器
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      // 最大录音时长 60 秒
      maxDurationRef.current = setTimeout(() => {
        toast.info("已达到最大录音时长（60秒）");
        if (onMaxDurationRef.current) {
          onMaxDurationRef.current();
        }
      }, 60000);

      // 触觉反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (error: any) {
      if (error.name === "NotAllowedError") {
        toast.error("麦克风权限被拒绝，请在浏览器设置中允许麦克风访问");
      } else if (error.name === "NotFoundError") {
        toast.error("未检测到麦克风设备");
      } else {
        toast.error("无法访问麦克风，请检查浏览器权限设置");
      }
      cleanup();
    }
  }, [cleanup]);

  // 停止录音并返回音频数据
  const stopRecording = useCallback((): Promise<VoiceRecorderResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanup();
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        resolve({ blob, mimeType });
      };

      recorder.stop();
    });
  }, [cleanup]);

  // 取消录音
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {}; // 不触发回调
      recorder.stop();
    }
    cleanup();
    toast.info("录音已取消");
  }, [cleanup]);

  // 注册最大时长回调
  const setOnMaxDuration = useCallback((callback: () => void) => {
    onMaxDurationRef.current = callback;
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording,
    isTranscribing,
    setIsTranscribing,
    duration,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    setOnMaxDuration,
  };
}
