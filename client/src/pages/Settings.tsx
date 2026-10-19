import { useSettingsDraft } from "@/hooks/useSettingsDraft";
import { apiErrorMessage } from "@/lib/errors";
import { LANGUAGES } from "@shared/locales";
import { selectSpeechVoice } from "@/lib/speech";
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
import { SearchSelect } from "@/components/ui/search-select";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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
import { useState, useCallback, useMemo } from "react";
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

  const { data: apiConfig, isLoading } = trpc.apiConfig.get.useQuery();
  const remotePreferences = useMemo(
    () =>
      apiConfig
        ? {
            llmModel:
              apiConfig.chatProvider.name === "deepseek"
                ? apiConfig.chatProvider.model
                : apiConfig.preferences?.llmModel || "",
            ttsProvider: (apiConfig.preferences?.ttsProvider ||
              "browser") as TTSProvider,
            elevenlabsVoiceId: apiConfig.preferences?.elevenlabsVoiceId || "",
            elevenlabsVoiceName:
              apiConfig.preferences?.elevenlabsVoiceName || "",
            fishAudioModelId: apiConfig.preferences?.fishAudioModelId || "",
            fishAudioModelName: apiConfig.preferences?.fishAudioModelName || "",
            globalPrompt: apiConfig.preferences?.globalPrompt || "",
            replyLanguage: apiConfig.preferences?.replyLanguage || "",
            replyLengthLimit: apiConfig.preferences?.replyLengthLimit || "",
          }
        : undefined,
    [apiConfig]
  );
  const settingsDraft = useSettingsDraft(
    {
      llmModel: "",
      ttsProvider: "browser" as TTSProvider,
      elevenlabsVoiceId: "",
      elevenlabsVoiceName: "",
      fishAudioModelId: "",
      fishAudioModelName: "",
      globalPrompt: "",
      replyLanguage: "",
      replyLengthLimit: "",
    },
    remotePreferences
  );

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
  const [selectedModel, setSelectedModel] = settingsDraft.field("llmModel");
  const [modelSearch, setModelSearch] = useState("");

  // 语音合成偏好。
  const [ttsProvider, setTtsProvider] = settingsDraft.field("ttsProvider");

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
  const [elevenlabsVoiceId, setElevenlabsVoiceId] =
    settingsDraft.field("elevenlabsVoiceId");
  const [elevenlabsVoiceName, setElevenlabsVoiceName] = settingsDraft.field(
    "elevenlabsVoiceName"
  );
  const [elevenLabsSearch, setElevenLabsSearch] = useState("");

  // Fish Audio 配置状态。
  const fishAudioApiKey = drafts["fish-audio"];
  const setFishAudioApiKey = (value: string) => setDraft("fish-audio", value);
  const [fishAudioModelId, setFishAudioModelId] =
    settingsDraft.field("fishAudioModelId");
  const [fishAudioModelName, setFishAudioModelName] =
    settingsDraft.field("fishAudioModelName");
  const [fishAudioSearch, setFishAudioSearch] = useState("");

  // LLM 配置变更追踪
  const llmSettingsDirty = settingsDraft.isDirty(["llmModel"]);

  // 语音配置变更追踪
  const voiceSettingsDirty = settingsDraft.isDirty([
    "ttsProvider",
    "elevenlabsVoiceId",
    "elevenlabsVoiceName",
    "fishAudioModelId",
    "fishAudioModelName",
  ]);

  // fal.ai 配置变更追踪
  const [falSettingsDirty, setHasUnsavedFalChanges] = useState(false);

  // AI 行为设定变更追踪
  const hasUnsavedAiChanges = settingsDraft.isDirty([
    "globalPrompt",
    "replyLanguage",
    "replyLengthLimit",
  ]);

  // 模型收藏列表（localStorage 存储）
  const [favoriteModels, setFavoriteModels] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("favorite-models") || "[]");
    } catch {
      return [];
    }
  });

  // 全局提示词状态。
  const [globalPrompt, setGlobalPrompt] = settingsDraft.field("globalPrompt");
  const [replyLanguage, setReplyLanguage] =
    settingsDraft.field("replyLanguage");
  const [replyLengthLimit, setReplyLengthLimit] =
    settingsDraft.field("replyLengthLimit");
  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);

  // 快捷模板
  const promptTemplates = [
    {
      label: t("settings:everydayCompanionship"),
      text: t("settings:replyWarmlyAndThoughtfullyShowInterestInEveryday"),
    },
    {
      label: t("settings:roleplay"),
      text: t("settings:stayInCharacterReflectTheCharacterSPersonality"),
    },
    {
      label: t("settings:shortReplies"),
      text: t("settings:keepRepliesConciseWithin23SentencesUse"),
    },
    {
      label: t("settings:deeperConversations"),
      text: t("settings:exploreTopicsInDepthAndShareThoughtfulPerspectives"),
    },
    {
      label: t("settings:playfulAndLively"),
      text: t("settings:beEnergeticAndHumorousUsePlayfulJokesAnd"),
    },
    {
      label: t("settings:warmAndComforting"),
      text: t("settings:replyWithWarmthCareAndEncouragementBeEspecially"),
    },
  ];

  const hasUnsavedWhisperChanges = whisperSettingsDirty || !!whisperApiKey;

  const hasUnsavedLlmChanges = llmSettingsDirty || !!openRouterKey;

  const hasUnsavedVoiceChanges =
    voiceSettingsDirty || !!(elevenlabsApiKey || fishAudioApiKey);

  const hasUnsavedFalChanges = falSettingsDirty || !!falApiKey;

  // 加载已有偏好与密钥状态

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
    {
      enabled: fishAudioReady,
      retry: false,
      placeholderData: previous => previous,
    }
  );

  const updatePreferences = trpc.apiConfig.updatePreferences.useMutation();

  const utils2 = trpc.useUtils();

  /** 按当前分区保存草稿，失败项保留输入并返回结构化结果。 */
  async function saveDirtyKeys(names?: readonly KeyName[]) {
    const result = await saveDrafts(names);
    if (result.saved.length) await utils2.apiConfig.get.invalidate();
    for (const { name } of result.failed)
      toast.error(
        t("settings:couldNotSaveTheKeyYourInputIs", { provider: name })
      );
    return result;
  }

  /** 所有相关写入成功后才清除分区未保存提示并显示成功。 */
  async function saveSection(
    preferences:
      Parameters<typeof updatePreferences.mutateAsync>[0] | undefined,
    names: readonly KeyName[] | undefined,
    onSaved: () => void,
    message: string
  ) {
    try {
      if (preferences) {
        const submitted = { ...settingsDraft.value };
        await updatePreferences.mutateAsync(preferences);
        settingsDraft.acknowledge(
          Object.keys(preferences) as (keyof typeof submitted)[],
          submitted
        );
      }
      const result = await saveDirtyKeys(names);
      if (result.failed.length) return false;
      onSaved();
      toast.success(message);
      return true;
    } catch {
      toast.error(t("settings:couldNotSaveSettingsYourUnsavedInputIs"));
      return false;
    }
  }

  // TTS 测试
  const ttsGenerate = trpc.tts.generate.useMutation({
    onError: error => {
      toast.error(
        t("settings:voiceTestFailed", { error: apiErrorMessage(error, t) })
      );
    },
  });

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
        setHasUnsavedWhisperChanges(false);
        setHasUnsavedFalChanges(false);
      },
      t("settings:allSettingsSaved")
    );

  const handleTtsToggle = useCallback(
    (checked: boolean) => {
      setTtsAutoPlay(checked);
      localStorage.setItem("tts-autoplay", String(checked));
      toast.success(
        checked ? t("settings:autoReadEnabled") : t("settings:autoReadDisabled")
      );
    },
    [t]
  );

  const handleTestBrowserVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      toast.error(t("common:thisBrowserDoesNotSupportSpeech"));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      t("settings:hiIMYourAICompanionItS")
    );
    utterance.lang = LANGUAGES[locale].speech;
    utterance.rate = 0.95;
    utterance.pitch = 1.2;
    const voices = window.speechSynthesis.getVoices();
    const voice = selectSpeechVoice(voices, utterance.lang);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }, [t, locale]);

  /** 使用服务端当前已保存的语音配置生成测试音频并尝试播放。 */
  const handleTestApiVoice = useCallback(async () => {
    // 先保存当前配置
    toast.info(t("settings:generatingVoicePreview"));
    ttsGenerate.mutate(
      { text: t("settings:hiIMYourAICompanionItS") },
      {
        onSuccess: data => {
          const audio = new Audio(data.audioUrl);
          audio.play();
          toast.success(t("settings:playingAudio"));
        },
      }
    );
  }, [ttsGenerate, t]);

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    toast.info(
      t("settings:selectedClickSaveChangesToApply", { name: modelId })
    );
  };

  /** 保存模型分区，失败时保留分区未保存提示。 */
  const handleSaveLlmConfig = () =>
    saveSection(
      { llmModel: selectedModel || undefined },
      ["openrouter"],
      () => {},
      t("settings:modelSettingsSaved")
    );

  const handleSelectElevenLabsVoice = (voice: ElevenLabsVoice) => {
    setElevenlabsVoiceId(voice.id);
    setElevenlabsVoiceName(voice.name);
    toast.info(
      t("settings:selectedVoiceClickSaveChangesToApply", { name: voice.name })
    );
  };

  const handleSelectFishAudioModel = (model: FishAudioModel) => {
    setFishAudioModelId(model.id);
    setFishAudioModelName(model.name);
    toast.info(
      t("settings:selectedVoiceClickSaveChangesToApply", { name: model.name })
    );
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
      () => {},
      t("settings:voiceSettingsSaved")
    );
  /** 保存语音转写密钥。 */
  const handleSaveWhisperConfig = () =>
    saveSection(
      undefined,
      ["openai"],
      () => setHasUnsavedWhisperChanges(false),
      t("settings:transcriptionSettingsSaved")
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
      () => {},
      t("settings:aiBehaviorSettingsSaved")
    );

  // 模型收藏操作
  const toggleFavoriteModel = (modelId: string) => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem("favorite-models", JSON.stringify(next));
      toast.success(
        next.includes(modelId)
          ? t("settings:modelAddedToFavorites")
          : t("settings:modelRemovedFromFavorites")
      );
      return next;
    });
  };

  /** 保存图片分区的密钥，失败输入继续保留。 */
  const handleSaveFalConfig = () =>
    saveSection(
      undefined,
      ["fal"],
      () => setHasUnsavedFalChanges(false),
      t("settings:falAiSettingsSaved")
    );

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num === 0) return t("settings:free");
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
      label: t("settings:browserSpeech"),
      icon: <Globe className="w-5 h-5" />,
      desc: t("settings:freeUsingTheBrowserSWebSpeechAPI"),
    },
    {
      value: "elevenlabs",
      label: "ElevenLabs",
      icon: <Mic className="w-5 h-5" />,
      desc: t("settings:highQualityAISpeechWithVoiceCloning"),
    },
    {
      value: "fishaudio",
      label: "Fish Audio",
      icon: <Music className="w-5 h-5" />,
      desc: t("settings:optimizedForChineseWithAWideVoiceSelection"),
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
          {t("common:settings")}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common:toggleDisplayMode")}
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
                  {t("settings:voiceSettings")}
                </CardTitle>
                <CardDescription>
                  {t("settings:chooseHowYourCompanionSounds")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 自动播放开关 */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="tts-auto-play">
                      {t("settings:readRepliesAloud")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:automaticallyReadEveryReplyAloud")}
                    </p>
                  </div>
                  <Switch
                    id="tts-auto-play"
                    checked={ttsAutoPlay}
                    onCheckedChange={handleTtsToggle}
                  />
                </div>

                {/* 语音引擎选择 */}
                <div className="space-y-3">
                  <Label>{t("settings:speechProvider")}</Label>
                  <RadioGroup
                    aria-label={t("settings:speechProvider")}
                    value={ttsProvider}
                    onValueChange={value => {
                      setTtsProvider(value as TTSProvider);
                    }}
                    className="grid gap-3"
                  >
                    {ttsProviderOptions.map(option => (
                      <RadioGroupChoice
                        key={option.value}
                        value={option.value}
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
                                {t("settings:free")}
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
                      </RadioGroupChoice>
                    ))}
                  </RadioGroup>
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
                      {t("settings:testBrowserSpeech")}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:browserSpeechIsFreeVoiceQualityDependsOn")}
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
                        <span>{t("settings:elevenlabsAPIKey")}</span>
                        <KeyStatusIndicator
                          name="elevenlabs"
                          value={elevenlabsApiKey}
                          saved={apiConfig?.keys.elevenlabs?.isSet}
                        />
                      </Label>
                      <Input
                        id="elevenlabsKey"
                        type="password"
                        placeholder={t("settings:enterYourElevenLabsAPIKey")}
                        value={elevenlabsApiKey}
                        onChange={e => {
                          setElevenlabsApiKey(e.target.value);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("settings:getAnAPIKey")}
                        <a
                          href="https://elevenlabs.io/app/settings/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                        >
                          {t("settings:elevenlabsIo")}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* 加载状态 */}
                    {elevenlabsApiKey.length > 10 && elevenLabsLoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          {t("settings:loadingVoices")}
                        </span>
                      </div>
                    )}

                    {/* 错误提示 */}
                    {elevenLabsError && (
                      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                        {elevenLabsError.message}
                      </div>
                    )}

                    {elevenLabsData && !elevenLabsLoading && (
                      <SearchSelect
                        value={elevenlabsVoiceId}
                        label={t("settings:changeVoice")}
                        placeholder={t("settings:searchVoices")}
                        emptyText={t("settings:noMatchingVoices")}
                        search={elevenLabsSearch}
                        onSearchChange={setElevenLabsSearch}
                        options={groupedElevenLabsVoices.flatMap(
                          ([category, voices]) =>
                            voices.map(voice => ({
                              value: voice.id,
                              label: voice.name,
                              description: voice.description,
                              group: category,
                            }))
                        )}
                        onValueChange={id => {
                          const voice = elevenLabsData.voices.find(
                            (voice: ElevenLabsVoice) => voice.id === id
                          );
                          if (voice) handleSelectElevenLabsVoice(voice);
                        }}
                        renderActions={id => {
                          const voice = elevenLabsData.voices.find(
                            (voice: ElevenLabsVoice) => voice.id === id
                          );
                          return voice?.previewUrl ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void new Audio(voice.previewUrl)
                                  .play()
                                  .catch(() =>
                                    toast.error(t("common:audioPlaybackFailed"))
                                  );
                              }}
                            >
                              <Volume2 className="size-4" />
                              {t("settings:preview")}
                            </Button>
                          ) : null;
                        }}
                      />
                    )}
                    {elevenlabsVoiceId && (
                      <p className="text-xs text-muted-foreground">
                        {t("settings:selectedVoice")} ·{" "}
                        {elevenlabsVoiceName || elevenlabsVoiceId}
                      </p>
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
                        {t("settings:testElevenLabsSpeech")}
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
                        <span>{t("settings:fishAudioAPIKey")}</span>
                        <KeyStatusIndicator
                          name="fish-audio"
                          value={fishAudioApiKey}
                          saved={apiConfig?.keys["fish-audio"]?.isSet}
                        />
                      </Label>
                      <Input
                        id="fishAudioKey"
                        type="password"
                        placeholder={t("settings:enterYourFishAudioAPIKey")}
                        value={fishAudioApiKey}
                        onChange={e => {
                          setFishAudioApiKey(e.target.value);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("settings:getAnAPIKey")}
                        <a
                          href="https://fish.audio/zh-CN/go-api/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                        >
                          {t("settings:fishAudio")}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    {/* 加载状态 */}
                    {fishAudioApiKey.length > 10 && fishAudioLoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          {t("settings:loadingVoiceModels")}
                        </span>
                      </div>
                    )}

                    {/* 错误提示 */}
                    {fishAudioError && (
                      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                        {fishAudioError.message}
                      </div>
                    )}

                    {fishAudioData && (
                      <SearchSelect
                        value={fishAudioModelId}
                        label={t("settings:changeModel")}
                        placeholder={t("settings:searchVoiceModels")}
                        emptyText={
                          fishAudioLoading
                            ? t("settings:loadingVoiceModels")
                            : t("settings:noMatchingVoiceModels")
                        }
                        search={fishAudioSearch}
                        onSearchChange={setFishAudioSearch}
                        options={filteredFishAudioModels.map(
                          (model: FishAudioModel) => ({
                            value: model.id,
                            label: model.name,
                            description: model.description,
                            detail: model.tags.slice(0, 3).join(" · "),
                          })
                        )}
                        onValueChange={id => {
                          const model = fishAudioData.models.find(
                            (model: FishAudioModel) => model.id === id
                          );
                          if (model) handleSelectFishAudioModel(model);
                        }}
                      />
                    )}
                    {fishAudioModelId && (
                      <p className="text-xs text-muted-foreground">
                        {t("settings:selectedVoiceModel")} ·{" "}
                        {fishAudioModelName || fishAudioModelId}
                      </p>
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
                        {t("settings:testFishAudioSpeech")}
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
                          {t("common:saving")}
                        </>
                      ) : hasUnsavedVoiceChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t("settings:saveChanges")}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          {t("settings:settingsSaved")}
                        </>
                      )}
                    </Button>
                    {hasUnsavedVoiceChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        {t("settings:youHaveUnsavedVoiceSettingsSaveChangesTo")}
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
                  {t("settings:speechToTextSettings")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "settings:voiceMessagesAreTranscribedWithOpenAIWhisperUse"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* OpenAI API Key（可选，BYOK） */}
                <div className="space-y-2">
                  <Label htmlFor="whisperApiKey">
                    {t("settings:openaiAPIKeyOptional")}
                  </Label>
                  <Input
                    id="whisperApiKey"
                    type="password"
                    placeholder={t("settings:leaveBlankToUseTheOperatorSKey")}
                    value={whisperApiKey}
                    onChange={e => {
                      setWhisperApiKey(e.target.value);
                      setHasUnsavedWhisperChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings:getAnAPIKey")}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                    >
                      {t("settings:platformOpenaiCom")}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {t("settings:listedPrice0006Minute")}
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
                        {t("common:saving")}
                      </>
                    ) : hasUnsavedWhisperChanges ? (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {t("settings:saveChanges")}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        {t("settings:settingsSaved")}
                      </>
                    )}
                  </Button>
                  {hasUnsavedWhisperChanges && (
                    <p className="text-xs text-amber-500 mt-2 text-center">
                      {t(
                        "settings:youHaveUnsavedTranscriptionSettingsSaveChangesTo"
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
                    ? t("settings:comfyuiOptionalFalAiSettings")
                    : t("settings:falAiSettings")}
                </CardTitle>
                <CardDescription>
                  {t("settings:usedToGenerateSelfiesGetAnAPIKey")}
                  <a
                    href="https://fal.ai/dashboard/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    {t("settings:falAiDashboardKeys")}
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiConfig?.imageProvider.name === "comfyui" && (
                  <p className="text-sm text-muted-foreground">
                    {t("settings:comfyuiIsConfiguredByTheServerUseThe")}
                  </p>
                )}
                <div className="space-y-2">
                  <Label
                    htmlFor="falApiKey"
                    className="flex items-center justify-between"
                  >
                    <span>{t("settings:falAiAPIKey")}</span>
                    <KeyStatusIndicator
                      name="fal"
                      value={falApiKey}
                      saved={apiConfig?.keys.fal?.isSet}
                    />
                  </Label>
                  <Input
                    id="falApiKey"
                    type="password"
                    placeholder={t("settings:enterYourFalAiAPIKey")}
                    value={falApiKey}
                    onChange={e => {
                      setFalApiKey(e.target.value);
                      setHasUnsavedFalChanges(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings:optionalUseYourOwnFalAiAccountOr")}
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
                          {t("common:saving")}
                        </>
                      ) : hasUnsavedFalChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t("settings:saveChanges")}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          {t("settings:settingsSaved")}
                        </>
                      )}
                    </Button>
                    {hasUnsavedFalChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        {t("settings:youHaveUnsavedFalAiSettingsSaveChanges")}
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
                    ? t("settings:deepseekModelSettings")
                    : t("settings:openrouterModelSettings")}
                </CardTitle>
                <CardDescription>
                  {usesDeepSeek ? (
                    <>
                      {t("settings:usingTheOfficialDeepSeekAPIDefaultModel")}{" "}
                      {apiConfig?.chatProvider.model}。
                    </>
                  ) : (
                    <>
                      {t(
                        "settings:accessHundredsOfAIModelsThroughOpenRouterGet"
                      )}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
                      >
                        {t("settings:openrouterAiKeys")}
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
                    <span>{t("settings:openrouterAPIKey")}</span>
                    <KeyStatusIndicator
                      name="openrouter"
                      value={openRouterKey}
                      saved={apiConfig?.keys.openrouter?.isSet}
                    />
                  </Label>
                  <Input
                    id="openRouterKey"
                    type="password"
                    placeholder={t("settings:skOrV1Xxxxxxxxxxxx")}
                    value={openRouterKey}
                    onChange={e => {
                      setOpenRouterKey(e.target.value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {usesDeepSeek
                      ? t(
                          "settings:leaveBlankToUseTheConfiguredDeepSeekService"
                        )
                      : t("settings:leaveBlankToUseTheOperatorSOpenRouter")}
                    {t("settings:yourOwnKeyUsesYourOwnAccountBypasses")}
                  </p>
                </div>

                {openRouterKey.length > 10 && modelsLoading && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      {t("settings:loadingAvailableModels")}
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
                            {t("settings:selectedModel")}
                          </span>
                        </div>
                        <p className="text-sm mt-1 font-mono">
                          {selectedModel}
                        </p>
                        {selectedModelInfo && !usesDeepSeek && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("settings:context")}
                            {(selectedModelInfo.contextLength / 1000).toFixed(
                              0
                            )}
                            {t("settings:kTokensInput")}
                            {formatPrice(selectedModelInfo.pricing.prompt)}
                            {t("settings:tokenOutput")}
                            {formatPrice(selectedModelInfo.pricing.completion)}
                            {t("settings:token")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {modelsData && !usesDeepSeek && !modelsLoading && (
                  <SearchSelect
                    value={selectedModel}
                    label={t("settings:changeModel")}
                    placeholder={t("settings:searchModelNameIDOrProvider")}
                    emptyText={t("settings:noMatchingModels")}
                    search={modelSearch}
                    onSearchChange={setModelSearch}
                    options={[
                      ...filteredModels.filter((model: ModelInfo) =>
                        favoriteModels.includes(model.id)
                      ),
                      ...filteredModels.filter(
                        (model: ModelInfo) => !favoriteModels.includes(model.id)
                      ),
                    ].map((model: ModelInfo) => ({
                      value: model.id,
                      label: model.name,
                      description: model.id,
                      group: favoriteModels.includes(model.id)
                        ? t("settings:favorites")
                        : model.provider,
                      detail: (
                        <>
                          <span className="block">
                            {(model.contextLength / 1000).toFixed(0)}K
                          </span>
                          {formatPrice(model.pricing.prompt)}
                        </>
                      ),
                    }))}
                    onValueChange={handleSelectModel}
                    renderActions={id => (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={favoriteModels.includes(id)}
                        onClick={() => toggleFavoriteModel(id)}
                      >
                        <Star
                          className={
                            favoriteModels.includes(id)
                              ? "size-4 fill-amber-400 text-amber-400"
                              : "size-4"
                          }
                        />
                        {favoriteModels.includes(id)
                          ? t("settings:removeFromFavorites")
                          : t("settings:addToFavorites")}
                      </Button>
                    )}
                  />
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
                          {t("common:saving")}
                        </>
                      ) : hasUnsavedLlmChanges ? (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t("settings:saveChanges")}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          {t("settings:settingsSaved")}
                        </>
                      )}
                    </Button>
                    {hasUnsavedLlmChanges && (
                      <p className="text-xs text-amber-500 mt-2 text-center">
                        {t("settings:youHaveUnsavedChangesSaveChangesToApply")}
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
                  {t("settings:aiBehavior")}
                </CardTitle>
                <CardDescription>
                  {t("settings:setSharedPreferencesForYourCompanionsSuchAs")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 全局默认提示词 */}
                <div className="space-y-2">
                  <Label htmlFor="globalPrompt">
                    {t("settings:sharedSystemPrompt")}
                  </Label>
                  <Textarea
                    id="globalPrompt"
                    placeholder={t(
                      "settings:forExampleKeepRepliesShortAndPlayfulUse"
                    )}
                    value={globalPrompt}
                    onChange={e => {
                      setGlobalPrompt(e.target.value);
                    }}
                    rows={4}
                    maxLength={500}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "settings:thisPromptAppliesToConversationsWithAllYour"
                      )}
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
                    {t("settings:quickTemplates")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:chooseATemplateThenAdjustItAsYou")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {promptTemplates.map(tpl => (
                      <Button
                        variant="plain"
                        size="none"
                        type="button"
                        key={tpl.label}
                        onClick={() => {
                          setGlobalPrompt(tpl.text);
                          toast.success(
                            t("settings:templateApplied", { name: tpl.label })
                          );
                        }}
                        className={`text-left p-2.5 rounded-lg border text-sm transition-all hover:border-primary/40 hover:bg-primary/5 ${
                          globalPrompt === tpl.text
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                      >
                        <span className="font-medium">{tpl.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 高级选项 */}
                <Collapsible
                  open={showAdvancedPrompt}
                  onOpenChange={setShowAdvancedPrompt}
                  className="border-t pt-4"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="plain"
                      size="none"
                      type="button"
                      className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      {showAdvancedPrompt ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      {t("settings:advancedOptions")}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="replyLanguage">
                        {t("settings:aiReplyLanguage")}
                      </Label>
                      <Input
                        id="replyLanguage"
                        placeholder={t(
                          "settings:defaultChineseYouCanChooseEnglishJapaneseOr"
                        )}
                        value={replyLanguage}
                        onChange={e => {
                          setReplyLanguage(e.target.value);
                        }}
                        maxLength={50}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="replyLengthLimit">
                        {t("settings:replyLength")}
                      </Label>
                      <Input
                        id="replyLengthLimit"
                        placeholder={t(
                          "settings:forExampleUnder50Words23Sentences"
                        )}
                        value={replyLengthLimit}
                        onChange={e => {
                          setReplyLengthLimit(e.target.value);
                        }}
                        maxLength={50}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

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
                        {t("common:saving")}
                      </>
                    ) : hasUnsavedAiChanges ? (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {t("settings:saveChanges")}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        {t("settings:settingsSaved")}
                      </>
                    )}
                  </Button>
                  {hasUnsavedAiChanges && (
                    <p className="text-xs text-amber-500 mt-2 text-center">
                      {t(
                        "settings:youHaveUnsavedAIBehaviorSettingsSaveChanges"
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
                  {t("common:saving")}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {t("settings:saveAllSettings")}
                </>
              )}
            </Button>

            {/* ========== 使用说明 ========== */}
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("settings:howToUse")}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong>{t("settings:guide1Speech")}</strong>
                  {t("settings:chooseBrowserSpeechFreeElevenLabsHighQualityOr")}
                </p>
                <p>
                  <strong>{t("settings:guide2FalAiAPIKey")}</strong>
                  {t("settings:optionalForSelfiesLeaveBlankToUseThe")}
                </p>
                <p>
                  <strong>{t("settings:guide3OpenRouterAPIKey")}</strong>
                  {t("settings:optionalLeaveBlankToUseTheOperatorS")}
                </p>
                <p>
                  <strong>{t("settings:guide4SpeechProviders")}</strong>
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1">
                  <li>
                    {t("settings:browserFreeWithQualityDependingOnYourSystem")}
                  </li>
                  <li>
                    {t("settings:elevenlabsListedFrom5MonthWithEnglishVoices")}
                  </li>
                  <li>
                    {t(
                      "settings:fishAudioUsageBasedBillingOptimizedForChinese"
                    )}
                  </li>
                </ul>
                <p>
                  <strong>{t("settings:guide5ModelSuggestions")}</strong>
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1">
                  <li>{t("settings:valueOpenaiGpt4oMini")}</li>
                  <li>{t("settings:roleplayAnthropicClaude35Sonnet")}</li>
                  <li>{t("settings:chineseDeepseekDeepseekChat")}</li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
