/** 按角色和账号偏好朗读消息，并管理播放取消、语速及自动朗读状态。 */
import { useProductConfig } from "@/features/product/useProductConfig";
import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { resolveSpeechLanguage, selectSpeechVoice } from "@/lib/speech";
import { trpc } from "@/lib/trpc";
import { readDeviceValue, writeDeviceValue } from "@/lib/deviceStorage";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
/** 优先使用角色绑定的克隆音色，切换角色或音色后停止并忽略旧播放。 */
export function useTTS(companion?: {
  id: number;
  omnivoiceVoiceId?: string | null;
}) {
  const girlfriendId = companion?.id;
  const voiceId = companion?.omnivoiceVoiceId;
  const scope = useRef({ girlfriendId, voiceId });
  if (
    scope.current.girlfriendId !== girlfriendId ||
    scope.current.voiceId !== voiceId
  )
    scope.current = { girlfriendId, voiceId };
  const identity = scope.current;
  const product = useProductConfig();
  const rules = product.raw?.experience.playback;
  const { t } = useI18n();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [autoPlay, setAutoPlay] = useState(() => {
    return readDeviceValue("tts-autoplay") === "true";
  });
  const [savedSpeed, setPlaybackSpeed] = useState(() =>
    Number(readDeviceValue("tts-speed"))
  );
  const playbackSpeed = rules?.speeds.includes(savedSpeed)
    ? savedSpeed
    : (rules?.defaultSpeed ?? 1);
  const speedOptions =
    rules?.speeds.map(value => ({ value, label: `${value}x` })) ?? [];
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
    setIsSpeaking(false);
    setActiveMessageId(null);
    return () => {
      mounted.current = false;
      stopPlayback();
    };
  }, [identity, stopPlayback]);
  const finish = useCallback((request: number) => {
    if (request !== playbackRequest.current) return;
    setIsSpeaking(false);
    setActiveMessageId(null);
  }, []);

  // 获取用户的 TTS 配置
  const { data: apiConfig } = trpc.apiConfig.get.useQuery();
  const { mutate: generateSpeech } = trpc.tts.generate.useMutation();

  // 分别读取偏好与脱敏后的密钥状态。
  const ttsProvider = voiceId
    ? "omnivoice"
    : apiConfig?.preferences?.ttsProvider ||
      rules?.defaultProvider ||
      "browser";

  // 更新播放速度
  const updateSpeed = useCallback(
    (speed: number) => {
      if (!rules?.speeds.includes(speed)) return;
      setPlaybackSpeed(speed);
      writeDeviceValue("tts-speed", String(speed));
      // 如果当前正在播放，实时更新速度
      if (audioRef.current) {
        audioRef.current.playbackRate = speed;
      }
      if (utteranceRef.current && "speechSynthesis" in window) {
        // 浏览器语音不支持实时更新 rate，下次播放生效
      }
    },
    [rules]
  );

  // 浏览器内置语音
  const speakBrowser = useCallback(
    (text: string, request: number) => {
      if (!rules) return;
      if (!("speechSynthesis" in window)) {
        finish(request);
        toast.error(t("common:thisBrowserDoesNotSupportSpeech"));
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = resolveSpeechLanguage(
        apiConfig?.preferences?.replyLanguage,
        rules.defaultLanguage
      );
      utterance.rate = playbackSpeed * rules.browserRate; // 基础速度 0.95 * 用户选择的倍速
      utterance.pitch = rules.pitch;
      utterance.volume = rules.volume;
      const voices = window.speechSynthesis.getVoices();
      const voice = selectSpeechVoice(voices, utterance.lang);
      if (voice) utterance.voice = voice;
      utterance.onend = () => finish(request);
      utterance.onerror = () => finish(request);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [playbackSpeed, t, apiConfig?.preferences?.replyLanguage, finish, rules]
  );

  // API 语音（ElevenLabs / Fish Audio / 本地 OmniVoice）
  const speakApi = useCallback(
    (text: string, request: number) => {
      generateSpeech(
        { text, ...(girlfriendId === undefined ? {} : { girlfriendId }) },
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
    [generateSpeech, playbackSpeed, t, finish, girlfriendId]
  );

  const speak = useCallback(
    (text: string, messageId?: number) => {
      if (!mounted.current || scope.current !== identity) return;
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
    [ttsProvider, speakBrowser, speakApi, stopPlayback, identity]
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
    speedOptions,
    playbackSpeed,
    updateSpeed,
  };
}
