/** 用户偏好、BYOK 密钥、语音、主题、推送和套餐设置页面。 */

import { AppearanceSettings } from "@/components/AppearanceSettings";
import { useI18n } from "@/lib/i18n";
import { KeyStatusIndicator } from "@/components/KeyStatusIndicator";
import { useProviderKeyDrafts } from "@/hooks/useProviderKeyDrafts";
import type { KeyName } from "@shared/providerKeys";
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
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { BillingCard } from "@/components/BillingCard";
import { PushCard } from "@/components/PushCard";

/** 模型列表展示与过滤所需的模型、供应商及价格字段。 */
type ModelInfo = {
  id: string;
  name: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
  provider: string;
};

/** ElevenLabs 音色列表的展示与选择字段。 */
type ElevenLabsVoice = {
  id: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  labels: Record<string, string>;
};

/** Fish Audio 音色模型的展示与选择字段。 */
type FishAudioModel = {
  id: string;
  name: string;
  description: string;
  tags: string[];
};

/** 语音朗读方式，区分浏览器与两个服务端供应商。 */
type TTSProvider = "browser" | "elevenlabs" | "fishaudio";

/**
 * 读取脱敏密钥状态及用户偏好，并分别保存普通配置和新输入的密钥。
 *
 * @remarks 部分设置存入浏览器本地，服务端密钥通过独立接口加密保存。
 */
