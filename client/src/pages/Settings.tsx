import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Loader2,
  Save,
  Volume2,
  Sun,
  Moon,
  Search,
  Check,
  ExternalLink,
  Zap,
  Mic,
  Music,
  Globe,
  Brain,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { BillingCard } from "@/components/BillingCard";
import { PushCard } from "@/components/PushCard";

type ModelInfo = {
  id: string;
  name: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
  provider: string;
};

type ElevenLabsVoice = {
  id: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  labels: Record<string, string>;
};

type FishAudioModel = {
  id: string;
  name: string;
  description: string;
  tags: string[];
};

type TTSProvider = "browser" | "elevenlabs" | "fishaudio";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();

  // API Key states
  const [falApiKey, setFalApiKey] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [showModelList, setShowModelList] = useState(false);

  // TTS states
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>("browser");

  // Whisper 语音转写配置 states
  const [whisperProvider, setWhisperProvider] = useState<"manus" | "openai">(
    "manus"
  );
  const [whisperApiKey, setWhisperApiKey] = useState("");
  const [hasUnsavedWhisperChanges, setHasUnsavedWhisperChanges] =
    useState(false);
  const [ttsAutoPlay, setTtsAutoPlay] = useState(() => {
    return localStorage.getItem("tts-autoplay") === "true";
  });

  // ElevenLabs states
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState("");
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState("");
  const [elevenlabsVoiceName, setElevenlabsVoiceName] = useState("");
  const [showElevenLabsVoices, setShowElevenLabsVoices] = useState(false);
  const [elevenLabsSearch, setElevenLabsSearch] = useState("");

  // Fish Audio states
  const [fishAudioApiKey, setFishAudioApiKey] = useState("");
  const [fishAudioModelId, setFishAudioModelId] = useState("");
  const [fishAudioModelName, setFishAudioModelName] = useState("");
  const [showFishAudioModels, setShowFishAudioModels] = useState(false);
  const [fishAudioSearch, setFishAudioSearch] = useState("");

  // LLM 配置变更追踪
  const [hasUnsavedLlmChanges, setHasUnsavedLlmChanges] = useState(false);

  // 语音配置变更追踪
  const [hasUnsavedVoiceChanges, setHasUnsavedVoiceChanges] = useState(false);

  // fal.ai 配置变更追踪
  const [hasUnsavedFalChanges, setHasUnsavedFalChanges] = useState(false);

  // AI 行为设定变更追踪
  const [hasUnsavedAiChanges, setHasUnsavedAiChanges] = useState(false);

  // 模型收藏列表（localStorage 存储）
  const [favoriteModels, setFavoriteModels] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("favorite-models") || "[]");
    } catch {
      return [];
    }
  });

  // 全局提示词 states
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [replyLanguage, setReplyLanguage] = useState("");
  const [replyLengthLimit, setReplyLengthLimit] = useState("");
  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);

  // 快捷模板
  const promptTemplates = [
    {
      label: "🏠 日常陪伴",
      text: "回复要温柔体贴，多关心对方的日常生活，适当使用可爱的表情和语气词，像真实的女友一样聊天。",
    },
    {
      label: "🎭 角色扮演",
      text: "始终保持角色设定，不要跳出角色。回复时融入角色的性格特点和语言习惯，让对话更有沉浸感。",
    },
    {
      label: "✨ 简短回复",
      text: "回复要简洁，每次不超过 2-3 句话。用口语化的表达，像微信聊天一样自然。",
    },
    {
      label: "💬 深度对话",
      text: "可以进行深入的话题讨论，分享观点和想法，回复可以稍长一些，展现思考深度和情感共鸣。",
    },
    {
      label: "🌟 活泼搞怪",
      text: "回复要充满活力和幽默感，经常开玩笑、吐槽、撩人，语气俏皮可爱，让人忍不住笑。",
    },
    {
      label: "🌿 治愈系",
      text: "回复要温暖治愈，充满关怀和鼓励。当对方不开心时要特别温柔，像一个安全温暖的港湾。",
    },
  ];

  // 加载已有配置（Phase 1b-i shape: { preferences, keys }）
  const { data: apiConfig, isLoading } = trpc.apiConfig.get.useQuery();

  // 服务端解析运营方或用户密钥，前端只获取可用状态。
  const usesDeepSeek = apiConfig?.chatProvider.name === "deepseek";
  const openRouterReady =
    !!apiConfig?.chatProvider.configured ||
    !!apiConfig?.keys.openrouter.isSet ||
    openRouterKey.length > 10;
  const {
    data: modelsData,
    isLoading: modelsLoading,
    error: modelsError,
  } = trpc.apiConfig.listModels.useQuery(undefined, {
    enabled: openRouterReady && !usesDeepSeek,
    retry: false,
  });

  // ElevenLabs 声音列表
  const elevenLabsReady =
    !!apiConfig?.keys.elevenlabs.isSet || elevenlabsApiKey.length > 10;
  const {
    data: elevenLabsData,
    isLoading: elevenLabsLoading,
    error: elevenLabsError,
  } = trpc.apiConfig.listElevenLabsVoices.useQuery(undefined, {
    enabled: elevenLabsReady,
    retry: false,
  });

  // Fish Audio 模型列表
  const fishAudioReady =
    !!apiConfig?.keys["fish-audio"].isSet || fishAudioApiKey.length > 10;
  const {
    data: fishAudioData,
    isLoading: fishAudioLoading,
    error: fishAudioError,
  } = trpc.apiConfig.listFishAudioModels.useQuery(
    { search: fishAudioSearch || undefined },
    { enabled: fishAudioReady, retry: false }
  );

  // Phase 1b-i (issue #2): preferences vs keys are now separate mutations.
  const updatePreferences = trpc.apiConfig.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("配置保存成功");
    },
    onError: error => {
      toast.error(`保存失败：${error.message}`);
    },
  });

  const setKeyMutation = trpc.apiConfig.setKey.useMutation();
  const utils2 = trpc.useUtils();

  /**
   * Save any non-empty BYOK keys the user has typed in. Each `setKey` is
   * a separate mutation so a single bad key doesn't drop the others.
   * Returns the count of successfully saved keys, for the toast.
   */
  async function saveDirtyKeys() {
    const pending: Array<{
      name: "openrouter" | "fal" | "elevenlabs" | "fish-audio" | "openai";
      value: string;
    }> = [];
    if (openRouterKey)
      pending.push({ name: "openrouter", value: openRouterKey });
    if (falApiKey) pending.push({ name: "fal", value: falApiKey });
    if (elevenlabsApiKey)
      pending.push({ name: "elevenlabs", value: elevenlabsApiKey });
    if (fishAudioApiKey)
      pending.push({ name: "fish-audio", value: fishAudioApiKey });
    if (whisperApiKey) pending.push({ name: "openai", value: whisperApiKey });

    let saved = 0;
    for (const { name, value } of pending) {
      try {
        await setKeyMutation.mutateAsync({ name, value });
        saved++;
      } catch (err: any) {
        toast.error(`${name} 密钥保存失败：${err?.message ?? "unknown"}`);
      }
    }
    if (saved > 0) {
      // Clear in-memory plaintext copies so they don't linger in the
      // React tree. The fresh `apiConfig.get` invalidation refreshes
      // the masked `keys` map for display.
      setOpenRouterKey("");
      setFalApiKey("");
      setElevenlabsApiKey("");
      setFishAudioApiKey("");
      setWhisperApiKey("");
      utils2.apiConfig.get.invalidate();
    }
    return saved;
  }

  // TTS 测试
  const ttsGenerate = trpc.tts.generate.useMutation({
    onError: error => {
      toast.error(`语音测试失败：${error.message}`);
    },
  });

  useEffect(() => {
    if (apiConfig?.chatProvider.name === "deepseek") {
      setSelectedModel(apiConfig.chatProvider.model);
    } else if (apiConfig) {
      setSelectedModel(apiConfig.preferences?.llmModel || "");
    }
    if (apiConfig?.preferences) {
      // Phase 1b-i: per-user keys no longer round-trip to the client.
      // The plaintext input fields stay empty on load; if the user has
      // a saved key the UI shows "(已保存 · 末四位 XXXX)" derived from
      // `apiConfig.keys[name].lastFour`. Typing into the field again
      // replaces the stored value via `setKey` on save.
      const p = apiConfig.preferences;
      setTtsProvider((p.ttsProvider as TTSProvider) || "browser");
      setElevenlabsVoiceId(p.elevenlabsVoiceId || "");
      setElevenlabsVoiceName(p.elevenlabsVoiceName || "");
      setFishAudioModelId(p.fishAudioModelId || "");
      setFishAudioModelName(p.fishAudioModelName || "");
      setGlobalPrompt(p.globalPrompt || "");
      setReplyLanguage(p.replyLanguage || "");
      setReplyLengthLimit(p.replyLengthLimit || "");
      setWhisperProvider((p.whisperProvider as "manus" | "openai") || "manus");
    }
  }, [apiConfig]);

  // 过滤 OpenRouter 模型
  const filteredModels = useMemo(() => {
    if (!modelsData?.models) return [];
    const search = modelSearch.toLowerCase().trim();
    if (!search) return modelsData.models;
    return modelsData.models.filter(
      (m: ModelInfo) =>
        m.name.toLowerCase().includes(search) ||
        m.id.toLowerCase().includes(search) ||
        m.provider.toLowerCase().includes(search)
    );
  }, [modelsData?.models, modelSearch]);

  // 过滤 ElevenLabs 声音
  const filteredElevenLabsVoices = useMemo(() => {
    if (!elevenLabsData?.voices) return [];
    const search = elevenLabsSearch.toLowerCase().trim();
    if (!search) return elevenLabsData.voices;
    return elevenLabsData.voices.filter(
      (v: ElevenLabsVoice) =>
        v.name.toLowerCase().includes(search) ||
        v.category.toLowerCase().includes(search) ||
        v.description.toLowerCase().includes(search)
    );
  }, [elevenLabsData?.voices, elevenLabsSearch]);

  // 按 category 分组 ElevenLabs 声音
  const groupedElevenLabsVoices = useMemo(() => {
    const groups: Record<string, ElevenLabsVoice[]> = {};
    for (const voice of filteredElevenLabsVoices) {
      const cat = voice.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(voice);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredElevenLabsVoices]);

  // 过滤 Fish Audio 模型
  const filteredFishAudioModels = useMemo(() => {
    if (!fishAudioData?.models) return [];
    return fishAudioData.models;
  }, [fishAudioData?.models]);

  const selectedModelInfo = useMemo(() => {
    if (!modelsData?.models || !selectedModel) return null;
    return modelsData.models.find((m: ModelInfo) => m.id === selectedModel);
  }, [modelsData?.models, selectedModel]);

  const handleSave = async () => {
    // Phase 1b-i: preferences and keys are saved through separate
    // endpoints so the wire never carries plaintext key + non-key payload
    // in the same call.
    await updatePreferences.mutateAsync({
      llmModel: selectedModel || undefined,
      ttsProvider,
      elevenlabsVoiceId: elevenlabsVoiceId || undefined,
      elevenlabsVoiceName: elevenlabsVoiceName || undefined,
      fishAudioModelId: fishAudioModelId || undefined,
      fishAudioModelName: fishAudioModelName || undefined,
      globalPrompt: globalPrompt || null,
      replyLanguage: replyLanguage || null,
      replyLengthLimit: replyLengthLimit || null,
    });
    await saveDirtyKeys();
  };

  const handleTtsToggle = useCallback((checked: boolean) => {
    setTtsAutoPlay(checked);
    localStorage.setItem("tts-autoplay", String(checked));
    toast.success(checked ? "已开启自动语音" : "已关闭自动语音");
  }, []);

  const handleTestBrowserVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      toast.error("当前浏览器不支持语音功能");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      "你好呀，我是你的虚拟女友，很高兴认识你~"
    );
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    utterance.pitch = 1.2;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice =
      voices.find(
        v =>
          v.lang.startsWith("zh") &&
          (v.name.toLowerCase().includes("female") ||
            v.name.includes("Xiaoxiao") ||
            v.name.includes("女"))
      ) || voices.find(v => v.lang.startsWith("zh"));
    if (zhVoice) utterance.voice = zhVoice;
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleTestApiVoice = useCallback(async () => {
    // 先保存当前配置
    toast.info("正在生成语音测试...");
    ttsGenerate.mutate(
      { text: "你好呀，我是你的虚拟女友，很高兴认识你~" },
      {
        onSuccess: data => {
          const audio = new Audio(data.audioUrl);
          audio.play();
          toast.success("语音播放中");
        },
      }
    );
  }, [ttsGenerate]);

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    setShowModelList(false);
    setHasUnsavedLlmChanges(true);
    toast.info(`已选择模型：${modelId}，请点击"保存生效"确认`);
  };

  const handleSaveLlmConfig = async () => {
    await updatePreferences.mutateAsync({
      llmModel: selectedModel || undefined,
    });
    await saveDirtyKeys();
    setHasUnsavedLlmChanges(false);
    toast.success("LLM 配置已保存生效");
  };

  const handleSelectElevenLabsVoice = (voice: ElevenLabsVoice) => {
    setElevenlabsVoiceId(voice.id);
    setElevenlabsVoiceName(voice.name);
    setShowElevenLabsVoices(false);
    setHasUnsavedVoiceChanges(true);
    toast.info(`已选择声音：${voice.name}，请点击"保存生效"确认`);
  };

  const handleSelectFishAudioModel = (model: FishAudioModel) => {
    setFishAudioModelId(model.id);
    setFishAudioModelName(model.name);
    setShowFishAudioModels(false);
    setHasUnsavedVoiceChanges(true);
    toast.info(`已选择声音：${model.name}，请点击"保存生效"确认`);
  };

  const handleSaveVoiceConfig = async () => {
    await updatePreferences.mutateAsync({
      ttsProvider,
      elevenlabsVoiceId: elevenlabsVoiceId || undefined,
      elevenlabsVoiceName: elevenlabsVoiceName || undefined,
      fishAudioModelId: fishAudioModelId || undefined,
      fishAudioModelName: fishAudioModelName || undefined,
    });
    await saveDirtyKeys();
    setHasUnsavedVoiceChanges(false);
    toast.success("语音配置已保存生效");
  };

  const handleSaveWhisperConfig = async () => {
    await updatePreferences.mutateAsync({
      whisperProvider,
    });
    await saveDirtyKeys();
    setHasUnsavedWhisperChanges(false);
    toast.success("语音转写配置已保存生效");
  };

  const handleSaveAiConfig = async () => {
    await updatePreferences.mutateAsync({
      globalPrompt: globalPrompt || null,
      replyLanguage: replyLanguage || null,
      replyLengthLimit: replyLengthLimit || null,
    });
    setHasUnsavedAiChanges(false);
    toast.success("AI 行为设定已保存生效");
  };

  // 模型收藏操作
  const toggleFavoriteModel = (modelId: string) => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem("favorite-models", JSON.stringify(next));
      toast.success(next.includes(modelId) ? `已收藏模型` : `已取消收藏`);
      return next;
    });
  };

  // ============ API 用量查询 ============
  // Phase 1b-i (issue #2/#3) removed the per-provider credits/usage tRPC
  // routes. Real per-user usage will surface through the subscription
  // quota meters built in Phase 1c (issue #10). For now these UI fields
  // render as "—" / "loading off". The visual section below will be
  // rebuilt in Phase 6 when Settings.tsx is decomposed.
  const openRouterCredits = undefined as
    | { totalCredits: number; totalUsage: number; remaining: number }
    | undefined;
  const orCreditsLoading = false;
  const orCreditsError = null as { message: string } | null;
  const elevenLabsUsage = undefined as
    | {
        tier: string;
        characterCount: number;
        characterLimit: number;
        remaining: number;
        status: string;
      }
    | undefined;
  const elUsageLoading = false;
  const elUsageError = null as { message: string } | null;
  const fishAudioCredits = undefined as
    | { credit: number; hasFreeCredit: boolean }
    | undefined;
  const faCreditsLoading = false;
  const faCreditsError = null as { message: string } | null;

  const handleRefreshUsage = () => {
    toast.info("订阅用量面板将在 Phase 1c 上线（issue #10）");
    toast.info("正在刷新用量数据...");
  };

  // 计算是否有任何可用的用量数据
  const hasAnyUsageData =
    (openRouterKey.length > 10 && !!modelsData) ||
    (elevenlabsApiKey.length > 10 && !!elevenLabsData) ||
    (fishAudioApiKey.length > 10 && !!fishAudioData) ||
    falApiKey.length >= 10;

  // API Key 有效性状态派生
  const openRouterKeyStatus = useMemo(() => {
    if (!openRouterKey || openRouterKey.length <= 10) return "empty";
    if (modelsLoading) return "loading";
    if (modelsError) return "invalid";
    if (modelsData) return "valid";
    return "loading";
  }, [openRouterKey, modelsLoading, modelsError, modelsData]);

  const elevenLabsKeyStatus = useMemo(() => {
    if (!elevenlabsApiKey || elevenlabsApiKey.length <= 10) return "empty";
    if (elevenLabsLoading) return "loading";
    if (elevenLabsError) return "invalid";
    if (elevenLabsData) return "valid";
    return "loading";
  }, [elevenlabsApiKey, elevenLabsLoading, elevenLabsError, elevenLabsData]);

  const fishAudioKeyStatus = useMemo(() => {
    if (!fishAudioApiKey || fishAudioApiKey.length <= 10) return "empty";
    if (fishAudioLoading) return "loading";
    if (fishAudioError) return "invalid";
    if (fishAudioData) return "valid";
    return "loading";
  }, [fishAudioApiKey, fishAudioLoading, fishAudioError, fishAudioData]);

  // fal.ai key 简单格式验证（无对应的模型列表 API，仅检查格式）
  const falKeyStatus = useMemo(() => {
    if (!falApiKey || falApiKey.length === 0) return "empty";
    if (falApiKey.length < 10) return "invalid";
    return "valid";
  }, [falApiKey]);

  // API Key 状态指示器组件
  const KeyStatusIndicator = ({ status }: { status: string }) => {
    switch (status) {
      case "valid":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3.5 h-3.5" />
            已验证
          </span>
        );
      case "invalid":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-red-500">
            <XCircle className="w-3.5 h-3.5" />
            无效
          </span>
        );
      case "loading":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            验证中...
          </span>
        );
      default:
        return null;
    }
  };

  const handleSaveFalConfig = async () => {
    // No fal-specific preference fields beyond the encrypted key, so this
    // handler only saves dirty BYOK keys.
    await saveDirtyKeys();
    setHasUnsavedFalChanges(false);
    toast.success("fal.ai 配置已保存生效");
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num === 0) return "免费";
    if (num < 0.000001) return `$${num.toExponential(1)}`;
    return `$${num.toFixed(6)}`;
  };

  const ttsProviderOptions: {
    value: TTSProvider;
    label: string;
    icon: React.ReactNode;
    desc: string;
  }[] = [
    {
      value: "browser",
      label: "浏览器内置语音",
      icon: <Globe className="w-5 h-5" />,
      desc: "免费，使用浏览器 Web Speech API",
    },
    {
      value: "elevenlabs",
      label: "ElevenLabs",
      icon: <Mic className="w-5 h-5" />,
      desc: "高品质 AI 语音，支持声音克隆",
    },
    {
      value: "fishaudio",
      label: "Fish Audio",
      icon: <Music className="w-5 h-5" />,
      desc: "中文语音优化，丰富的声音模型",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航栏 */}
      <header
        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b bg-card sticky top-0 z-10"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-base sm:text-lg font-semibold flex-1">设置</h1>
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "light" ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
        </Button>
      </header>

      {/* 设置内容 */}
      <div className="p-3 sm:p-4 max-w-2xl mx-auto space-y-4 sm:space-y-6 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ========== 订阅与用量（M3） ========== */}
            <BillingCard />

            {/* ========== 推送通知（M4-4） ========== */}
            <PushCard />

            {/* ========== 语音设置 ========== */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-primary" />
                  语音设置
                </CardTitle>
                <CardDescription>
                  选择语音引擎，让 AI 女友用你喜欢的声音说话
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 自动播放开关 */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>自动语音播放</Label>
                    <p className="text-xs text-muted-foreground">
                      开启后，AI 女友的每条回复都会自动朗读
                    </p>
                  </div>
                  <Switch
                    checked={ttsAutoPlay}
                    onCheckedChange={handleTtsToggle}
                  />
                </div>

                {/* 语音引擎选择 */}
                <div className="space-y-3">
                  <Label>语音引擎</Label>
                  <div className="grid gap-3">
                    {ttsProviderOptions.map(option => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setTtsProvider(option.value);
                          setHasUnsavedVoiceChanges(true);
                        }}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                          ttsProvider === option.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:border-primary/30 hover:bg-accent/30"
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg ${
                            ttsProvider === option.value
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {option.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {option.label}
                            </span>
                            {option.value === "browser" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
                                免费
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {option.desc}
                          </p>
                        </div>
                        {ttsProvider === option.value && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ===== 浏览器内置语音配置 ===== */}
                {ttsProvider === "browser" && (
                  <div className="space-y-3 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestBrowserVoice}
                    >
                      <Volume2 className="w-4 h-4 mr-2" />
                      测试浏览器语音
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      浏览器内置语音免费使用，语音质量取决于你的操作系统和浏览器。
                    </p>
                  </div>
                )}

                {/* ===== ElevenLabs 配置 ===== */}
                {ttsProvider === "elevenlabs" && (
                  <div className="space-y-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label
                        htmlFor="elevenlabsKey"
                        className="flex items-center justify-between"
                      >
                        <span>ElevenLabs API Key</span>
                        <KeyStatusIndicator status={elevenLabsKeyStatus} />
                      </Label>
                      <Input
                        id="elevenlabsKey"
                        type="password"
                        placeholder="输入你的 ElevenLabs API Key"
                        value={elevenlabsApiKey}
                        onChange={e => {
                          setElevenlabsApiKey(e.target.value);
                          setHasUnsavedVoiceChanges(true);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        获取 API Key：
                        <a
                          href="https://elevenlabs.io/app/settings/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                        >
                          elevenlabs.io <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* 加载状态 */}
                    {elevenlabsApiKey.length > 10 && elevenLabsLoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          正在加载声音列表...
                        </span>
                      </div>
                    )}

                    {/* 错误提示 */}
                    {elevenLabsError && (
                      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                        {elevenLabsError.message}
                      </div>
                    )}

                    {/* 已选择的声音 */}
                    {elevenlabsVoiceId && (
                      <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-primary" />
                              <span className="font-medium text-sm">
                                当前声音
                              </span>
                            </div>
                            <p className="text-sm mt-1">
                              {elevenlabsVoiceName || elevenlabsVoiceId}
                            </p>
                          </div>
                          {elevenLabsData && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setShowElevenLabsVoices(!showElevenLabsVoices)
                              }
                            >
                              更换声音
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 声音列表 */}
                    {elevenLabsData &&
                      !elevenLabsLoading &&
                      (showElevenLabsVoices || !elevenlabsVoiceId) && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>
                              选择声音（共 {elevenLabsData.total} 个可用）
                            </Label>
                            {elevenlabsVoiceId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowElevenLabsVoices(false)}
                              >
                                收起
                              </Button>
                            )}
                          </div>

                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="搜索声音名称..."
                              value={elevenLabsSearch}
                              onChange={e =>
                                setElevenLabsSearch(e.target.value)
                              }
                              className="pl-9"
                            />
                          </div>

                          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                            {groupedElevenLabsVoices.length === 0 ? (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                没有找到匹配的声音
                              </div>
                            ) : (
                              groupedElevenLabsVoices.map(
                                ([category, voices]) => (
                                  <div key={category}>
                                    <div className="px-3 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase sticky top-0">
                                      {category} ({voices.length})
                                    </div>
                                    {voices.map((voice: ElevenLabsVoice) => (
                                      <button
                                        key={voice.id}
                                        className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors flex items-center justify-between gap-2 ${
                                          elevenlabsVoiceId === voice.id
                                            ? "bg-primary/10 border-l-2 border-primary"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          handleSelectElevenLabsVoice(voice)
                                        }
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">
                                              {voice.name}
                                            </span>
                                            {elevenlabsVoiceId === voice.id && (
                                              <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                                            )}
                                          </div>
                                          {voice.description && (
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                              {voice.description}
                                            </p>
                                          )}
                                        </div>
                                        {voice.previewUrl && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="shrink-0 h-7 w-7 p-0"
                                            onClick={e => {
                                              e.stopPropagation();
                                              const audio = new Audio(
                                                voice.previewUrl
                                              );
                                              audio.play();
                                            }}
                                            title="试听"
                                          >
                                            <Volume2 className="w-3.5 h-3.5" />
                                          </Button>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {/* 测试按钮 */}
                    {elevenlabsVoiceId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestApiVoice}
                        disabled={ttsGenerate.isPending}
                      >
                        {ttsGenerate.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Volume2 className="w-4 h-4 mr-2" />
                        )}
                        测试 ElevenLabs 语音
                      </Button>
                    )}
                  </div>
                )}

                {/* ===== Fish Audio 配置 ===== */}
                {ttsProvider === "fishaudio" && (
                  <div className="space-y-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label
                        htmlFor="fishAudioKey"
                        className="flex items-center justify-between"
                      >
                        <span>Fish Audio API Key</span>
                        <KeyStatusIndicator status={fishAudioKeyStatus} />
                      </Label>
                      <Input
                        id="fishAudioKey"
                        type="password"
                        placeholder="输入你的 Fish Audio API Key"
                        value={fishAudioApiKey}
                        onChange={e => {
                          setFishAudioApiKey(e.target.value);
                          setHasUnsavedVoiceChanges(true);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        获取 API Key：
                        <a
                          href="https://fish.audio/zh-CN/go-api/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                        >
                          fish.audio <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* 加载状态 */}
                    {fishAudioApiKey.length > 10 && fishAudioLoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          正在加载声音模型列表...
                        </span>
                      </div>
                    )}

                    {/* 错误提示 */}
                    {fishAudioError && (
                      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                        {fishAudioError.message}
                      </div>
                    )}

                    {/* 已选择的声音模型 */}
                    {fishAudioModelId && (
                      <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-primary" />
                              <span className="font-medium text-sm">
                                当前声音模型
                              </span>
                            </div>
                            <p className="text-sm mt-1">
                              {fishAudioModelName || fishAudioModelId}
                            </p>
                          </div>
                          {fishAudioData && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setShowFishAudioModels(!showFishAudioModels)
                              }
                            >
                              更换模型
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 声音模型列表 */}
                    {fishAudioData &&
                      !fishAudioLoading &&
                      (showFishAudioModels || !fishAudioModelId) && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>
                              选择声音模型（共 {fishAudioData.total} 个可用）
                            </Label>
                            {fishAudioModelId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowFishAudioModels(false)}
                              >
                                收起
                              </Button>
                            )}
                          </div>

                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="搜索声音模型名称..."
                              value={fishAudioSearch}
                              onChange={e => setFishAudioSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>

                          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                            {filteredFishAudioModels.length === 0 ? (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                没有找到匹配的声音模型
                              </div>
                            ) : (
                              filteredFishAudioModels.map(
                                (model: FishAudioModel) => (
                                  <button
                                    key={model.id}
                                    className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors ${
                                      fishAudioModelId === model.id
                                        ? "bg-primary/10 border-l-2 border-primary"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      handleSelectFishAudioModel(model)
                                    }
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">
                                            {model.name}
                                          </span>
                                          {fishAudioModelId === model.id && (
                                            <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                                          )}
                                        </div>
                                        {model.description && (
                                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                                            {model.description}
                                          </p>
                                        )}
                                        {model.tags.length > 0 && (
                                          <div className="flex gap-1 mt-1 flex-wrap">
                                            {model.tags.slice(0, 3).map(tag => (
                                              <span
                                                key={tag}
                                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                )
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {/* 测试按钮 */}
                    {fishAudioModelId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestApiVoice}
                        disabled={ttsGenerate.isPending}
                      >
                        {ttsGenerate.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Volume2 className="w-4 h-4 mr-2" />
                        )}
                        测试 Fish Audio 语音
                      </Button>
                    )}
                  </div>
                )}

                {/* 语音配置保存生效按钮 */}
                {ttsProvider !== "browser" && (
                  <div className="pt-3 border-t">
                    <Button
                      className="w-full"
                      onClick={handleSaveVoiceConfig}
                      disabled={updatePreferences.isPending}
                      variant={hasUnsavedVoiceChanges ? "default" : "outline"}
                    >
                      {updatePreferences.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          保存中...
                        </>
                      ) : hasUnsavedVoiceChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          保存生效
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          配置已生效
                        </>
                      )}
                    </Button>
                    {hasUnsavedVoiceChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        你有未保存的语音配置更改，请点击上方按钮保存生效
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ========== 语音转写配置 ========== */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="w-5 h-5" />
                  语音转写 API 配置
                </CardTitle>
                <CardDescription>
                  语音消息通过 OpenAI Whisper
                  转写。默认使用运营方的密钥（按套餐额度），
                  也可以在下方填入自己的 Key（BYOK，走你自己的账户、不占额度）。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* OpenAI API Key（可选，BYOK） */}
                <div className="space-y-2">
                  <Label htmlFor="whisperApiKey">OpenAI API Key（可选）</Label>
                  <Input
                    id="whisperApiKey"
                    type="password"
                    placeholder="留空则使用运营方密钥；或填入你的 sk-..."
                    value={whisperApiKey}
                    onChange={e => {
                      setWhisperApiKey(e.target.value);
                      setWhisperProvider("openai");
                      setHasUnsavedWhisperChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    获取 API Key：
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                    >
                      platform.openai.com <ExternalLink className="w-3 h-3" />
                    </a>
                    ，价格：$0.006/分钟（约 ￥0.04/分钟）
                  </p>
                </div>

                {/* 保存按钮 */}
                <div className="pt-2">
                  <Button
                    onClick={handleSaveWhisperConfig}
                    disabled={updatePreferences.isPending}
                    className={`w-full ${
                      hasUnsavedWhisperChanges
                        ? "bg-primary hover:bg-primary/90"
                        : "bg-muted text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {updatePreferences.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : hasUnsavedWhisperChanges ? (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        保存生效
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        配置已生效
                      </>
                    )}
                  </Button>
                  {hasUnsavedWhisperChanges && (
                    <p className="text-xs text-amber-500 mt-2 text-center">
                      你有未保存的语音转写配置更改，请点击上方按钮保存生效
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ========== 外观主题 ========== */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {theme === "light" ? (
                    <Sun className="w-5 h-5 text-primary" />
                  ) : (
                    <Moon className="w-5 h-5 text-primary" />
                  )}
                  主题设置
                </CardTitle>
                <CardDescription>切换亮色/暗色主题</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>暗黑模式</Label>
                    <p className="text-xs text-muted-foreground">
                      {theme === "dark" ? "当前为暗黑模式" : "当前为亮色模式"}
                    </p>
                  </div>
                  <Switch
                    checked={theme === "dark"}
                    onCheckedChange={() => toggleTheme?.()}
                  />
                </div>
              </CardContent>
            </Card>

            {/* ========== fal.ai API 配置 ========== */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {apiConfig?.imageProvider.name === "comfyui"
                    ? "ComfyUI 生图 / fal.ai 可选配置"
                    : "fal.ai API 配置"}
                </CardTitle>
                <CardDescription>
                  用于生成自拍照片。获取 API Key：
                  <a
                    href="https://fal.ai/dashboard/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    fal.ai/dashboard/keys
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiConfig?.imageProvider.name === "comfyui" && (
                  <p className="text-sm text-muted-foreground">
                    当前使用服务器配置的
                    ComfyUI。聊天页点击相机，可选择参考图生图或文生图，也可上传照片生成合照。
                  </p>
                )}
                <div className="space-y-2">
                  <Label
                    htmlFor="falApiKey"
                    className="flex items-center justify-between"
                  >
                    <span>fal.ai API Key</span>
                    <KeyStatusIndicator status={falKeyStatus} />
                  </Label>
                  <Input
                    id="falApiKey"
                    type="password"
                    placeholder="输入你的 fal.ai API Key"
                    value={falApiKey}
                    onChange={e => {
                      setFalApiKey(e.target.value);
                      setHasUnsavedFalChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    可选：填写后使用你的 fal.ai
                    账户；留空沿用服务器配置的生图服务。
                  </p>
                </div>

                {/* fal.ai 配置保存生效按钮 */}
                {falApiKey.length > 0 && (
                  <div className="pt-3 border-t">
                    <Button
                      className="w-full"
                      onClick={handleSaveFalConfig}
                      disabled={updatePreferences.isPending}
                      variant={hasUnsavedFalChanges ? "default" : "outline"}
                    >
                      {updatePreferences.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          保存中...
                        </>
                      ) : hasUnsavedFalChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          保存生效
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          配置已生效
                        </>
                      )}
                    </Button>
                    {hasUnsavedFalChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        你有未保存的 fal.ai 配置更改，请点击上方按钮保存生效
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ========== LLM 配置 ========== */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  {usesDeepSeek ? "DeepSeek 模型配置" : "OpenRouter LLM 配置"}
                </CardTitle>
                <CardDescription>
                  {usesDeepSeek ? (
                    <>
                      当前使用 DeepSeek 官方服务，默认模型为{" "}
                      {apiConfig?.chatProvider.model}。
                    </>
                  ) : (
                    <>
                      通过 OpenRouter 接入数百种 AI 模型。获取 API Key：
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                      >
                        openrouter.ai/keys <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="openRouterKey"
                    className="flex items-center justify-between"
                  >
                    <span>OpenRouter API Key</span>
                    <KeyStatusIndicator status={openRouterKeyStatus} />
                  </Label>
                  <Input
                    id="openRouterKey"
                    type="password"
                    placeholder="sk-or-v1-xxxxxxxxxxxx"
                    value={openRouterKey}
                    onChange={e => {
                      setOpenRouterKey(e.target.value);
                      setHasUnsavedLlmChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {usesDeepSeek
                      ? "留空则使用已配置的 DeepSeek 服务。此处仅接受 OpenRouter Key。"
                      : "留空则使用运营方的 OpenRouter 密钥（按套餐额度，免费档锁定 gpt-4o-mini）。"}
                    填入自己的 Key
                    后走你自己的账户、不占额度，并可自由选择模型。
                  </p>
                </div>

                {openRouterKey.length > 10 && modelsLoading && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      正在加载可用模型列表...
                    </span>
                  </div>
                )}

                {modelsError && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {modelsError.message}
                  </div>
                )}

                {selectedModel && (
                  <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-primary" />
                          <span className="font-medium text-sm">当前模型</span>
                        </div>
                        <p className="text-sm mt-1 font-mono">
                          {selectedModel}
                        </p>
                        {selectedModelInfo && !usesDeepSeek && (
                          <p className="text-xs text-muted-foreground mt-1">
                            上下文：
                            {(selectedModelInfo.contextLength / 1000).toFixed(
                              0
                            )}
                            K tokens | 输入：
                            {formatPrice(selectedModelInfo.pricing.prompt)}
                            /token | 输出：
                            {formatPrice(selectedModelInfo.pricing.completion)}
                            /token
                          </p>
                        )}
                      </div>
                      {modelsData && !usesDeepSeek && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowModelList(!showModelList)}
                        >
                          更换模型
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {modelsData &&
                  !usesDeepSeek &&
                  !modelsLoading &&
                  (showModelList || !selectedModel) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>选择模型（共 {modelsData.total} 个可用）</Label>
                        {selectedModel && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowModelList(false)}
                          >
                            收起
                          </Button>
                        )}
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="搜索模型名称、ID 或提供商..."
                          value={modelSearch}
                          onChange={e => setModelSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>

                      <div className="max-h-80 overflow-y-auto rounded-lg border divide-y">
                        {/* 收藏模型置顶显示 */}
                        {(() => {
                          const favModels = filteredModels.filter(
                            (m: ModelInfo) => favoriteModels.includes(m.id)
                          );
                          const nonFavModels = filteredModels.filter(
                            (m: ModelInfo) => !favoriteModels.includes(m.id)
                          );
                          const nonFavGrouped: Record<string, ModelInfo[]> = {};
                          for (const model of nonFavModels) {
                            if (!nonFavGrouped[model.provider])
                              nonFavGrouped[model.provider] = [];
                            nonFavGrouped[model.provider].push(model);
                          }
                          const nonFavEntries = Object.entries(
                            nonFavGrouped
                          ).sort(([a], [b]) => a.localeCompare(b));

                          if (
                            favModels.length === 0 &&
                            nonFavEntries.length === 0
                          ) {
                            return (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                没有找到匹配的模型
                              </div>
                            );
                          }

                          const renderModelItem = (model: ModelInfo) => (
                            <div
                              key={model.id}
                              className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors flex items-center justify-between gap-2 ${
                                selectedModel === model.id
                                  ? "bg-primary/10 border-l-2 border-primary"
                                  : ""
                              }`}
                            >
                              <button
                                className="min-w-0 flex-1 text-left"
                                onClick={() => handleSelectModel(model.id)}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">
                                    {model.name}
                                  </span>
                                  {selectedModel === model.id && (
                                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground font-mono truncate">
                                  {model.id}
                                </p>
                              </button>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">
                                    {(model.contextLength / 1000).toFixed(0)}K
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatPrice(model.pricing.prompt)}
                                  </p>
                                </div>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    toggleFavoriteModel(model.id);
                                  }}
                                  className="p-1 rounded hover:bg-accent transition-colors"
                                  title={
                                    favoriteModels.includes(model.id)
                                      ? "取消收藏"
                                      : "收藏模型"
                                  }
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      favoriteModels.includes(model.id)
                                        ? "fill-amber-400 text-amber-400"
                                        : "text-muted-foreground"
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          );

                          return (
                            <>
                              {favModels.length > 0 && (
                                <div>
                                  <div className="px-3 py-2 bg-amber-500/10 text-xs font-semibold text-amber-600 uppercase sticky top-0 flex items-center gap-1.5">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    收藏模型 ({favModels.length})
                                  </div>
                                  {favModels.map(renderModelItem)}
                                </div>
                              )}
                              {nonFavEntries.map(([provider, models]) => (
                                <div key={provider}>
                                  <div className="px-3 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase sticky top-0">
                                    {provider} ({models.length})
                                  </div>
                                  {models.map(renderModelItem)}
                                </div>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                {/* LLM 配置保存生效按钮 */}
                {(openRouterKey.length > 0 || selectedModel) && (
                  <div className="pt-3 border-t">
                    <Button
                      className="w-full"
                      onClick={handleSaveLlmConfig}
                      disabled={updatePreferences.isPending}
                      variant={hasUnsavedLlmChanges ? "default" : "outline"}
                    >
                      {updatePreferences.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          保存中...
                        </>
                      ) : hasUnsavedLlmChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          保存生效
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          配置已生效
                        </>
                      )}
                    </Button>
                    {hasUnsavedLlmChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        你有未保存的更改，请点击上方按钮保存生效
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ========== AI 行为设定 ========== */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  AI 行为设定
                </CardTitle>
                <CardDescription>
                  设置所有女友共享的基础行为规范，如回复风格、语气偏好等
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 全局默认提示词 */}
                <div className="space-y-2">
                  <Label htmlFor="globalPrompt">全局默认提示词</Label>
                  <Textarea
                    id="globalPrompt"
                    placeholder="例如：回复要简短可爱，多用表情，不要说教..."
                    value={globalPrompt}
                    onChange={e => {
                      setGlobalPrompt(e.target.value);
                      setHasUnsavedAiChanges(true);
                    }}
                    rows={4}
                    maxLength={500}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      此提示词将应用于所有女友的对话中
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {globalPrompt.length}/500
                    </span>
                  </div>
                </div>

                {/* 快捷模板 */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    快捷模板
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    点击即可快速填充提示词，也可以在此基础上修改
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {promptTemplates.map(tpl => (
                      <button
                        key={tpl.label}
                        onClick={() => {
                          setGlobalPrompt(tpl.text);
                          setHasUnsavedAiChanges(true);
                          toast.success(`已应用模板：${tpl.label}`);
                        }}
                        className={`text-left p-2.5 rounded-lg border text-sm transition-all hover:border-primary/40 hover:bg-primary/5 ${
                          globalPrompt === tpl.text
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                      >
                        <span className="font-medium">{tpl.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 高级选项 */}
                <div className="border-t pt-4">
                  <button
                    onClick={() => setShowAdvancedPrompt(!showAdvancedPrompt)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                  >
                    {showAdvancedPrompt ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    高级选项
                  </button>

                  {showAdvancedPrompt && (
                    <div className="mt-3 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="replyLanguage">回复语言</Label>
                        <Input
                          id="replyLanguage"
                          placeholder="默认中文，可设置为英文、日文等"
                          value={replyLanguage}
                          onChange={e => {
                            setReplyLanguage(e.target.value);
                            setHasUnsavedAiChanges(true);
                          }}
                          maxLength={50}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="replyLengthLimit">回复长度限制</Label>
                        <Input
                          id="replyLengthLimit"
                          placeholder="例如：50字以内、2-3句话、不限制"
                          value={replyLengthLimit}
                          onChange={e => {
                            setReplyLengthLimit(e.target.value);
                            setHasUnsavedAiChanges(true);
                          }}
                          maxLength={50}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* AI 行为设定保存生效按钮 */}
                <div className="pt-3 border-t">
                  <Button
                    className="w-full"
                    onClick={handleSaveAiConfig}
                    disabled={updatePreferences.isPending}
                    variant={hasUnsavedAiChanges ? "default" : "outline"}
                  >
                    {updatePreferences.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : hasUnsavedAiChanges ? (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        保存生效
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        配置已生效
                      </>
                    )}
                  </Button>
                  {hasUnsavedAiChanges && (
                    <p className="text-xs text-amber-500 mt-2 text-center">
                      你有未保存的 AI 行为设定更改，请点击上方按钮保存生效
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ========== API 用量监控 ========== */}
            {hasAnyUsageData && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        API 用量监控
                      </CardTitle>
                      <CardDescription>
                        实时查看各平台 API 余额和使用情况
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshUsage}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      刷新
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* OpenRouter 用量 */}
                  {openRouterKey.length > 10 && modelsData && (
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">OpenRouter</p>
                            <p className="text-xs text-muted-foreground">
                              LLM 对话模型
                            </p>
                          </div>
                        </div>
                        {orCreditsLoading && (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {orCreditsError ? (
                        <p className="text-xs text-amber-500 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {orCreditsError.message.includes("不支持")
                            ? "当前 Key 类型不支持余额查询"
                            : "查询失败，请稍后重试"}
                        </p>
                      ) : openRouterCredits ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              总额度
                            </span>
                            <span className="font-mono font-medium">
                              ${openRouterCredits.totalCredits.toFixed(4)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              已使用
                            </span>
                            <span className="font-mono text-orange-500">
                              ${openRouterCredits.totalUsage.toFixed(4)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">剩余</span>
                            <span
                              className={`font-mono font-semibold ${openRouterCredits.remaining < 1 ? "text-red-500" : "text-green-600"}`}
                            >
                              ${openRouterCredits.remaining.toFixed(4)}
                            </span>
                          </div>
                          {/* 进度条 */}
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                openRouterCredits.totalCredits > 0
                                  ? openRouterCredits.totalUsage /
                                      openRouterCredits.totalCredits >
                                    0.9
                                    ? "bg-red-500"
                                    : openRouterCredits.totalUsage /
                                          openRouterCredits.totalCredits >
                                        0.7
                                      ? "bg-orange-500"
                                      : "bg-violet-500"
                                  : "bg-violet-500"
                              }`}
                              style={{
                                width:
                                  openRouterCredits.totalCredits > 0
                                    ? `${Math.min((openRouterCredits.totalUsage / openRouterCredits.totalCredits) * 100, 100)}%`
                                    : "0%",
                              }}
                            />
                          </div>
                          {openRouterCredits.remaining < 1 && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              余额不足，请及时充值
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* ElevenLabs 用量 */}
                  {elevenlabsApiKey.length > 10 && elevenLabsData && (
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">ElevenLabs</p>
                            <p className="text-xs text-muted-foreground">
                              AI 语音合成
                            </p>
                          </div>
                        </div>
                        {elUsageLoading && (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {elUsageError ? (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          查询失败：{elUsageError.message}
                        </p>
                      ) : elevenLabsUsage ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              订阅等级
                            </span>
                            <span className="font-medium capitalize px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
                              {elevenLabsUsage.tier}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              字符配额
                            </span>
                            <span className="font-mono">
                              <span className="text-orange-500">
                                {elevenLabsUsage.characterCount.toLocaleString()}
                              </span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="font-medium">
                                {elevenLabsUsage.characterLimit.toLocaleString()}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              剩余字符
                            </span>
                            <span
                              className={`font-mono font-semibold ${elevenLabsUsage.remaining < 1000 ? "text-red-500" : "text-green-600"}`}
                            >
                              {elevenLabsUsage.remaining.toLocaleString()}
                            </span>
                          </div>
                          {/* 进度条 */}
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                elevenLabsUsage.characterLimit > 0
                                  ? elevenLabsUsage.characterCount /
                                      elevenLabsUsage.characterLimit >
                                    0.9
                                    ? "bg-red-500"
                                    : elevenLabsUsage.characterCount /
                                          elevenLabsUsage.characterLimit >
                                        0.7
                                      ? "bg-orange-500"
                                      : "bg-blue-500"
                                  : "bg-blue-500"
                              }`}
                              style={{
                                width:
                                  elevenLabsUsage.characterLimit > 0
                                    ? `${Math.min((elevenLabsUsage.characterCount / elevenLabsUsage.characterLimit) * 100, 100)}%`
                                    : "0%",
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              状态：
                              {elevenLabsUsage.status === "active"
                                ? "✅ 活跃"
                                : elevenLabsUsage.status}
                            </span>
                            <span>
                              使用率：
                              {elevenLabsUsage.characterLimit > 0
                                ? (
                                    (elevenLabsUsage.characterCount /
                                      elevenLabsUsage.characterLimit) *
                                    100
                                  ).toFixed(1)
                                : 0}
                              %
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Fish Audio 用量 */}
                  {fishAudioApiKey.length > 10 && fishAudioData && (
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                            <Music className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">Fish Audio</p>
                            <p className="text-xs text-muted-foreground">
                              中文语音合成
                            </p>
                          </div>
                        </div>
                        {faCreditsLoading && (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {faCreditsError ? (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          查询失败：{faCreditsError.message}
                        </p>
                      ) : fishAudioCredits ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              账户余额
                            </span>
                            <span
                              className={`font-mono font-semibold ${fishAudioCredits.credit < 1 ? "text-red-500" : "text-green-600"}`}
                            >
                              ${fishAudioCredits.credit.toFixed(4)}
                            </span>
                          </div>
                          {fishAudioCredits.hasFreeCredit && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              含免费额度
                            </p>
                          )}
                          {fishAudioCredits.credit < 1 && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              余额不足，请及时充值
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* fal.ai 提示 */}
                  {falApiKey.length >= 10 && (
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">fal.ai</p>
                            <p className="text-xs text-muted-foreground">
                              AI 图片生成
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>fal.ai 暂不提供余额查询 API。</p>
                        <a
                          href="https://fal.ai/dashboard/billing"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          前往 fal.ai 后台查看用量
                        </a>
                      </div>
                    </div>
                  )}

                  {/* 无数据提示 */}
                  {!hasAnyUsageData && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      请先配置 API Key，用量数据将自动显示
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ========== 保存按钮 ========== */}
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={updatePreferences.isPending}
            >
              {updatePreferences.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存所有配置
                </>
              )}
            </Button>

            {/* ========== 使用说明 ========== */}
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">使用说明</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong>1. 语音功能：</strong>三种引擎可选 —
                  浏览器内置（免费）、ElevenLabs（高品质）、Fish
                  Audio（中文优化）
                </p>
                <p>
                  <strong>2. fal.ai API Key：</strong>
                  可选（用于生成自拍），留空则使用运营方密钥，成本约 $0.022/张
                </p>
                <p>
                  <strong>3. OpenRouter API Key：</strong>
                  可选，留空则使用运营方密钥（按套餐额度）
                </p>
                <p>
                  <strong>4. 语音引擎对比：</strong>
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1">
                  <li>浏览器内置：免费，质量一般，依赖系统</li>
                  <li>ElevenLabs：$5/月起，英文极佳，支持声音克隆</li>
                  <li>Fish Audio：按量付费，中文优化，丰富的声音库</li>
                </ul>
                <p>
                  <strong>5. 模型选择建议：</strong>
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1">
                  <li>性价比之选：openai/gpt-4o-mini</li>
                  <li>角色扮演推荐：anthropic/claude-3.5-sonnet</li>
                  <li>中文优化：deepseek/deepseek-chat</li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
