import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Send,
  ArrowLeft,
  Image as ImageIcon,
  Settings,
  Heart,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Camera,
  Mic,
  Keyboard,
  BookHeart,
  Plus,
} from "lucide-react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { VoiceRecordButton } from "@/components/VoiceRecordButton";
import { LevelUpAnimation } from "@/components/LevelUpAnimation";
import { IntimacyPanel } from "@/components/IntimacyPanel";
import { SelfiePoseDialog } from "@/components/SelfiePoseDialog";
import { getLevelInfo } from "../../../shared/intimacy";
import { detectSelfieRequest } from "@shared/selfieRequest";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

// TTS 语音播放 Hook - 支持浏览器内置和 API 两种模式，支持播放速度控制
const SPEED_OPTIONS = [
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 2, label: "2x" },
];

function useTTS() {
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

  // Phase 1b-i: apiConfig.get now returns { preferences, keys }.
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
        toast.error("当前浏览器不支持语音功能");
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = playbackSpeed * 0.95; // 基础速度 0.95 * 用户选择的倍速
      utterance.pitch = 1.2;
      utterance.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const zhFemaleVoice = voices.find(
        v =>
          v.lang.startsWith("zh") &&
          (v.name.toLowerCase().includes("female") ||
            v.name.includes("Xiaoxiao") ||
            v.name.includes("Xiaoyi") ||
            v.name.includes("女"))
      );
      const zhVoice =
        zhFemaleVoice || voices.find(v => v.lang.startsWith("zh"));
      if (zhVoice) utterance.voice = zhVoice;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [playbackSpeed]
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
              toast.error("语音播放失败");
            };
            audio.play().catch(() => {
              setIsSpeaking(false);
            });
          },
          onError: error => {
            setIsSpeaking(false);
            toast.error(`语音生成失败：${error.message}`);
          },
        }
      );
    },
    [ttsGenerate, playbackSpeed]
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

