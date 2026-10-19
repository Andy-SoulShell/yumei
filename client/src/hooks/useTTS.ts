import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { resolveSpeechLanguage, selectSpeechVoice } from "@/lib/speech";
import { trpc } from "@/lib/trpc";
import { useCallback, useRef, useState } from "react";
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
  const [autoPlay, setAutoPlay] = useState(() => {
    return localStorage.getItem("tts-autoplay") === "true";
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = localStorage.getItem("tts-speed");
    return saved ? parseFloat(saved) : 1;
  });
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 获取用户的 TTS 配置
  const { data: apiConfig } = trpc.apiConfig.get.useQuery();
  const ttsGenerate = trpc.tts.generate.useMutation();

  // 分别读取偏好与脱敏后的密钥状态。
  const ttsProvider = apiConfig?.preferences?.ttsProvider || "browser";

  // 更新播放速度
  const updateSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    localStorage.setItem("tts-speed", String(speed));
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
    (text: string) => {
      if (!("speechSynthesis" in window)) {
        toast.error(t("common:thisBrowserDoesNotSupportSpeech"));
        return;
      }
      window.speechSynthesis.cancel();
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
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [playbackSpeed, t, apiConfig?.preferences?.replyLanguage]
  );

  // API 语音（ElevenLabs / Fish Audio）
  const speakApi = useCallback(
    (text: string) => {
      setIsSpeaking(true);
      ttsGenerate.mutate(
        { text },
        {
          onSuccess: data => {
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
            }
            const audio = new Audio(data.audioUrl);
            audio.playbackRate = playbackSpeed;
            audioRef.current = audio;
            audio.onended = () => setIsSpeaking(false);
            audio.onerror = () => {
              setIsSpeaking(false);
              toast.error(t("common:audioPlaybackFailed"));
            };
            audio.play().catch(() => {
              setIsSpeaking(false);
            });
          },
          onError: error => {
            setIsSpeaking(false);
            toast.error(
              t("chat:speechGenerationFailed", {
                error: apiErrorMessage(error, t),
              })
            );
          },
        }
      );
    },
    [ttsGenerate, playbackSpeed, t]
  );

  const speak = useCallback(
    (text: string) => {
      if (ttsProvider === "browser") {
        speakBrowser(text);
      } else {
        speakApi(text);
      }
    },
    [ttsProvider, speakBrowser, speakApi]
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay(prev => {
      const next = !prev;
      localStorage.setItem("tts-autoplay", String(next));
      return next;
    });
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    autoPlay,
    toggleAutoPlay,
    ttsProvider,
    playbackSpeed,
    updateSpeed,
  };
}
