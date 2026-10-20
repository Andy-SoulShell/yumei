import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { resolveSpeechLanguage, selectSpeechVoice } from "@/lib/speech";
import { trpc } from "@/lib/trpc";
import { readDeviceValue, writeDeviceValue } from "@/lib/deviceStorage";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
export const SPEED_OPTIONS = [
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 2, label: "2x" },
];
export function useTTS() {
  const { t } = useI18n();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [autoPlay, setAutoPlay] = useState(() => {
    return readDeviceValue("tts-autoplay") === "true";
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = Number(readDeviceValue("tts-speed"));
    return SPEED_OPTIONS.some(option => option.value === saved) ? saved : 1;
  });
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRequest = useRef(0);
  const mounted = useRef(true);

  // 停止或离开页面后，迟到的语音生成结果也不能重新播放。
  const stopPlayback = useCallback(() => {
    playbackRequest.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopPlayback();
    };
  }, [stopPlayback]);
  const finish = useCallback((request: number) => {
    if (request !== playbackRequest.current) return;
    setIsSpeaking(false);
    setActiveMessageId(null);
  }, []);

  // 获取用户的 TTS 配置
  const { data: apiConfig } = trpc.apiConfig.get.useQuery();
  const ttsGenerate = trpc.tts.generate.useMutation();

  // 分别读取偏好与脱敏后的密钥状态。
  const ttsProvider = apiConfig?.preferences?.ttsProvider || "browser";

  // 更新播放速度
  const updateSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    writeDeviceValue("tts-speed", String(speed));
    // 如果当前正在播放，实时更新速度
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    if (utteranceRef.current && "speechSynthesis" in window) {
      // 浏览器语音不支持实时更新 rate，下次播放生效
    }
  }, []);

  // 浏览器内置语音
  const speakBrowser = useCallback(
    (text: string, request: number) => {
      if (!("speechSynthesis" in window)) {
        finish(request);
        toast.error(t("common:thisBrowserDoesNotSupportSpeech"));
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = resolveSpeechLanguage(
        apiConfig?.preferences?.replyLanguage
      );
      utterance.rate = playbackSpeed * 0.95; // 基础速度 0.95 * 用户选择的倍速
      utterance.pitch = 1.2;
      utterance.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const voice = selectSpeechVoice(voices, utterance.lang);
      if (voice) utterance.voice = voice;
      utterance.onend = () => finish(request);
      utterance.onerror = () => finish(request);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [playbackSpeed, t, apiConfig?.preferences?.replyLanguage, finish]
  );

  // API 语音（ElevenLabs / Fish Audio）
  const speakApi = useCallback(
    (text: string, request: number) => {
      ttsGenerate.mutate(
        { text },
        {
          onSuccess: data => {
            if (request !== playbackRequest.current) return;
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
            }
            const audio = new Audio(data.audioUrl);
            audio.playbackRate = playbackSpeed;
            audioRef.current = audio;
            audio.onended = () => finish(request);
            audio.onerror = () => {
              if (request !== playbackRequest.current) return;
              finish(request);
              toast.error(t("common:audioPlaybackFailed"));
            };
            audio.play().catch(() => {
              if (request !== playbackRequest.current) return;
              finish(request);
              toast.error(t("common:audioPlaybackFailed"));
            });
          },
          onError: error => {
            if (request !== playbackRequest.current) return;
            finish(request);
            toast.error(
              t("chat:speechGenerationFailed", {
                error: apiErrorMessage(error, t),
              })
            );
          },
        }
      );
    },
    [ttsGenerate, playbackSpeed, t, finish]
  );

  const speak = useCallback(
    (text: string, messageId?: number) => {
      if (!mounted.current) return;
      stopPlayback();
      const request = playbackRequest.current;
      setIsSpeaking(true);
      setActiveMessageId(messageId ?? null);
      if (ttsProvider === "browser") {
        speakBrowser(text, request);
      } else {
        speakApi(text, request);
      }
    },
    [ttsProvider, speakBrowser, speakApi, stopPlayback]
  );

  const stop = useCallback(() => {
    stopPlayback();
    setIsSpeaking(false);
    setActiveMessageId(null);
  }, [stopPlayback]);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay(prev => {
      const next = !prev;
      writeDeviceValue("tts-autoplay", String(next));
      return next;
    });
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    activeMessageId,
    autoPlay,
    toggleAutoPlay,
    ttsProvider,
    playbackSpeed,
    updateSpeed,
  };
}