export default function Settings() {
  const { t, locale } = useI18n();
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const setKeyMutation = trpc.apiConfig.setKey.useMutation();
  const {
    drafts,
    setDraft,
    saveDrafts,
    isSaving: isSavingKeys,
  } = useProviderKeyDrafts(input => setKeyMutation.mutateAsync(input));
  // API 密钥输入状态。
  const falApiKey = drafts["fal"];
  const setFalApiKey = (value: string) => setDraft("fal", value);
  const openRouterKey = drafts["openrouter"];
  const setOpenRouterKey = (value: string) => setDraft("openrouter", value);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [showModelList, setShowModelList] = useState(false);

  // 语音合成偏好。
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>("browser");

  // Whisper 语音转写配置。
  const whisperApiKey = drafts["openai"];
  const setWhisperApiKey = (value: string) => setDraft("openai", value);
  const [whisperSettingsDirty, setHasUnsavedWhisperChanges] = useState(false);
  const [ttsAutoPlay, setTtsAutoPlay] = useState(() => {
    return localStorage.getItem("tts-autoplay") === "true";
  });

  // ElevenLabs 配置状态。
  const elevenlabsApiKey = drafts["elevenlabs"];
  const setElevenlabsApiKey = (value: string) => setDraft("elevenlabs", value);
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState("");
  const [elevenlabsVoiceName, setElevenlabsVoiceName] = useState("");
  const [showElevenLabsVoices, setShowElevenLabsVoices] = useState(false);
  const [elevenLabsSearch, setElevenLabsSearch] = useState("");

  // Fish Audio 配置状态。
  const fishAudioApiKey = drafts["fish-audio"];
  const setFishAudioApiKey = (value: string) => setDraft("fish-audio", value);
  const [fishAudioModelId, setFishAudioModelId] = useState("");
  const [fishAudioModelName, setFishAudioModelName] = useState("");
  const [showFishAudioModels, setShowFishAudioModels] = useState(false);
  const [fishAudioSearch, setFishAudioSearch] = useState("");

  // LLM 配置变更追踪
  const [llmSettingsDirty, setHasUnsavedLlmChanges] = useState(false);

  // 语音配置变更追踪
  const [voiceSettingsDirty, setHasUnsavedVoiceChanges] = useState(false);

  // fal.ai 配置变更追踪
  const [falSettingsDirty, setHasUnsavedFalChanges] = useState(false);

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

  // 全局提示词状态。
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [replyLanguage, setReplyLanguage] = useState("");
  const [replyLengthLimit, setReplyLengthLimit] = useState("");
  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);

  // 快捷模板
  const promptTemplates = [
    {
      label: t("🏠 日常陪伴"),
      text: t(
        "回复要温柔体贴，多关心对方的日常生活，适当使用可爱的表情和语气词，像真实的女友一样聊天。"
      ),
    },
    {
      label: t("🎭 角色扮演"),
      text: t(
        "始终保持角色设定，不要跳出角色。回复时融入角色的性格特点和语言习惯，让对话更有沉浸感。"
      ),
    },
    {
      label: t("✨ 简短回复"),
      text: t(
        "回复要简洁，每次不超过 2-3 句话。用口语化的表达，像微信聊天一样自然。"
      ),
    },
    {
      label: t("💬 深度对话"),
      text: t(
        "可以进行深入的话题讨论，分享观点和想法，回复可以稍长一些，展现思考深度和情感共鸣。"
      ),
    },
    {
      label: t("🌟 活泼搞怪"),
      text: t(
        "回复要充满活力和幽默感，经常开玩笑、吐槽、撩人，语气俏皮可爱，让人忍不住笑。"
      ),
    },
    {
      label: t("🌿 治愈系"),
      text: t(
        "回复要温暖治愈，充满关怀和鼓励。当对方不开心时要特别温柔，像一个安全温暖的港湾。"
      ),
    },
  ];

  const hasUnsavedWhisperChanges = whisperSettingsDirty || !!whisperApiKey;

  const hasUnsavedLlmChanges = llmSettingsDirty || !!openRouterKey;

  const hasUnsavedVoiceChanges =
    voiceSettingsDirty || !!(elevenlabsApiKey || fishAudioApiKey);

  const hasUnsavedFalChanges = falSettingsDirty || !!falApiKey;

  // 加载已有偏好与密钥状态
  const { data: apiConfig, isLoading } = trpc.apiConfig.get.useQuery();

  // 服务端解析运营方或用户密钥，前端只获取可用状态。
  const usesDeepSeek = apiConfig?.chatProvider.name === "deepseek";
  const openRouterReady =
    !!apiConfig?.chatProvider.configured || !!apiConfig?.keys.openrouter.isSet;
  const {
    data: modelsData,
    isLoading: modelsLoading,
    error: modelsError,
  } = trpc.apiConfig.listModels.useQuery(undefined, {
    enabled: openRouterReady && !usesDeepSeek,
    retry: false,
  });

  // ElevenLabs 声音列表
  const elevenLabsReady = !!apiConfig?.keys.elevenlabs.isSet;
  const {
    data: elevenLabsData,
    isLoading: elevenLabsLoading,
    error: elevenLabsError,
  } = trpc.apiConfig.listElevenLabsVoices.useQuery(undefined, {
    enabled: elevenLabsReady,
    retry: false,
  });

  // Fish Audio 模型列表
  const fishAudioReady = !!apiConfig?.keys["fish-audio"].isSet;
  const {
    data: fishAudioData,
    isLoading: fishAudioLoading,
    error: fishAudioError,
  } = trpc.apiConfig.listFishAudioModels.useQuery(
    { search: fishAudioSearch || undefined },
    { enabled: fishAudioReady, retry: false }
  );

  const updatePreferences = trpc.apiConfig.updatePreferences.useMutation();

  const utils2 = trpc.useUtils();

  /** 按当前分区保存草稿，失败项保留输入并返回结构化结果。 */
  async function saveDirtyKeys(names?: readonly KeyName[]) {
    const result = await saveDrafts(names);
    if (result.saved.length) await utils2.apiConfig.get.invalidate();
    for (const { name } of result.failed)
      toast.error(t("{v0} 密钥保存失败，输入已保留，请重试", { v0: name }));
    return result;
  }

  /** 所有相关写入成功后才清除分区未保存提示并显示成功。 */
  async function saveSection(
    preferences:
      | Parameters<typeof updatePreferences.mutateAsync>[0]
      | undefined,
    names: readonly KeyName[] | undefined,
    onSaved: () => void,
    message: string
  ) {
    try {
      if (preferences) await updatePreferences.mutateAsync(preferences);
      const result = await saveDirtyKeys(names);
      if (result.failed.length) return false;
      onSaved();
      toast.success(message);
      return true;
    } catch {
      toast.error(t("配置保存失败，请重试；未保存的输入会继续保留"));
      return false;
    }
  }

  // TTS 测试
  const ttsGenerate = trpc.tts.generate.useMutation({
    onError: error => {
      toast.error(t("语音测试失败：{v0}", { v0: error.message }));
    },
  });

  useEffect(() => {
    if (apiConfig?.chatProvider.name === "deepseek") {
      setSelectedModel(apiConfig.chatProvider.model);
    } else if (apiConfig) {
      setSelectedModel(apiConfig.preferences?.llmModel || "");
    }
    if (apiConfig?.preferences) {
      // 不向前端回传已保存的明文密钥，只展示末四位；再次输入并保存即替换密钥。
      const p = apiConfig.preferences;
      setTtsProvider((p.ttsProvider as TTSProvider) || "browser");
      setElevenlabsVoiceId(p.elevenlabsVoiceId || "");
      setElevenlabsVoiceName(p.elevenlabsVoiceName || "");
      setFishAudioModelId(p.fishAudioModelId || "");
      setFishAudioModelName(p.fishAudioModelName || "");
      setGlobalPrompt(p.globalPrompt || "");
      setReplyLanguage(p.replyLanguage || "");
      setReplyLengthLimit(p.replyLengthLimit || "");
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

  /** 保存全部分区；存在失败项时保留未保存提示。 */
  const handleSave = async () =>
    saveSection(
      {
        llmModel: selectedModel || undefined,
        ttsProvider,
        elevenlabsVoiceId: elevenlabsVoiceId || undefined,
        elevenlabsVoiceName: elevenlabsVoiceName || undefined,
        fishAudioModelId: fishAudioModelId || undefined,
        fishAudioModelName: fishAudioModelName || undefined,
        globalPrompt: globalPrompt || null,
        replyLanguage: replyLanguage || null,
        replyLengthLimit: replyLengthLimit || null,
      },
      undefined,
      () => {
        setHasUnsavedLlmChanges(false);
        setHasUnsavedVoiceChanges(false);
        setHasUnsavedWhisperChanges(false);
        setHasUnsavedFalChanges(false);
        setHasUnsavedAiChanges(false);
      },
      t("全部配置已保存")
    );

  const handleTtsToggle = useCallback(
    (checked: boolean) => {
      setTtsAutoPlay(checked);
      localStorage.setItem("tts-autoplay", String(checked));
      toast.success(checked ? t("已开启自动语音") : t("已关闭自动语音"));
    },
    [t]
  );

  const handleTestBrowserVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      toast.error(t("当前浏览器不支持语音功能"));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      t("你好呀，我是你的虚拟女友，很高兴认识你~")
    );
    utterance.lang = locale;
    utterance.rate = 0.95;
    utterance.pitch = 1.2;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice =
      voices.find(
        v =>
          v.lang.startsWith(locale === "en" ? "en" : "zh") &&
          (v.name.toLowerCase().includes("female") ||
            v.name.includes("Xiaoxiao") ||
            v.name.includes("女"))
      ) || voices.find(v => v.lang.startsWith(locale === "en" ? "en" : "zh"));
    if (zhVoice) utterance.voice = zhVoice;
    window.speechSynthesis.speak(utterance);
  }, [t, locale]);

  /** 使用服务端当前已保存的语音配置生成测试音频并尝试播放。 */
  const handleTestApiVoice = useCallback(async () => {
    // 先保存当前配置
    toast.info(t("正在生成语音测试..."));
    ttsGenerate.mutate(
      { text: t("你好呀，我是你的虚拟女友，很高兴认识你~") },
      {
        onSuccess: data => {
          const audio = new Audio(data.audioUrl);
          audio.play();
          toast.success(t("语音播放中"));
        },
      }
    );
  }, [ttsGenerate, t]);

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    setShowModelList(false);
    setHasUnsavedLlmChanges(true);
    toast.info(t('已选择模型：{v0}，请点击"保存生效"确认', { v0: modelId }));
  };

  /** 保存模型分区，失败时保留分区未保存提示。 */
  const handleSaveLlmConfig = () =>
    saveSection(
      { llmModel: selectedModel || undefined },
      ["openrouter"],
      () => setHasUnsavedLlmChanges(false),
      t("LLM 配置已保存")
    );

  const handleSelectElevenLabsVoice = (voice: ElevenLabsVoice) => {
    setElevenlabsVoiceId(voice.id);
    setElevenlabsVoiceName(voice.name);
    setShowElevenLabsVoices(false);
    setHasUnsavedVoiceChanges(true);
    toast.info(t('已选择声音：{v0}，请点击"保存生效"确认', { v0: voice.name }));
  };

  const handleSelectFishAudioModel = (model: FishAudioModel) => {
    setFishAudioModelId(model.id);
    setFishAudioModelName(model.name);
    setShowFishAudioModels(false);
    setHasUnsavedVoiceChanges(true);
    toast.info(t('已选择声音：{v0}，请点击"保存生效"确认', { v0: model.name }));
  };

  /** 保存语音分区，只有相关密钥均成功才结束未保存提示。 */
  const handleSaveVoiceConfig = () =>
    saveSection(
      {
        ttsProvider,
        elevenlabsVoiceId: elevenlabsVoiceId || undefined,
        elevenlabsVoiceName: elevenlabsVoiceName || undefined,
        fishAudioModelId: fishAudioModelId || undefined,
        fishAudioModelName: fishAudioModelName || undefined,
      },
      ["elevenlabs", "fish-audio"],
      () => setHasUnsavedVoiceChanges(false),
      t("语音配置已保存")
    );
  /** 保存语音转写密钥。 */
  const handleSaveWhisperConfig = () =>
    saveSection(
      undefined,
      ["openai"],
      () => setHasUnsavedWhisperChanges(false),
      t("语音转写配置已保存")
    );
  /** 保存提示词等普通偏好，不处理其他分区的密钥草稿。 */
  const handleSaveAiConfig = () =>
    saveSection(
      {
        globalPrompt: globalPrompt || null,
        replyLanguage: replyLanguage || null,
        replyLengthLimit: replyLengthLimit || null,
      },
      [],
      () => setHasUnsavedAiChanges(false),
      t("AI 行为设定已保存")
    );

  // 模型收藏操作
  const toggleFavoriteModel = (modelId: string) => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem("favorite-models", JSON.stringify(next));
      toast.success(next.includes(modelId) ? t("已收藏模型") : t("已取消收藏"));
      return next;
    });
  };

  /** 保存图片分区的密钥，失败输入继续保留。 */
  const handleSaveFalConfig = () =>
    saveSection(
      undefined,
      ["fal"],
      () => setHasUnsavedFalChanges(false),
      t("fal.ai 配置已保存")
    );

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num === 0) return t("免费");
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
      label: t("浏览器内置语音"),
      icon: <Globe className="w-5 h-5" />,
      desc: t("免费，使用浏览器 Web Speech API"),
    },
    {
      value: "elevenlabs",
      label: "ElevenLabs",
      icon: <Mic className="w-5 h-5" />,
      desc: t("高品质 AI 语音，支持声音克隆"),
    },
    {
      value: "fishaudio",
      label: "Fish Audio",
      icon: <Music className="w-5 h-5" />,
      desc: t("中文语音优化，丰富的声音模型"),
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
        <h1 className="text-base sm:text-lg font-semibold flex-1">
          {t("设置")}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("切换显示模式")}
          onClick={toggleTheme}
        >
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
            {/* ========== 订阅与用量 ========== */}
            <BillingCard />

            {/* ========== 推送通知 ========== */}
            <PushCard />

            {/* ========== 语音设置 ========== */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-primary" />
                  {t("语音设置")}
                </CardTitle>
                <CardDescription>
                  {t("选择语音引擎，让 AI 女友用你喜欢的声音说话")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 自动播放开关 */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t("自动语音播放")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("开启后，AI 女友的每条回复都会自动朗读")}
                    </p>
                  </div>
                  <Switch
                    checked={ttsAutoPlay}
                    onCheckedChange={handleTtsToggle}
                  />
                </div>

                {/* 语音引擎选择 */}
                <div className="space-y-3">
                  <Label>{t("语音引擎")}</Label>
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
                                {t("免费")}
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
                      {t("测试浏览器语音")}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "浏览器内置语音免费使用，语音质量取决于你的操作系统和浏览器。"
                      )}
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
                        <span>{t("ElevenLabs API Key")}</span>
                        <KeyStatusIndicator
                          name="elevenlabs"
                          value={elevenlabsApiKey}
                          saved={apiConfig?.keys.elevenlabs?.isSet}
                        />
                      </Label>
                      <Input
                        id="elevenlabsKey"
                        type="password"
                        placeholder={t("输入你的 ElevenLabs API Key")}
                        value={elevenlabsApiKey}
                        onChange={e => {
                          setElevenlabsApiKey(e.target.value);
                          setHasUnsavedVoiceChanges(true);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("获取 API Key：")}
                        <a
                          href="https://elevenlabs.io/app/settings/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                        >
                          {t("elevenlabs.io")}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* 加载状态 */}
                    {elevenlabsApiKey.length > 10 && elevenLabsLoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          {t("正在加载声音列表...")}
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
                                {t("当前声音")}
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
                              {t("更换声音")}
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
                              {t("选择声音（共")}
                              {elevenLabsData.total} {t("个可用）")}
                            </Label>
                            {elevenlabsVoiceId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowElevenLabsVoices(false)}
                              >
                                {t("收起")}
                              </Button>
                            )}
                          </div>

                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder={t("搜索声音名称...")}
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
                                {t("没有找到匹配的声音")}
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
                                            title={t("试听")}
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
                        {t("测试 ElevenLabs 语音")}
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
                        <span>{t("Fish Audio API Key")}</span>
                        <KeyStatusIndicator
                          name="fish-audio"
                          value={fishAudioApiKey}
                          saved={apiConfig?.keys["fish-audio"]?.isSet}
                        />
                      </Label>
                      <Input
                        id="fishAudioKey"
                        type="password"
                        placeholder={t("输入你的 Fish Audio API Key")}
                        value={fishAudioApiKey}
                        onChange={e => {
                          setFishAudioApiKey(e.target.value);
                          setHasUnsavedVoiceChanges(true);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("获取 API Key：")}
                        <a
                          href="https://fish.audio/zh-CN/go-api/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                        >
                          {t("fish.audio")}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* 加载状态 */}
                    {fishAudioApiKey.length > 10 && fishAudioLoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          {t("正在加载声音模型列表...")}
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
                                {t("当前声音模型")}
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
                              {t("更换模型")}
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
                              {t("选择声音模型（共")}
                              {fishAudioData.total} {t("个可用）")}
                            </Label>
                            {fishAudioModelId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowFishAudioModels(false)}
                              >
                                {t("收起")}
                              </Button>
                            )}
                          </div>

                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder={t("搜索声音模型名称...")}
                              value={fishAudioSearch}
                              onChange={e => setFishAudioSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>

                          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                            {filteredFishAudioModels.length === 0 ? (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                {t("没有找到匹配的声音模型")}
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
                        {t("测试 Fish Audio 语音")}
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
                      disabled={updatePreferences.isPending || isSavingKeys}
                      variant={hasUnsavedVoiceChanges ? "default" : "outline"}
                    >
                      {updatePreferences.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t("保存中...")}
                        </>
                      ) : hasUnsavedVoiceChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t("保存生效")}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          {t("配置已生效")}
                        </>
                      )}
                    </Button>
                    {hasUnsavedVoiceChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        {t("你有未保存的语音配置更改，请点击上方按钮保存生效")}
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
                  {t("语音转写 API 配置")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "语音消息通过 OpenAI Whisper 转写。默认使用运营方的密钥（按套餐额度）， 也可以在下方填入自己的 Key（BYOK，走你自己的账户、不占额度）。"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* OpenAI API Key（可选，BYOK） */}
                <div className="space-y-2">
                  <Label htmlFor="whisperApiKey">
                    {t("OpenAI API Key（可选）")}
                  </Label>
                  <Input
                    id="whisperApiKey"
                    type="password"
                    placeholder={t("留空则使用运营方密钥；或填入你的 sk-...")}
                    value={whisperApiKey}
                    onChange={e => {
                      setWhisperApiKey(e.target.value);
                      setHasUnsavedWhisperChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("获取 API Key：")}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                    >
                      {t("platform.openai.com")}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {t("，价格：$0.006/分钟（约 ￥0.04/分钟）")}
                  </p>
                </div>

                {/* 保存按钮 */}
                <div className="pt-2">
                  <Button
                    onClick={handleSaveWhisperConfig}
                    disabled={updatePreferences.isPending || isSavingKeys}
                    className={`w-full ${
                      hasUnsavedWhisperChanges
                        ? "bg-primary hover:bg-primary/90"
                        : "bg-muted text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {updatePreferences.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t("保存中...")}
                      </>
                    ) : hasUnsavedWhisperChanges ? (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {t("保存生效")}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        {t("配置已生效")}
                      </>
                    )}
                  </Button>
                  {hasUnsavedWhisperChanges && (
                    <p className="text-xs text-amber-500 mt-2 text-center">
                      {t(
                        "你有未保存的语音转写配置更改，请点击上方按钮保存生效"
                      )}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <AppearanceSettings />

            {/* ========== fal.ai API 配置 ========== */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {apiConfig?.imageProvider.name === "comfyui"
                    ? t("ComfyUI 生图 / fal.ai 可选配置")
                    : t("fal.ai API 配置")}
                </CardTitle>
                <CardDescription>
                  {t("用于生成自拍照片。获取 API Key：")}
                  <a
                    href="https://fal.ai/dashboard/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    {t("fal.ai/dashboard/keys")}
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiConfig?.imageProvider.name === "comfyui" && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "当前使用服务器配置的 ComfyUI。聊天页点击相机，可选择参考图生图或文生图，也可上传照片生成合照。"
                    )}
                  </p>
                )}
                <div className="space-y-2">
                  <Label
                    htmlFor="falApiKey"
                    className="flex items-center justify-between"
                  >
                    <span>{t("fal.ai API Key")}</span>
                    <KeyStatusIndicator
                      name="fal"
                      value={falApiKey}
                      saved={apiConfig?.keys.fal?.isSet}
                    />
                  </Label>
                  <Input
                    id="falApiKey"
                    type="password"
                    placeholder={t("输入你的 fal.ai API Key")}
                    value={falApiKey}
                    onChange={e => {
                      setFalApiKey(e.target.value);
                      setHasUnsavedFalChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "可选：填写后使用你的 fal.ai 账户；留空沿用服务器配置的生图服务。"
                    )}
                  </p>
                </div>

                {/* fal.ai 配置保存生效按钮 */}
                {falApiKey.length > 0 && (
                  <div className="pt-3 border-t">
                    <Button
                      className="w-full"
                      onClick={handleSaveFalConfig}
                      disabled={updatePreferences.isPending || isSavingKeys}
                      variant={hasUnsavedFalChanges ? "default" : "outline"}
                    >
                      {updatePreferences.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t("保存中...")}
                        </>
                      ) : hasUnsavedFalChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t("保存生效")}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          {t("配置已生效")}
                        </>
                      )}
                    </Button>
                    {hasUnsavedFalChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        {t(
                          "你有未保存的 fal.ai 配置更改，请点击上方按钮保存生效"
                        )}
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
                  {usesDeepSeek
                    ? t("DeepSeek 模型配置")
                    : t("OpenRouter LLM 配置")}
                </CardTitle>
                <CardDescription>
                  {usesDeepSeek ? (
                    <>
                      {t("当前使用 DeepSeek 官方服务，默认模型为")}{" "}
                      {apiConfig?.chatProvider.model}。
                    </>
                  ) : (
                    <>
                      {t("通过 OpenRouter 接入数百种 AI 模型。获取 API Key：")}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                      >
                        {t("openrouter.ai/keys")}
                        <ExternalLink className="w-3 h-3" />
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
                    <span>{t("OpenRouter API Key")}</span>
                    <KeyStatusIndicator
                      name="openrouter"
                      value={openRouterKey}
                      saved={apiConfig?.keys.openrouter?.isSet}
                    />
                  </Label>
                  <Input
                    id="openRouterKey"
                    type="password"
                    placeholder={t("sk-or-v1-xxxxxxxxxxxx")}
                    value={openRouterKey}
                    onChange={e => {
                      setOpenRouterKey(e.target.value);
                      setHasUnsavedLlmChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {usesDeepSeek
                      ? t(
                          "留空则使用已配置的 DeepSeek 服务。此处仅接受 OpenRouter Key。"
                        )
                      : t(
                          "留空则使用运营方的 OpenRouter 密钥（按套餐额度，免费档锁定 gpt-4o-mini）。"
                        )}
                    {t(
                      "填入自己的 Key 后走你自己的账户、不占额度，并可自由选择模型。"
                    )}
                  </p>
                </div>

                {openRouterKey.length > 10 && modelsLoading && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      {t("正在加载可用模型列表...")}
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
                          <span className="font-medium text-sm">
                            {t("当前模型")}
                          </span>
                        </div>
                        <p className="text-sm mt-1 font-mono">
                          {selectedModel}
                        </p>
                        {selectedModelInfo && !usesDeepSeek && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("上下文：")}
                            {(selectedModelInfo.contextLength / 1000).toFixed(
                              0
                            )}
                            {t("K tokens | 输入：")}
                            {formatPrice(selectedModelInfo.pricing.prompt)}
                            {t("/token | 输出：")}
                            {formatPrice(selectedModelInfo.pricing.completion)}
                            {t("/token")}
                          </p>
                        )}
                      </div>
                      {modelsData && !usesDeepSeek && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowModelList(!showModelList)}
                        >
                          {t("更换模型")}
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
                        <Label>
                          {t("选择模型（共")}
                          {modelsData.total} {t("个可用）")}
                        </Label>
                        {selectedModel && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowModelList(false)}
                          >
                            {t("收起")}
                          </Button>
                        )}
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder={t("搜索模型名称、ID 或提供商...")}
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
                                {t("没有找到匹配的模型")}
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
                                    {(model.contextLength / 1000).toFixed(0)}
                                    {t("K")}
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
                                      ? t("取消收藏")
                                      : t("收藏模型")
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
                                    {t("收藏模型 (")}
                                    {favModels.length})
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
                      disabled={updatePreferences.isPending || isSavingKeys}
                      variant={hasUnsavedLlmChanges ? "default" : "outline"}
                    >
                      {updatePreferences.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t("保存中...")}
                        </>
                      ) : hasUnsavedLlmChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t("保存生效")}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          {t("配置已生效")}
                        </>
                      )}
                    </Button>
                    {hasUnsavedLlmChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        {t("你有未保存的更改，请点击上方按钮保存生效")}
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
                  {t("AI 行为设定")}
                </CardTitle>
                <CardDescription>
                  {t("设置所有女友共享的基础行为规范，如回复风格、语气偏好等")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 全局默认提示词 */}
                <div className="space-y-2">
                  <Label htmlFor="globalPrompt">{t("全局默认提示词")}</Label>
                  <Textarea
                    id="globalPrompt"
                    placeholder={t(
                      "例如：回复要简短可爱，多用表情，不要说教..."
                    )}
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
                      {t("此提示词将应用于所有女友的对话中")}
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
                    {t("快捷模板")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("点击即可快速填充提示词，也可以在此基础上修改")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {promptTemplates.map(tpl => (
                      <button
                        key={tpl.label}
                        onClick={() => {
                          setGlobalPrompt(tpl.text);
                          setHasUnsavedAiChanges(true);
                          toast.success(
                            t("已应用模板：{v0}", { v0: tpl.label })
                          );
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
                    {t("高级选项")}
                  </button>

                  {showAdvancedPrompt && (
                    <div className="mt-3 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="replyLanguage">{t("回复语言")}</Label>
                        <Input
                          id="replyLanguage"
                          placeholder={t("默认中文，可设置为英文、日文等")}
                          value={replyLanguage}
                          onChange={e => {
                            setReplyLanguage(e.target.value);
                            setHasUnsavedAiChanges(true);
                          }}
                          maxLength={50}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="replyLengthLimit">
                          {t("回复长度限制")}
                        </Label>
                        <Input
                          id="replyLengthLimit"
                          placeholder={t("例如：50字以内、2-3句话、不限制")}
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
                    disabled={updatePreferences.isPending || isSavingKeys}
                    variant={hasUnsavedAiChanges ? "default" : "outline"}
                  >
                    {updatePreferences.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t("保存中...")}
                      </>
                    ) : hasUnsavedAiChanges ? (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {t("保存生效")}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        {t("配置已生效")}
                      </>
                    )}
                  </Button>
                  {hasUnsavedAiChanges && (
                    <p className="text-xs text-amber-500 mt-2 text-center">
                      {t(
                        "你有未保存的 AI 行为设定更改，请点击上方按钮保存生效"
                      )}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ========== 保存按钮 ========== */}
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={updatePreferences.isPending || isSavingKeys}
            >
              {updatePreferences.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("保存中...")}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {t("保存所有配置")}
                </>
              )}
            </Button>

            {/* ========== 使用说明 ========== */}
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{t("使用说明")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong>{t("1. 语音功能：")}</strong>
                  {t(
                    "三种引擎可选 — 浏览器内置（免费）、ElevenLabs（高品质）、Fish Audio（中文优化）"
                  )}
                </p>
                <p>
                  <strong>{t("2. fal.ai API Key：")}</strong>
                  {t(
                    "可选（用于生成自拍），留空则使用运营方密钥，成本约 $0.022/张"
                  )}
                </p>
                <p>
                  <strong>{t("3. OpenRouter API Key：")}</strong>
                  {t("可选，留空则使用运营方密钥（按套餐额度）")}
                </p>
                <p>
                  <strong>{t("4. 语音引擎对比：")}</strong>
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1">
                  <li>{t("浏览器内置：免费，质量一般，依赖系统")}</li>
                  <li>{t("ElevenLabs：$5/月起，英文极佳，支持声音克隆")}</li>
                  <li>{t("Fish Audio：按量付费，中文优化，丰富的声音库")}</li>
                </ul>
                <p>
                  <strong>{t("5. 模型选择建议：")}</strong>
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1">
                  <li>{t("性价比之选：openai/gpt-4o-mini")}</li>
                  <li>{t("角色扮演推荐：anthropic/claude-3.5-sonnet")}</li>
                  <li>{t("中文优化：deepseek/deepseek-chat")}</li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
