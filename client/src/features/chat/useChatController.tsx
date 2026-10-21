import { acceptsUpload, uploadDescription } from "@shared/operationalConfig";
import { getLevelByPoints } from "@shared/intimacy";
import { useProductConfig } from "@/features/product/useProductConfig";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useTTS } from "@/hooks/useTTS";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useChatInputDraft } from "@/hooks/useChatInputDraft";
import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { readDeviceValue, writeDeviceValue } from "@/lib/deviceStorage";
import { detectSelfieRequest } from "@shared/selfieRequest";
import { detectSelfHarm } from "@shared/safety";
import { isChatTurnTerminal } from "@shared/chatStreaming";
import {
  ChatStreamRequestError,
  useChatStream,
  type ChatStreamDraft,
  type FailedStreamSubmission,
} from "./useChatStream";
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
  const productRules = useProductConfig();
  const { t, locale } = useI18n();

  const { user } = useAuth();

  const [, setLocation] = useLocation();

  const params = useParams();

  const conversationId = params.id ? Number(params.id) : null;

  const invalidConversation =
    params.id !== undefined &&
    (!Number.isInteger(conversationId) ||
      !conversationId ||
      conversationId < 0);

  // 闭包绑定本次账号和会话；即使旧回调在切换后才开始执行，也不能发起旧请求。
  const currentScope = useRef({ accountId: user?.id, conversationId });
  if (
    currentScope.current.accountId !== user?.id ||
    currentScope.current.conversationId !== conversationId
  )
    currentScope.current = { accountId: user?.id, conversationId };
  const identity = currentScope.current;
  const mountedScope = useRef(false);
  useEffect(() => {
    mountedScope.current = true;
    return () => {
      mountedScope.current = false;
    };
  }, []);
  const isCurrentScope = useCallback(
    () => mountedScope.current && currentScope.current === identity,
    [identity]
  );
  const recordingScope = useRef<{
    identity: typeof identity;
    token: symbol;
  } | null>(null);
  const startingRecording = useRef(false);

  const { theme, toggleTheme } = useTheme();

  const {
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
  } = useTTS();

  const [message, setMessage] = useChatInputDraft(
    user?.id,
    conversationId,
    productRules.raw?.runtime.chat.maxInputChars
  );
  const [failedMessages, setFailedMessages] = useState<FailedChatMessage[]>([]);

  const [inputMode, setInputMode] = useState<"text" | "voice">(() => {
    return readDeviceValue("chat-input-mode") === "voice" ? "voice" : "text";
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
  const pendingMediaAfterId = useRef(0);

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
  const voiceLifecycle = useRef({ cancelRecording, setIsTranscribing, stop });
  voiceLifecycle.current = { cancelRecording, setIsTranscribing, stop };
  useEffect(
    () => () => {
      recordingScope.current = null;
      voiceLifecycle.current.cancelRecording();
      voiceLifecycle.current.setIsTranscribing(false);
      voiceLifecycle.current.stop();
    },
    [identity]
  );

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
    {
      conversationId: currentConversationId!,
      limit: productRules.raw?.experience.pagination.messages,
    },
    {
      enabled: !!currentConversationId,
      getNextPageParam: page =>
        page.length === productRules.raw?.experience.pagination.messages
          ? page[0].id
          : undefined,
    }
  );

  const refetchMessages = messagesQuery.refetch;

  const historicalMessages = useMemo(
    () => messagesQuery.data?.pages.slice().reverse().flat(),
    [messagesQuery.data]
  );

  const loadOlderMessages = async () => {
    const element = messageListRef.current;
    if (!element) return;
    const beforeHeight = element.scrollHeight;
    const beforeTop = element.scrollTop;
    await messagesQuery.fetchNextPage();
    if (!isCurrentScope() || messageListRef.current !== element) return;
    requestAnimationFrame(() => {
      if (!isCurrentScope() || messageListRef.current !== element) return;
      // 浏览器可能已经补偿过前插内容；从原位置计算，避免重复叠加。
      element.scrollTop = beforeTop + element.scrollHeight - beforeHeight;
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

  const sendMediaMessage = trpc.chat.sendMessage.useMutation({
    onMutate: variables => {
      pendingMediaAfterId.current = historicalMessages?.at(-1)?.id || 0;
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

  const chatStream = useChatStream(
    invalidConversation ? null : currentConversationId,
    {
      accountId: user?.id,
      onAccepted: () => {
        void refetchMessages();
      },
      onComplete: (snapshot, draft) => {
        showRelationship(snapshot);
        if (snapshot.safetyNotice) setShowCrisisAlert(true);
        void refreshConversation();
        if (
          snapshot.status === "succeeded" &&
          (autoPlay || draft.transcriptionId) &&
          snapshot.assistantMessage.content
        ) {
          speak(
            snapshot.assistantMessage.content,
            snapshot.assistantMessage.id
          );
        }
      },
      onError: error => {
        if (error instanceof ChatStreamRequestError) {
          const reason = error.detail?.business;
          if (reason?.reason === "UPGRADE_REQUIRED") {
            toast.error(t("chat:yourPlanDoesNotIncludeThisFeatureView"), {
              action: {
                label: t("chat:openSettings"),
                onClick: () => setLocation("/settings"),
              },
            });
            return;
          }
          if (reason?.reason === "LEVEL_LOCKED") {
            toast.error(
              t("selfie:poseLocked", {
                required: reason.requiredLevel ?? 1,
                current: reason.currentLevel ?? 1,
              })
            );
            return;
          }
          toast.error(
            t(
              error.status === 429
                ? "chat:streamRateLimited"
                : error.status === 401
                  ? "chat:streamSessionExpired"
                  : "chat:streamRequestFailed"
            )
          );
          return;
        }
        toast.error(t("chat:streamNetworkUnknown"));
      },
    }
  );

  const chatMessages = useMemo(() => {
    const oldestLoadedId = historicalMessages?.[0]?.id;
    const messages = new Map(
      (historicalMessages ?? []).map(item => [item.id, item])
    );
    for (const turn of chatStream.turns) {
      // 恢复接口也返回旧终态轮次；只在翻到对应历史页后合并，避免跨页断层。
      if (
        oldestLoadedId !== undefined &&
        turn.assistantMessage.id < oldestLoadedId &&
        isChatTurnTerminal(turn.status)
      )
        continue;
      for (const item of [turn.userMessage, turn.assistantMessage]) {
        const saved = messages.get(item.id);
        // 已刷新的历史终态优先于被补发后保留的旧运行快照。
        if (
          saved &&
          saved.generationStatus !== "pending" &&
          !isChatTurnTerminal(turn.status)
        )
          continue;
        messages.set(item.id, { ...item, createdAt: new Date(item.createdAt) });
      }
    }
    return Array.from(messages.values()).sort((a, b) => a.id - b.id);
  }, [historicalMessages, chatStream.turns]);
  const isAccepting = chatStream.isAccepting || sendMediaMessage.isPending;
  const stopChatStream = chatStream.stop;
  const submitStream = chatStream.submit;

  useEffect(() => {
    if (chatStream.snapshot?.safetyNotice) setShowCrisisAlert(true);
  }, [chatStream.snapshot?.safetyNotice]);

  // 今日自拍额度（BYOK fal 用户无限制）
  const selfieQuota = trpc.selfie.quota.useQuery(undefined, {
    refetchInterval:
      productRules.raw?.experience.transport.clientPollMs ?? false,
    refetchOnWindowFocus: true,
  });

  // 合照权限读取当前套餐配置。
  const { data: billingInfo } = trpc.billing.getInfo.useQuery(undefined, {
    refetchInterval:
      productRules.raw?.experience.transport.clientPollMs ?? false,
    refetchOnWindowFocus: true,
  });

  const selfieRemaining = selfieQuota.data?.unlimited
    ? Infinity
    : (selfieQuota.data?.remaining ?? null);

  const generateSelfie = trpc.selfie.generate.useMutation({
    onSuccess: async data => {
      showRelationship(data);
      await refreshConversation();
      await selfieQuota.refetch();
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
      resumeConversation({ girlfriendId: girlfriend.id, locale });
    }
  }, [currentConversationId, girlfriend, resumeConversation, locale]);

  // 预加载浏览器语音列表
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const viewport = messageListRef.current;
    setTimeout(() => {
      if (!isCurrentScope() || messageListRef.current !== viewport) return;
      messagesEndRef.current?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
    }, 100);
  }, [isCurrentScope]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !isCurrentScope() ||
      !message.trim() ||
      !currentConversationId ||
      isAccepting ||
      generateSelfie.isPending ||
      generateCouple.isPending ||
      isRecording ||
      isTranscribing
    )
      return;
    inputRef.current?.focus({ preventScroll: true });

    const content = message.trim();
    setMessage("");
    void submitChat({ content });
  };

  const retryMessage = (failed: FailedChatMessage) => {
    if (
      !isCurrentScope() ||
      isAccepting ||
      generateSelfie.isPending ||
      generateCouple.isPending ||
      isRecording ||
      isTranscribing
    )
      return;
    stop();
    void chatStream.stop().then(stopped => {
      if (stopped && isCurrentScope()) sendMediaMessage.mutate(failed);
    });
  };

  /** 自拍仍走媒体生成路径；补发文字由服务端原子停止上一轮并开始新轮。 */
  const submitChat = useCallback(
    async (draft: ChatStreamDraft) => {
      if (!currentConversationId || !isCurrentScope()) return;
      stop();
      let rules = productRules.raw;
      try {
        rules ??= await utils.productConfig.get.fetch();
      } catch (error) {
        if (!isCurrentScope()) return;
        setFailedMessages(current => [
          ...current,
          { ...draft, conversationId: currentConversationId },
        ]);
        toast.error(apiErrorMessage(error as Error, t));
        return;
      }
      if (!isCurrentScope()) return;
      if (
        detectSelfieRequest(
          draft.content,
          rules.selfies.poses,
          rules.selfies.defaultPoseId
        ) &&
        !detectSelfHarm(draft.content)
      ) {
        const stopped = await stopChatStream();
        if (!isCurrentScope()) return;
        if (stopped) {
          lastInputWasVoiceRef.current = !!draft.transcriptionId;
          sendMediaMessage.mutate({
            ...draft,
            conversationId: currentConversationId,
          });
        } else {
          setFailedMessages(current => [
            ...current,
            { ...draft, conversationId: currentConversationId },
          ]);
        }
        return;
      }
      // 主动发送时回到末尾；后续流式更新由滚动锚点跟随，尊重向上阅读。
      scrollToBottom();
      await submitStream(draft);
    },
    [
      productRules.raw,
      utils.productConfig.get,
      t,
      currentConversationId,
      stop,
      stopChatStream,
      submitStream,
      sendMediaMessage,
      isCurrentScope,
      scrollToBottom,
    ]
  );
  const handleStopGeneration = async () => {
    if (!isCurrentScope()) return;
    stop();
    if ((await chatStream.stop()) && isCurrentScope())
      await refreshConversation();
  };
  const retryStreamSubmission = (failed: FailedStreamSubmission) => {
    if (
      !isCurrentScope() ||
      isAccepting ||
      generateSelfie.isPending ||
      generateCouple.isPending
    )
      return;
    stop();
    void chatStream.retry(failed);
  };
  const retryFailedGeneration = (messageId: number) => {
    if (
      !isCurrentScope() ||
      isAccepting ||
      generateSelfie.isPending ||
      generateCouple.isPending
    )
      return;
    const previous = chatMessages
      .filter(item => item.id < messageId)
      .reverse()
      .find(item => item.role === "user");
    if (previous) void submitChat({ content: previous.content });
  };

  const handleSpeakMessage = useCallback(
    (text: string, messageId: number) => {
      if (!isCurrentScope()) return;
      if (isSpeaking && activeMessageId === messageId) {
        stop();
      } else {
        speak(text, messageId);
      }
    },
    [isCurrentScope, isSpeaking, activeMessageId, stop, speak]
  );

  // 相机按钮改为打开姿势选择器；姿势随亲密度解锁。
  const handleSelectPose = async (
    poseId: string,
    generationMode: "reference" | "text"
  ) => {
    if (!currentConversationId || !isCurrentScope()) return;
    if (selfieRemaining !== null && selfieRemaining <= 0) {
      toast.error(t("chat:selfieQuotaReachedCheckYourPlanOrAdd"));
      return;
    }
    stop();
    if (!(await chatStream.stop()) || !isCurrentScope()) return;
    generateSelfie.mutate({
      conversationId: currentConversationId,
      userContext: message.trim(),
      poseId,
      generationMode,
    });
  };

  // 合照 —— 用户照片转 base64 后与她同框。
  const handleCouplePhoto = (file: File) => {
    if (!currentConversationId || !isCurrentScope()) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (!isCurrentScope()) return;
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      stop();
      if (!(await chatStream.stop()) || !isCurrentScope()) return;
      generateCouple.mutate({
        conversationId: currentConversationId!,
        userPhotoBase64: base64,
        userPhotoMimeType: file.type,
        userContext: message.trim() || undefined,
      });
    };
    reader.onerror = () => {
      if (isCurrentScope()) toast.error(t("setup:couldNotReadImage"));
    };
    reader.readAsDataURL(file);
  };

  // 语音/文字模式切换
  const switchInputMode = useCallback((mode: "text" | "voice") => {
    setInputMode(mode);
    writeDeviceValue("chat-input-mode", mode);
  }, []);

  // 处理录音完成
  const handleRecordingComplete = useCallback(async () => {
    const recording = recordingScope.current;
    if (!isCurrentScope() || !recording || recording.identity !== identity)
      return;
    const recordingIsCurrent = () =>
      isCurrentScope() && recordingScope.current === recording;
    const currentDuration = recordingDurationRef.current;
    const result = await stopRecording();
    if (!recordingIsCurrent() || !result || !currentConversationId) return;

    // 最短录音时长检查
    if (
      currentDuration <
      (productRules.raw?.experience.minimumRecordingSeconds ?? Infinity)
    ) {
      toast.info(t("chat:recordingIsTooShortPleaseTryAgain"));
      return;
    }

    const audio = productRules.raw?.uploads.audio;
    if (
      !audio ||
      !acceptsUpload(audio, { size: result.blob.size, type: result.mimeType })
    ) {
      toast.error(
        t(
          "chat:invalidRecording",
          audio ? uploadDescription(audio) : { formats: "", maxSize: "" }
        )
      );
      return;
    }
    setIsTranscribing(true);

    // Blob → Base64
    const reader = new FileReader();
    reader.onloadend = () => {
      if (!recordingIsCurrent()) return;
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
            if (!recordingIsCurrent()) return;
            recordingScope.current = null;
            setIsTranscribing(false);
            if (data.text) {
              // 自动发送转写文字
              lastInputWasVoiceRef.current = true;
              void submitChat({
                content: data.text,
                transcriptionId: data.transcriptionId,
              });
              // 触发语音消息亲密度经验值
            } else {
              toast.error(t("chat:noSpeechWasRecognizedPleaseTryAgain"));
            }
          },
          onError: error => {
            if (!recordingIsCurrent()) return;
            recordingScope.current = null;
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
      if (!recordingIsCurrent()) return;
      recordingScope.current = null;
      setIsTranscribing(false);
      toast.error(t("chat:couldNotReadTheAudio"));
    };
    reader.readAsDataURL(result.blob);
  }, [
    productRules.raw?.uploads.audio,
    productRules.raw?.experience.minimumRecordingSeconds,
    t,
    stopRecording,
    currentConversationId,
    setIsTranscribing,
    transcribeMutation,
    submitChat,
    isCurrentScope,
    identity,
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

  const currentMoodInfo = moodData
    ? (productRules.data?.emotion.moods[moodData.mood] ?? null)
    : null;

  return {
    maxMessageLength: productRules.raw?.runtime.chat.maxInputChars,
    effectiveIntimacyLevel: productRules.data
      ? getLevelByPoints(
          girlfriend?.intimacyPoints ?? 0,
          productRules.data.intimacy.levels
        ).level
      : 0,
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
    sendMediaMessage,
    chatStream,
    isAccepting,
    handleStopGeneration,
    retryStreamSubmission,
    retryFailedGeneration,
    pendingMediaAfterId,
    generateSelfie,
    generateCouple,
    isRecording,
    isTranscribing,
    autoPlay,
    toggleAutoPlay,
    speedOptions,
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
    startRecording: async () => {
      if (!isCurrentScope() || startingRecording.current) return;
      startingRecording.current = true;
      const recording = { identity, token: Symbol() };
      recordingScope.current = recording;
      stop();
      try {
        await startRecording();
      } finally {
        startingRecording.current = false;
        if (!isCurrentScope() || recordingScope.current !== recording)
          cancelRecording();
      }
    },
    handleRecordingComplete,
    cancelRecording: () => {
      if (!isCurrentScope()) return;
      recordingScope.current = null;
      cancelRecording();
      setIsTranscribing(false);
    },
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