export default function Chat() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams();
  const conversationId = params.id ? parseInt(params.id) : null;
  const { theme, toggleTheme } = useTheme();
  const {
    speak,
    stop,
    isSpeaking,
    autoPlay,
    toggleAutoPlay,
    ttsProvider,
    playbackSpeed,
    updateSpeed,
  } = useTTS();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const [message, setMessage] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "voice">(() => {
    return (
      (localStorage.getItem("chat-input-mode") as "text" | "voice") || "text"
    );
  });
  const [showIntimacyPanel, setShowIntimacyPanel] = useState(false);
  const [showCrisisAlert, setShowCrisisAlert] = useState(false);
  const [showPoseDialog, setShowPoseDialog] = useState(false);
  const { data: apiConfig } = trpc.apiConfig.get.useQuery();
  // M4-3：语音输入的消息，回复自动朗读（即使未开自动播放）
  const lastInputWasVoiceRef = useRef(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState(1);
  const currentConversationId = conversationId;
  const resumeAttemptRef = useRef<number | null>(null);
  const pendingMessageAfterId = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 语音录制
  const {
    isRecording,
    isTranscribing,
    setIsTranscribing,
    duration,
    isSupported: voiceSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    setOnMaxDuration,
  } = useVoiceRecorder();
  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const recordingDurationRef = useRef(0);

  // 同步录音时长到 ref
  useEffect(() => {
    recordingDurationRef.current = duration;
  }, [duration]);

  const { data: activeGirlfriend, isLoading: activeLoading } =
    trpc.girlfriend.getActive.useQuery(undefined, { enabled: !conversationId });
  const { data: conversation, isLoading: conversationLoading } =
    trpc.conversation.get.useQuery(
      { id: conversationId! },
      { enabled: !!conversationId }
    );
  const { data: girlfriends, isLoading: girlfriendsLoading } =
    trpc.girlfriend.list.useQuery(undefined, { enabled: !!conversationId });
  const girlfriend = conversationId
    ? girlfriends?.find(gf => gf.id === conversation?.girlfriendId)
    : activeGirlfriend;
  const utils = trpc.useUtils();

  // 心情系统
  const girlfriendId = girlfriend?.id;
  const stableGirlfriendId = useMemo(() => girlfriendId, [girlfriendId]);
  const { data: moodData, refetch: refetchMood } = trpc.mood.get.useQuery(
    { girlfriendId: stableGirlfriendId! },
    { enabled: !!stableGirlfriendId }
  );
  const updateMood = trpc.mood.update.useMutation({
    onSuccess: () => refetchMood(),
  });
  const { data: chatMessages, refetch: refetchMessages } =
    trpc.conversation.getMessages.useQuery(
      { conversationId: currentConversationId! },
      { enabled: !!currentConversationId }
    );

  const createConversation = trpc.conversation.create.useMutation({
    onSuccess: data => {
      setMessage("");
      void utils.conversation.invalidate();
      setLocation(`/chat/${data.id}`);
    },
    onError: error => toast.error(`新建对话失败：${error.message}`),
  });
  const resumeChat = trpc.conversation.resume.useMutation({
    onSuccess: data => setLocation(`/chat/${data.id}`, { replace: true }),
    onError: error => toast.error(`打开对话失败：${error.message}`),
  });

  // 亲密度经验值 mutation
  const addPoints = trpc.girlfriend.addPoints.useMutation({
    onSuccess: data => {
      if (data.leveledUp && data.intimacyLevel) {
        setLevelUpLevel(data.intimacyLevel);
        setShowLevelUp(true);
      }
    },
  });

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onMutate: () => {
      pendingMessageAfterId.current = chatMessages?.at(-1)?.id || 0;
      setMessage("");
      scrollToBottom();
    },
    onSuccess: async data => {
      await refetchMessages();
      if (data.imageGeneration) {
        await selfieQuota.refetch();
        if (data.imageGeneration === "completed") {
          toast.success("自拍已发到当前对话");
          if (girlfriend)
            addPoints.mutate({ girlfriendId: girlfriend.id, reason: "selfie" });
        } else {
          toast.error("自拍生成失败，详情已显示在对话中");
        }
      }

      // 更新心情 - 用户消息
      if (girlfriend) {
        updateMood.mutate({
          girlfriendId: girlfriend.id,
          messageContent: data.userMessage.content,
          isUserMessage: true,
        });
        // 更新心情 - AI 回复
        if (data.assistantMessage?.content) {
          updateMood.mutate({
            girlfriendId: girlfriend.id,
            messageContent: data.assistantMessage.content,
            isUserMessage: false,
          });
        }

        // 触发亲密度经验值增加
        addPoints.mutate({
          girlfriendId: girlfriend.id,
          reason: "text_message",
          messageLength: data.userMessage.content.trim().length,
        });
      }

      // 朗读 AI 回复：开启了自动播放，或这条消息来自语音输入（M4-3
      // 语音往返 —— 用语音说话，就用语音回你）。
      if (
        (autoPlay || lastInputWasVoiceRef.current) &&
        data.assistantMessage?.content
      ) {
        const content = data.assistantMessage.content;
        if (!content.startsWith("[")) {
          speak(content);
        }
      }
      lastInputWasVoiceRef.current = false;

      // M1-6 / SB 243：检测到自残/危机表达时展示求助资源。
      if (data.safetyNotice) {
        setShowCrisisAlert(true);
      }

      setMessage("");
      scrollToBottom();
    },
    onError: (error, variables) => {
      setMessage(current => current || variables.content);
      void refetchMessages();
      if (error.message.startsWith("LEVEL_LOCKED")) {
        toast.error(error.message.replace("LEVEL_LOCKED: ", ""));
        return;
      }
      if (error.message.startsWith("UPGRADE_REQUIRED")) {
        toast.error("当前套餐不支持此功能，去设置查看订阅选项", {
          action: { label: "去设置", onClick: () => setLocation("/settings") },
        });
      } else {
        toast.error(`发送失败：${error.message}`);
      }
    },
  });

  // 今日自拍额度（BYOK fal 用户无限制）
  const selfieQuota = trpc.selfie.quota.useQuery();
  // 档位信息（合照 Pro 门控展示用）
  const { data: billingInfo } = trpc.billing.getInfo.useQuery();
  const selfieRemaining = selfieQuota.data?.unlimited
    ? Infinity
    : (selfieQuota.data?.remaining ?? null);

  const generateSelfie = trpc.selfie.generate.useMutation({
    onSuccess: async () => {
      await refetchMessages();
      await selfieQuota.refetch();
      toast.success("自拍照片生成成功！");
      scrollToBottom();
      // 触发自拍亲密度经验值
      if (girlfriend) {
        addPoints.mutate({
          girlfriendId: girlfriend.id,
          reason: "selfie",
        });
      }
    },
    onError: error => {
      void selfieQuota.refetch();
      if (error.message.startsWith("LEVEL_LOCKED")) {
        toast.error(error.message.replace("LEVEL_LOCKED: ", ""));
      } else if (error.data?.code === "TOO_MANY_REQUESTS") {
        toast.error(
          "自拍额度已用完（在设置里查看套餐，或配置自己的 fal.ai Key 解除限制）",
          {
            action: {
              label: "去设置",
              onClick: () => setLocation("/settings"),
            },
          }
        );
      } else if (error.message.startsWith("UPGRADE_REQUIRED")) {
        toast.error("当前套餐不支持此功能，去设置查看订阅选项", {
          action: { label: "去设置", onClick: () => setLocation("/settings") },
        });
      } else {
        toast.error(`生成自拍失败：${error.message}`);
      }
    },
  });

  // M4-2：合照生成
  const generateCouple = trpc.selfie.generateCouple.useMutation({
    onSuccess: async () => {
      await refetchMessages();
      await selfieQuota.refetch();
      toast.success("合照生成成功！");
      scrollToBottom();
      if (girlfriend) {
        addPoints.mutate({ girlfriendId: girlfriend.id, reason: "selfie" });
      }
    },
    onError: error => {
      void selfieQuota.refetch();
      if (error.data?.code === "TOO_MANY_REQUESTS") {
        toast.error(
          "自拍额度已用完（在设置里查看套餐，或配置自己的 fal.ai Key 解除限制）",
          {
            action: {
              label: "去设置",
              onClick: () => setLocation("/settings"),
            },
          }
        );
      } else if (error.message.startsWith("UPGRADE_REQUIRED")) {
        toast.error("当前套餐不支持此功能，去设置查看订阅选项", {
          action: { label: "去设置", onClick: () => setLocation("/settings") },
        });
      } else {
        toast.error(`生成自拍失败：${error.message}`);
      }
    },
  });

  const resumeConversation = resumeChat.mutate;
  useEffect(() => {
    if (
      !currentConversationId &&
      girlfriend &&
      resumeAttemptRef.current !== girlfriend.id
    ) {
      resumeAttemptRef.current = girlfriend.id;
      resumeConversation({ girlfriendId: girlfriend.id });
    }
  }, [currentConversationId, girlfriend, resumeConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // 预加载浏览器语音列表
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !currentConversationId) return;

    sendMessage.mutate({
      conversationId: currentConversationId,
      content: message.trim(),
    });
  };

  const handleSpeakMessage = (text: string) => {
    if (isSpeaking) {
      stop();
    } else {
      speak(text);
    }
  };

  // M4-1：相机按钮改为打开姿势选择器；姿势随亲密度解锁。
  const handleSelectPose = (
    poseId: string,
    generationMode: "reference" | "text"
  ) => {
    if (!currentConversationId) return;
    if (selfieRemaining !== null && selfieRemaining <= 0) {
      toast.error(
        "自拍额度已用完（在设置里查看套餐，或配置自己的 fal.ai Key 解除限制）"
      );
      return;
    }
    toast.info("正在生成自拍照片...");
    generateSelfie.mutate({
      conversationId: currentConversationId,
      userContext: message.trim(),
      poseId,
      generationMode,
    });
  };

  // M4-2：合照 —— 用户照片转 base64 后与她同框。
  const handleCouplePhoto = (file: File) => {
    if (!currentConversationId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      toast.info("正在生成合照...");
      generateCouple.mutate({
        conversationId: currentConversationId!,
        userPhotoBase64: base64,
        userPhotoMimeType: file.type,
        userContext: message.trim() || undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  // 语音/文字模式切换
  const switchInputMode = useCallback((mode: "text" | "voice") => {
    setInputMode(mode);
    localStorage.setItem("chat-input-mode", mode);
  }, []);

  // 处理录音完成
  const handleRecordingComplete = useCallback(async () => {
    const currentDuration = recordingDurationRef.current;
    const result = await stopRecording();
    if (!result || !currentConversationId) return;

    // 最短录音时长检查
    if (currentDuration < 1) {
      toast.info("录音时间太短，请重试");
      return;
    }

    setIsTranscribing(true);

    // Blob → Base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (!base64) {
        setIsTranscribing(false);
        toast.error("音频数据读取失败");
        return;
      }

      transcribeMutation.mutate(
        { audioBase64: base64, mimeType: result.mimeType },
        {
          onSuccess: data => {
            setIsTranscribing(false);
            if (data.text) {
              // 自动发送转写文字（M4-3：标记语音来源，回复将自动朗读）
              lastInputWasVoiceRef.current = true;
              sendMessage.mutate({
                conversationId: currentConversationId!,
                content: data.text,
              });
              toast.success(
                `语音识别成功（${data.duration?.toFixed(1) || 0}秒）`
              );
              // 触发语音消息亲密度经验值
              if (girlfriend) {
                addPoints.mutate({
                  girlfriendId: girlfriend.id,
                  reason: "voice_message",
                  voiceDuration: recordingDurationRef.current,
                });
              }
            } else {
              toast.error("未识别到有效语音内容，请重试");
            }
          },
          onError: error => {
            setIsTranscribing(false);
            toast.error(`语音识别失败：${error.message}`);
          },
        }
      );
    };
    reader.onerror = () => {
      setIsTranscribing(false);
      toast.error("音频数据读取失败");
    };
    reader.readAsDataURL(result.blob);
  }, [
    stopRecording,
    currentConversationId,
    setIsTranscribing,
    transcribeMutation,
    sendMessage,
    girlfriend,
    addPoints,
  ]);

  // 注册最大时长回调
  useEffect(() => {
    setOnMaxDuration(() => handleRecordingComplete);
  }, [setOnMaxDuration, handleRecordingComplete]);

  if (
    conversationId ? conversationLoading || girlfriendsLoading : activeLoading
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!girlfriend) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <Heart className="w-16 h-16 text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-2">还没有女友配置</h2>
        <p className="text-muted-foreground mb-4">请先创建你的专属女友</p>
        <Button onClick={() => setLocation("/setup")}>去设置</Button>
      </div>
    );
  }

  // 语音引擎标签
  const ttsLabel =
    ttsProvider === "elevenlabs"
      ? "ElevenLabs"
      : ttsProvider === "fishaudio"
        ? "Fish"
        : "";

  // 心情配置
  const MOOD_CONFIG: Record<
    string,
    { emoji: string; label: string; color: string }
  > = {
    excited: { emoji: "🥰", label: "超开心", color: "text-pink-500" },
    happy: { emoji: "😊", label: "开心", color: "text-green-500" },
    content: { emoji: "🙂", label: "满足", color: "text-blue-500" },
    neutral: { emoji: "😐", label: "平静", color: "text-yellow-500" },
    lonely: { emoji: "😢", label: "想你了", color: "text-purple-500" },
    sad: { emoji: "😭", label: "伤心", color: "text-red-500" },
  };
  const currentMoodInfo = moodData ? MOOD_CONFIG[moodData.mood] : null;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部导航栏 */}
      <header
        className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b bg-card"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <Avatar className="w-8 h-8 sm:w-10 sm:h-10">
          <AvatarImage
            src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
            alt={girlfriend.name}
          />
          <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 sm:gap-2">
            <h1 className="font-semibold text-sm sm:text-base truncate">
              {girlfriend.name}
            </h1>
            {currentMoodInfo && (
              <span
                className="text-sm"
                title={`${currentMoodInfo.label} (${moodData!.moodScore}分)`}
              >
                {currentMoodInfo.emoji}
              </span>
            )}
            {/* 亲密度徽章 */}
            {(() => {
              const level = girlfriend.intimacyLevel || 1;
              const info = getLevelInfo(level);
              return (
                <button
                  className={`text-xs flex items-center gap-0.5 ${info.color} hover:opacity-80 transition-opacity`}
                  onClick={() => setShowIntimacyPanel(true)}
                  title={`亲密度: ${info.name} Lv.${level}`}
                >
                  <span>{info.emoji}</span>
                  <span className="font-medium">Lv.{level}</span>
                </button>
              );
            })()}
          </div>
          <p className="text-xs text-muted-foreground">
            {currentMoodInfo ? (
              <span className={currentMoodInfo.color}>
                {currentMoodInfo.label}
              </span>
            ) : (
              "在线"
            )}
            {ttsLabel ? ` · 语音: ${ttsLabel}` : ""}
            {/* M1-6 / SB 243：AI 身份常驻披露 */}
            <span className="opacity-70"> · AI 虚拟角色，非真人</span>
          </p>
        </div>

        {/* 语音自动播放开关 */}
        <Button
          variant="ghost"
          size="sm"
          aria-label="新建对话"
          title="新建对话，原有记录会保留"
          disabled={
            !currentConversationId ||
            createConversation.isPending ||
            sendMessage.isPending ||
            generateSelfie.isPending ||
            generateCouple.isPending ||
            isRecording ||
            isTranscribing
          }
          onClick={() =>
            createConversation.mutate({
              girlfriendId: girlfriend.id,
              title: `与 ${girlfriend.name} 的对话`,
            })
          }
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">新建对话</span>
        </Button>
        <Button
          variant={autoPlay ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8 sm:h-10 sm:w-10"
          onClick={toggleAutoPlay}
          title={autoPlay ? "关闭自动语音" : "开启自动语音"}
        >
          {autoPlay ? (
            <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </Button>

        {/* 播放速度控制 */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs font-mono px-1.5 sm:px-2 h-8"
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            title="语音播放速度"
          >
            {playbackSpeed}x
          </Button>
          {showSpeedMenu && (
            <div className="absolute right-0 top-full mt-1 bg-popover text-popover-foreground border rounded-lg shadow-lg z-50 py-1 min-w-[80px]">
              {SPEED_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${
                    playbackSpeed === opt.value
                      ? "text-primary font-semibold bg-primary/5"
                      : ""
                  }`}
                  onClick={() => {
                    updateSpeed(opt.value);
                    setShowSpeedMenu(false);
                    toast.success(`播放速度已设为 ${opt.label}`);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-10 sm:w-10"
          onClick={toggleTheme}
        >
          {theme === "light" ? (
            <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-10 sm:w-10"
          title="她记得你的事"
          onClick={() => setLocation(`/memories/${girlfriend.id}`)}
        >
          <BookHeart className="w-4 h-4 sm:w-5 sm:h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={() => setLocation("/gallery")}
        >
          <ImageIcon className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={() => setLocation("/settings")}
        >
          <Settings className="w-5 h-5" />
        </Button>
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {!chatMessages || chatMessages.length === 0
          ? !sendMessage.isPending && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Heart className="w-12 h-12 text-primary mb-4" />
                <p className="text-muted-foreground">
                  开始和 {girlfriend.name} 聊天吧~
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  直接说「发张自拍」即可生成照片，也可以点击下方相机选择姿势
                </p>
              </div>
            )
          : chatMessages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {msg.role === "assistant" && (
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage
                      src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
                      alt={girlfriend.name}
                    />
                    <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
                  </Avatar>
                )}

                <div className="flex flex-col gap-1 max-w-[80%] sm:max-w-[75%]">
                  <div
                    className={`rounded-2xl px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.imageUrl ? (
                      <div className="space-y-2">
                        <img
                          src={msg.imageUrl}
                          alt="Selfie"
                          className="rounded-lg max-w-full max-h-[65vh] w-auto h-auto object-contain cursor-pointer"
                          onClick={() => window.open(msg.imageUrl!, "_blank")}
                        />
                        {msg.content && msg.content !== "[自拍照片]" && (
                          <p className="text-sm">{msg.content}</p>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    )}
                  </div>

                  {/* AI 消息的语音播放按钮 */}
                  {msg.role === "assistant" &&
                    msg.content &&
                    msg.content !== "[自拍照片]" && (
                      <button
                        onClick={() => handleSpeakMessage(msg.content)}
                        className="self-start ml-1 text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                        title={`播放语音${ttsLabel ? ` (${ttsLabel})` : ""}`}
                      >
                        {isSpeaking ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                </div>

                {msg.role === "user" && (
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

        {sendMessage.isPending &&
          sendMessage.variables &&
          !chatMessages?.some(
            msg =>
              msg.id > pendingMessageAfterId.current &&
              msg.role === "user" &&
              msg.content === sendMessage.variables?.content
          ) && (
            <div className="flex justify-end gap-3">
              <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[80%] whitespace-pre-wrap">
                {sendMessage.variables.content}
              </div>
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
              </Avatar>
            </div>
          )}

        {sendMessage.isPending && (
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage
                src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
                alt={girlfriend.name}
              />
              <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
            </Avatar>
            <div className="bg-muted rounded-2xl px-4 py-3">
              {detectSelfieRequest(sendMessage.variables?.content || "") ? (
                <div
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在拍自拍，排队或生成中，请稍候…
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <span
                    className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  ></span>
                  <span
                    className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  ></span>
                  <span
                    className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  ></span>
                </div>
              )}
            </div>
          </div>
        )}

        {(generateSelfie.isPending || generateCouple.isPending) && (
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage
                src={girlfriend.avatarUrl || girlfriend.referenceImageUrl}
                alt={girlfriend.name}
              />
              <AvatarFallback>{girlfriend.name[0]}</AvatarFallback>
            </Avatar>
            <div className="bg-muted rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在排队或生成图片，请稍候…
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* M1-6 / SB 243：危机干预资源提示（由 shared/safety.ts 提供检测结果） */}
      {showCrisisAlert && (
        <div className="mx-3 sm:mx-4 mb-2 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
          <Heart className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">你并不孤单，有人愿意倾听。</p>
            <p className="mt-0.5 opacity-90">
              中国心理援助热线 400-161-9995（24 小时） · US &amp; Canada:
              call/text 988 · 其他地区：
              <a
                href="https://findahelpline.com"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                findahelpline.com
              </a>
            </p>
          </div>
          <button
            type="button"
            className="opacity-60 hover:opacity-100 shrink-0"
            onClick={() => setShowCrisisAlert(false)}
            aria-label="关闭提示"
          >
            ✕
          </button>
        </div>
      )}

      {/* 输入框 */}
      <form
        onSubmit={handleSendMessage}
        className="flex items-center gap-2 p-2 sm:p-4 border-t bg-card"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
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
              ? "生图服务尚未配置"
              : selfieRemaining === null || selfieRemaining === Infinity
                ? "让她拍一张自拍"
                : selfieRemaining > 0
                  ? `让她拍一张自拍（剩余 ${selfieRemaining} 张）`
                  : "自拍额度已用完"
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
              placeholder={`和 ${girlfriend.name} 说点什么...`}
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
                title="切换到语音输入"
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
              title="切换到文字输入"
              className="shrink-0 text-muted-foreground hover:text-primary"
            >
              <Keyboard className="w-5 h-5" />
            </Button>
          </>
        )}
      </form>

      {/* 拍照姿势选择器（M4-1/2） */}
      <SelfiePoseDialog
        open={showPoseDialog}
        onOpenChange={setShowPoseDialog}
        intimacyLevel={girlfriend.intimacyLevel || 1}
        supportsTextToImage={
          apiConfig?.imageProvider.supportsTextToImage === true
        }
        canCouplePhoto={
          billingInfo?.mode === "none" ||
          billingInfo?.byok.selfie === true ||
          billingInfo?.tier === "pro"
        }
        onSelectPose={handleSelectPose}
        onCouplePhoto={handleCouplePhoto}
      />

      {/* 亲密度详情面板 */}
      <IntimacyPanel
        open={showIntimacyPanel}
        onOpenChange={setShowIntimacyPanel}
        intimacyLevel={girlfriend.intimacyLevel || 1}
        intimacyPoints={girlfriend.intimacyPoints || 0}
        consecutiveDays={girlfriend.consecutiveDays || 0}
        girlfriendName={girlfriend.name}
      />

      {/* 升级动画 */}
      <LevelUpAnimation
        show={showLevelUp}
        newLevel={levelUpLevel}
        onClose={() => setShowLevelUp(false)}
      />
    </div>
  );
}
