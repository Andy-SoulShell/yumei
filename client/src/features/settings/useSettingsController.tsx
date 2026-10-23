import { useAuth } from "@/_core/hooks/useAuth";
import { formDraftKey } from "@/lib/formDrafts";
import { useProductConfig } from "@/features/product/useProductConfig";
import { useTheme } from "@/contexts/ThemeContext";
import { useProviderKeyDrafts } from "@/hooks/useProviderKeyDrafts";
import { useSettingsDraft } from "@/hooks/useSettingsDraft";
import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { selectSpeechVoice } from "@/lib/speech";
import { trpc } from "@/lib/trpc";
import { readDeviceValue, writeDeviceValue } from "@/lib/deviceStorage";
import { LANGUAGES } from "@shared/locales";
import type { KeyName } from "@shared/providerKeys";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import type { ElevenLabsVoice, FishAudioModel, TTSProvider } from "./types";
import { useProviderCatalogs } from "./useProviderCatalogs";
/** 页面查询、草稿与操作流程；展示组件只消费此状态。 */
export function useSettingsController() {
  const product = useProductConfig();
  const { user } = useAuth();
  const { t, locale } = useI18n();

  const [, setLocation] = useLocation();

  const { theme, toggleTheme } = useTheme();

  const {
    data: apiConfig,
    isLoading,
    error: configError,
    refetch: retryConfig,
  } = trpc.apiConfig.get.useQuery();

  const remotePreferences = useMemo(
    () =>
      apiConfig
        ? {
            llmModel:
              apiConfig.chatProvider.name === "deepseek"
                ? apiConfig.chatProvider.model
                : apiConfig.preferences?.llmModel || "",
            ttsProvider: (apiConfig.preferences?.ttsProvider ||
              product.raw?.experience.playback.defaultProvider ||
              "browser") as TTSProvider,
            elevenlabsVoiceId: apiConfig.preferences?.elevenlabsVoiceId || "",
            elevenlabsVoiceName:
              apiConfig.preferences?.elevenlabsVoiceName || "",
            fishAudioModelId: apiConfig.preferences?.fishAudioModelId || "",
            fishAudioModelName: apiConfig.preferences?.fishAudioModelName || "",
            omnivoiceVoiceId: apiConfig.preferences?.omnivoiceVoiceId || "",
            globalPrompt: apiConfig.preferences?.globalPrompt || "",
            replyLanguage: apiConfig.preferences?.replyLanguage || "",
            replyLengthLimit: apiConfig.preferences?.replyLengthLimit || "",
          }
        : undefined,
    [apiConfig, product.raw]
  );

  const settingsDraft = useSettingsDraft(
    {
      llmModel: "",
      ttsProvider: "browser" as TTSProvider,
      elevenlabsVoiceId: "",
      elevenlabsVoiceName: "",
      fishAudioModelId: "",
      fishAudioModelName: "",
      omnivoiceVoiceId: "",
      globalPrompt: "",
      replyLanguage: "",
      replyLengthLimit: "",
    },
    remotePreferences,
    formDraftKey(user?.id, "reply-and-service-settings")
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

  const catalogs = useProviderCatalogs(apiConfig, selectedModel);
  // 语音合成偏好。
  const [ttsProvider, setTtsProvider] = settingsDraft.field("ttsProvider");
  const [omnivoiceVoiceId, setOmnivoiceVoiceId] =
    settingsDraft.field("omnivoiceVoiceId");

  // Whisper 语音转写配置。
  const whisperApiKey = drafts["openai"];

  const setWhisperApiKey = (value: string) => setDraft("openai", value);

  const [whisperSettingsDirty, setHasUnsavedWhisperChanges] = useState(false);

  const [ttsAutoPlay, setTtsAutoPlay] = useState(() => {
    return readDeviceValue("tts-autoplay") === "true";
  });

  // ElevenLabs 配置状态。
  const elevenlabsApiKey = drafts["elevenlabs"];

  const setElevenlabsApiKey = (value: string) => setDraft("elevenlabs", value);

  const [elevenlabsVoiceId, setElevenlabsVoiceId] =
    settingsDraft.field("elevenlabsVoiceId");

  const [elevenlabsVoiceName, setElevenlabsVoiceName] = settingsDraft.field(
    "elevenlabsVoiceName"
  );

  // Fish Audio 配置状态。
  const fishAudioApiKey = drafts["fish-audio"];

  const setFishAudioApiKey = (value: string) => setDraft("fish-audio", value);

  const [fishAudioModelId, setFishAudioModelId] =
    settingsDraft.field("fishAudioModelId");

  const [fishAudioModelName, setFishAudioModelName] =
    settingsDraft.field("fishAudioModelName");

  // LLM 配置变更追踪
  const llmSettingsDirty = settingsDraft.isDirty(["llmModel"]);

  // 语音配置变更追踪
  const voiceSettingsDirty = settingsDraft.isDirty([
    "ttsProvider",
    "elevenlabsVoiceId",
    "elevenlabsVoiceName",
    "fishAudioModelId",
    "fishAudioModelName",
    "omnivoiceVoiceId",
  ]);

  // fal.ai 配置变更追踪
  const [falSettingsDirty, setHasUnsavedFalChanges] = useState(false);

  // AI 行为设定变更追踪
  const hasUnsavedAiChanges = settingsDraft.isDirty([
    "globalPrompt",
    "replyLanguage",
    "replyLengthLimit",
  ]);

  // 全局提示词状态。
  const [globalPrompt, setGlobalPrompt] = settingsDraft.field("globalPrompt");

  const [replyLanguage, setReplyLanguage] =
    settingsDraft.field("replyLanguage");

  const [replyLengthLimit, setReplyLengthLimit] =
    settingsDraft.field("replyLengthLimit");

  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);

  const hasUnsavedWhisperChanges = whisperSettingsDirty || !!whisperApiKey;

  const hasUnsavedLlmChanges = llmSettingsDirty || !!openRouterKey;

  const hasUnsavedVoiceChanges =
    voiceSettingsDirty || !!(elevenlabsApiKey || fishAudioApiKey);

  const hasUnsavedFalChanges = falSettingsDirty || !!falApiKey;

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
        await utils2.apiConfig.get.invalidate();
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

  /** 保存全部分区；存在失败项时保留未保存提示。 */
  const handleSave = async () =>
    saveSection(
      {
        llmModel: selectedModel || undefined,
        ttsProvider,
        omnivoiceVoiceId: omnivoiceVoiceId || null,
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
      writeDeviceValue("tts-autoplay", String(checked));
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
        omnivoiceVoiceId: omnivoiceVoiceId || null,
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

  /** 保存图片分区的密钥，失败输入继续保留。 */
  const handleSaveFalConfig = () =>
    saveSection(
      undefined,
      ["fal"],
      () => setHasUnsavedFalChanges(false),
      t("settings:falAiSettingsSaved")
    );
  return {
    characterLimits: product.raw?.characters.limits,
    ...catalogs,
    setLocation,
    t,
    toggleTheme,
    theme,
    isLoading,
    configError,
    retryConfig,
    ttsAutoPlay,
    handleTtsToggle,
    ttsProvider,
    setTtsProvider,
    omnivoiceVoiceId,
    setOmnivoiceVoiceId,
    handleTestBrowserVoice,
    elevenlabsApiKey,
    apiConfig,
    setElevenlabsApiKey,
    elevenlabsVoiceId,
    handleSelectElevenLabsVoice,
    elevenlabsVoiceName,
    handleTestApiVoice,
    ttsGenerate,
    fishAudioApiKey,
    setFishAudioApiKey,
    fishAudioModelId,
    handleSelectFishAudioModel,
    fishAudioModelName,
    handleSaveVoiceConfig,
    updatePreferences,
    isSavingKeys,
    hasUnsavedVoiceChanges,
    whisperApiKey,
    setWhisperApiKey,
    setHasUnsavedWhisperChanges,
    handleSaveWhisperConfig,
    hasUnsavedWhisperChanges,
    falApiKey,
    setFalApiKey,
    setHasUnsavedFalChanges,
    handleSaveFalConfig,
    hasUnsavedFalChanges,
    openRouterKey,
    setOpenRouterKey,
    selectedModel,
    handleSelectModel,
    handleSaveLlmConfig,
    hasUnsavedLlmChanges,
    globalPrompt,
    setGlobalPrompt,
    showAdvancedPrompt,
    setShowAdvancedPrompt,
    replyLanguage,
    setReplyLanguage,
    replyLengthLimit,
    setReplyLengthLimit,
    handleSaveAiConfig,
    hasUnsavedAiChanges,
    handleSave,
  };
}
export type SettingsController = ReturnType<typeof useSettingsController>;
