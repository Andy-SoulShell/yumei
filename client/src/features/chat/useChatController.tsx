import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useTTS } from "@/hooks/useTTS";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams, useSearch } from "wouter";

type FailedChatMessage = {
  conversationId: number;
  content: string;
  transcriptionId?: string;
};

/** 页面查询、草稿与操作流程；展示组件只消费此状态。 */
export function useChatController() {
  const { t } = useI18n();

  const { user } = useAuth();

  const [, setLocation] = useLocation();

  const params = useParams();

  const conversationId = params.id ? Number(params.id) : null;

  const invalidConversation =
    params.id !== undefined &&
    (!Number.isInteger(conversationId) ||
      !conversationId ||
      conversationId < 0);

  const { theme, toggleTheme } = useTheme();

  const {
    speak,
    stop,
    isSpeaking,
    activeMessageId,
    autoPlay,
    toggleAutoPlay,
    ttsProvider,
    playbackSpeed,
    updateSpeed,
  } = useTTS();

  const [message, setMessage] = useState("");
  const [failedMessages, setFailedMessages] = useState<FailedChatMessage[]>([]);

  const [inputMode, setInputMode] = useState<"text" | "voice">(() => {
    return (
      (localStorage.getItem("chat-input-mode") as "text" | "voice") || "text"
    );
  });

  const [showIntimacyPanel, setShowIntimacyPanel] = useState(false);

  const [showCrisisAlert, setShowCrisisAlert] = useState(false);

  const search = useSearch();

  const [showPoseDialog, setShowPoseDialog] = useState(
    () => new URLSearchParams(search).get("selfie") === "1"
  );

  const { data: apiConfig } = trpc.apiConfig.get.useQuery();

  // 语音输入的消息，回复自动朗读（即使未开自动播放）
  const lastInputWasVoiceRef = useRef(false);

  const [showLevelUp, setShowLevelUp] = useState(false);

  const [levelUpLevel, setLevelUpLevel] = useState(1);

  const currentConversationId = conversationId;

  const resumeAttemptRef = useRef<number | null>(null);

  const pendingMessageAfterId = useRef(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messageListRef = useRef<HTMLDivElement>(null);

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

  const {
    data: activeGirlfriend,
    isLoading: activeLoading,
    error: activeError,
    refetch: retryActive,
  } = trpc.girlfriend.getActive.useQuery(undefined, { enabled: !params.id });

  const {
    data: conversation,
    isLoading: conversationLoading,
    error: conversationError,
    refetch: retryConversation,
  } = trpc.conversation.get.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId && !invalidConversation }
  );

  const {
    data: girlfriends,
    isLoading: girlfriendsLoading,
    error: girlfriendsError,
    refetch: retryRoles,
  } = trpc.girlfriend.list.useQuery(undefined, {
    enabled: !!conversationId && !invalidConversation,
  });

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

  const messagesQuery = trpc.conversation.getMessages.useInfiniteQuery(
    { conversationId: currentConversationId!, limit: 50 },
    {
      enabled: !!currentConversationId,
      getNextPageParam: page => (page.length === 50 ? page[0].id : undefined),
    }
  );

  const refetchMessages = messagesQuery.refetch;

  const chatMessages = useMemo(
    () => messagesQuery.data?.pages.slice().reverse().flat(),
    [messagesQuery.data]
  );

  const lastMessageId = chatMessages?.at(-1)?.id;

  const loadOlderMessages = async () => {
    const element = messageListRef.current;
    const before = element?.scrollHeight ?? 0;
    await messagesQuery.fetchNextPage();
    requestAnimationFrame(() => {
      if (element) element.scrollTop += element.scrollHeight - before;
    });
  };

  const createConversation = trpc.conversation.create.useMutation({
    onSuccess: data => {
      setMessage("");
      void utils.conversation.invalidate();
      setLocation(`/chat/${data.id}`);
    },
    onError: error =>
      toast.error(
        t("chat:couldNotStartAConversation", {
          error: apiErrorMessage(error, t),
        })
      ),
  });

  const resumeChat = trpc.conversation.resume.useMutation({
    onSuccess: data => setLocation(`/chat/${data.id}`, { replace: true }),
    onError: error =>
      toast.error(
        t("common:couldNotOpenTheConversation", {
          error: apiErrorMessage(error, t),
        })
      ),
  });

  const showRelationship = (data: object) => {
    const relationship =
      "relationship" in data
        ? (data.relationship as {
            leveledUp: boolean;
            intimacyLevel: number;
          } | null)
        : null;
    if (relationship?.leveledUp) {
      setLevelUpLevel(relationship.intimacyLevel);
      setShowLevelUp(true);
    }
  };

  const refreshConversation = async () => {
    await Promise.all([
      refetchMessages(),
      utils.conversation.listWithDetails.invalidate(),
      utils.conversation.list.invalidate(),
      utils.girlfriend.invalidate(),
      refetchMood(),
    ]);
  };

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onMutate: variables => {
      pendingMessageAfterId.current = chatMessages?.at(-1)?.id || 0;
      setMessage(current =>
        current.trim() === variables.content ? "" : current
      );
      scrollToBottom();
    },
    onSuccess: async (data, variables) => {
      setFailedMessages(current =>
        current.filter(
          item =>
            item.conversationId !== variables.conversationId ||
            item.content !== variables.content
        )
      );
      showRelationship(data);
      await refreshConversation();
      if (data.imageGeneration) {
        await selfieQuota.refetch();
        if (data.imageGeneration !== "completed") {
          toast.error(t("chat:selfieGenerationFailedNoQuotaWasChargedDetails"));
          scrollToBottom();
          return;
        }
      }

      // 开启自动播放或使用语音输入时，自动朗读 AI 回复。
      if (
        (autoPlay || lastInputWasVoiceRef.current) &&
        data.assistantMessage?.content
      ) {
        const content = data.assistantMessage.content;
        if (!content.startsWith("[")) {
          speak(content, data.assistantMessage.id);
        }
      }
      lastInputWasVoiceRef.current = false;

      // / SB 243：检测到自残/危机表达时展示求助资源。
      if (data.safetyNotice) {
        setShowCrisisAlert(true);
      }

      scrollToBottom();
    },
    onError: (error, variables) => {
      // 失败消息留在对话中，可单独重试；不覆盖用户正在写的下一条。
      setFailedMessages(current =>
        current.some(
          item =>
            item.conversationId === variables.conversationId &&
            item.content === variables.content
        )
          ? current
          : [...current, variables]
      );
      void refetchMessages();
      if (error.data?.business?.reason === "LEVEL_LOCKED") {
        toast.error(
          t("selfie:poseLocked", {
            required: error.data.business.requiredLevel,
            current: error.data.business.currentLevel,
          })
        );
        return;
      }
      if (error.data?.business?.reason === "UPGRADE_REQUIRED") {
        toast.error(t("chat:yourPlanDoesNotIncludeThisFeatureView"), {
          action: {
            label: t("chat:openSettings"),
            onClick: () => setLocation("/settings"),
          },
        });
      } else {
        toast.error(
          t("chat:couldNotSend", { error: apiErrorMessage(error, t) })
        );
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
    onSuccess: async data => {
      showRelationship(data);
      await refreshConversation();
      await selfieQuota.refetch();
      scrollToBottom();
      // 触发自拍亲密度经验值
    },
    onError: error => {
      void selfieQuota.refetch();
      if (error.data?.business?.reason === "LEVEL_LOCKED") {
        toast.error(
          t("selfie:poseLocked", {
            required: error.data.business.requiredLevel,
            current: error.data.business.currentLevel,
          })
        );
      } else if (error.data?.code === "TOO_MANY_REQUESTS") {
        toast.error(t("chat:selfieQuotaReachedCheckYourPlanOrAdd"), {
          action: {
            label: t("chat:openSettings"),
            onClick: () => setLocation("/settings"),
          },
        });
      } else if (error.data?.business?.reason === "UPGRADE_REQUIRED") {
        toast.error(t("chat:yourPlanDoesNotIncludeThisFeatureView"), {
          action: {
            label: t("chat:openSettings"),
            onClick: () => setLocation("/settings"),
          },
        });
      } else {
        toast.error(
          t("chat:selfieGenerationFailed", { error: apiErrorMessage(error, t) })
        );
      }
    },
  });

  // 合照生成
  const generateCouple = trpc.selfie.generateCouple.useMutation({
    onSuccess: async data => {
      showRelationship(data);
      await refreshConversation();
      await selfieQuota.refetch();
      scrollToBottom();
    },
    onError: error => {
      void selfieQuota.refetch();
      if (error.data?.code === "TOO_MANY_REQUESTS") {
        toast.error(t("chat:selfieQuotaReachedCheckYourPlanOrAdd"), {
          action: {
            label: t("chat:openSettings"),
            onClick: () => setLocation("/settings"),
          },
        });
      } else if (error.data?.business?.reason === "UPGRADE_REQUIRED") {
        toast.error(t("chat:yourPlanDoesNotIncludeThisFeatureView"), {
          action: {
            label: t("chat:openSettings"),
            onClick: () => setLocation("/settings"),
          },
        });
      } else {
        toast.error(
          t("chat:selfieGenerationFailed", { error: apiErrorMessage(error, t) })
        );
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
  }, [lastMessageId]);

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
      messagesEndRef.current?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
    }, 100);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !message.trim() ||
      !currentConversationId ||
      sendMessage.isPending ||
      generateSelfie.isPending ||
      generateCouple.isPending ||
      isRecording ||
      isTranscribing
    )
      return;
    inputRef.current?.focus({ preventScroll: true });

    sendMessage.mutate({
      conversationId: currentConversationId,
      content: message.trim(),
    });
  };

  const retryMessage = (failed: FailedChatMessage) => {
    if (
      sendMessage.isPending ||
      generateSelfie.isPending ||
      generateCouple.isPending ||
      isRecording ||
      isTranscribing
    )
      return;
    sendMessage.mutate(failed);
  };

  const handleSpeakMessage = (text: string, messageId: number) => {
    if (isSpeaking && activeMessageId === messageId) {
      stop();
    } else {
      speak(text, messageId);
    }
  };

  // 相机按钮改为打开姿势选择器；姿势随亲密度解锁。
  const handleSelectPose = (
    poseId: string,
    generationMode: "reference" | "text"
  ) => {
    if (!currentConversationId) return;
    if (selfieRemaining !== null && selfieRemaining <= 0) {
      toast.error(t("chat:selfieQuotaReachedCheckYourPlanOrAdd"));
      return;
    }
    generateSelfie.mutate({
      conversationId: currentConversationId,
      userContext: message.trim(),
      poseId,
      generationMode,
    });
  };

  // 合照 —— 用户照片转 base64 后与她同框。
  const handleCouplePhoto = (file: File) => {
    if (!currentConversationId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      generateCouple.mutate({
        conversationId: currentConversationId!,
        userPhotoBase64: base64,
        userPhotoMimeType: file.type,
        userContext: message.trim() || undefined,
      });
    };
    reader.onerror = () => toast.error(t("setup:couldNotReadImage"));
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
      toast.info(t("chat:recordingIsTooShortPleaseTryAgain"));
      return;
    }

    setIsTranscribing(true);

    // Blob → Base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (!base64) {
        setIsTranscribing(false);
        toast.error(t("chat:couldNotReadTheAudio"));
        return;
      }

      transcribeMutation.mutate(
        { audioBase64: base64, mimeType: result.mimeType },
        {
          onSuccess: data => {
            setIsTranscribing(false);
            if (data.text) {
              // 自动发送转写文字
              lastInputWasVoiceRef.current = true;
              sendMessage.mutate({
                conversationId: currentConversationId!,
                content: data.text,
                transcriptionId: data.transcriptionId,
              });
              // 触发语音消息亲密度经验值
            } else {
              toast.error(t("chat:noSpeechWasRecognizedPleaseTryAgain"));
            }
          },
          onError: error => {
            setIsTranscribing(false);
            toast.error(
              t("chat:transcriptionFailed", {
                error: apiErrorMessage(error, t),
              })
            );
          },
        }
      );
    };
    reader.onerror = () => {
      setIsTranscribing(false);
      toast.error(t("chat:couldNotReadTheAudio"));
    };
    reader.readAsDataURL(result.blob);
  }, [
    t,
    stopRecording,
    currentConversationId,
    setIsTranscribing,
    transcribeMutation,
    sendMessage,
  ]);

  // 注册最大时长回调
  useEffect(() => {
    setOnMaxDuration(() => handleRecordingComplete);
  }, [setOnMaxDuration, handleRecordingComplete]);
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
    excited: { emoji: "🥰", label: t("chat:excited"), color: "text-primary" },
    happy: { emoji: "😊", label: t("chat:happy"), color: "text-green-500" },
    content: { emoji: "🙂", label: t("chat:content"), color: "text-blue-500" },
    neutral: { emoji: "😐", label: t("chat:calm"), color: "text-yellow-500" },
    lonely: {
      emoji: "😢",
      label: t("chat:missingYou"),
      color: "text-purple-500",
    },
    sad: { emoji: "😭", label: t("chat:sad"), color: "text-red-500" },
  };
  const currentMoodInfo = moodData ? MOOD_CONFIG[moodData.mood] : null;

  return {
    ttsLabel,
    currentMoodInfo,
    conversationId,
    invalidConversation,
    pageError: conversationId
      ? conversationError || girlfriendsError
      : activeError || resumeChat.error,
    retryPage: () => {
      if (conversationId) {
        void retryConversation();
        void retryRoles();
      } else {
        void retryActive();
        if (girlfriend && resumeChat.error)
          resumeChat.mutate({ girlfriendId: girlfriend.id });
      }
    },
    conversationLoading,
    girlfriendsLoading,
    activeLoading,
    girlfriend,
    t,
    setLocation,
    ttsProvider,
    moodData,
    setShowIntimacyPanel,
    currentConversationId,
    createConversation,
    sendMessage,
    generateSelfie,
    generateCouple,
    isRecording,
    isTranscribing,
    autoPlay,
    toggleAutoPlay,
    playbackSpeed,
    updateSpeed,
    toggleTheme,
    theme,
    messageListRef,
    messagesQuery,
    loadOlderMessages,
    chatMessages,
    failedMessages,
    retryMessage,
    handleSpeakMessage,
    isSpeaking,
    activeMessageId,
    user,
    pendingMessageAfterId,
    messagesEndRef,
    showCrisisAlert,
    setShowCrisisAlert,
    handleSendMessage,
    setShowPoseDialog,
    apiConfig,
    selfieRemaining,
    inputMode,
    inputRef,
    message,
    setMessage,
    voiceSupported,
    switchInputMode,
    duration,
    startRecording,
    handleRecordingComplete,
    cancelRecording,
    showPoseDialog,
    billingInfo,
    handleSelectPose,
    handleCouplePhoto,
    showIntimacyPanel,
    showLevelUp,
    levelUpLevel,
    setShowLevelUp,
  };
}
export type ChatController = ReturnType<typeof useChatController>;
