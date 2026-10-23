import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { readDeviceValue, writeDeviceValue } from "@/lib/deviceStorage";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ApiConfig, ElevenLabsVoice, ModelInfo } from "./types";

/** 按已配置的服务查询模型与音色，并管理搜索和本机收藏。 */
export function useProviderCatalogs(
  apiConfig: ApiConfig,
  selectedModel: string
) {
  const { t } = useI18n();

  const [modelSearch, setModelSearch] = useState("");

  const [elevenLabsSearch, setElevenLabsSearch] = useState("");

  const [fishAudioSearch, setFishAudioSearch] = useState("");

  // 模型收藏列表（localStorage 存储）
  const [favoriteModels, setFavoriteModels] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        readDeviceValue("favorite-models") || "[]"
      );
      return Array.isArray(saved)
        ? saved.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });

  // 加载已有偏好与密钥状态

  // 服务端解析运营方或用户密钥，前端只获取可用状态。
  const usesDeepSeek = apiConfig?.chatProvider.name === "deepseek";

  const openRouterReady =
    !!apiConfig?.chatProvider.configured || !!apiConfig?.keys.openrouter.isSet;

  const {
    data: modelsData,
    isLoading: modelsLoading,
    error: modelsError,
    refetch: retryModels,
  } = trpc.apiConfig.listModels.useQuery(undefined, {
    enabled: openRouterReady && !usesDeepSeek,
    retry: false,
  });

  // ElevenLabs 声音列表
  const elevenLabsReady =
    apiConfig?.voiceProviders?.elevenlabs.available === true;

  const {
    data: elevenLabsData,
    isLoading: elevenLabsLoading,
    error: elevenLabsError,
    refetch: retryElevenLabs,
  } = trpc.apiConfig.listElevenLabsVoices.useQuery(undefined, {
    enabled: elevenLabsReady,
    retry: false,
  });

  // Fish Audio 模型列表
  const fishAudioReady =
    apiConfig?.voiceProviders?.fishaudio.available === true;

  const {
    data: fishAudioData,
    isLoading: fishAudioLoading,
    error: fishAudioError,
    refetch: retryFishAudio,
  } = trpc.apiConfig.listFishAudioModels.useQuery(
    { search: fishAudioSearch || undefined },
    {
      enabled: fishAudioReady,
      retry: false,
      placeholderData: previous => previous,
    }
  );

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

  // 模型收藏操作
  const toggleFavoriteModel = (modelId: string) => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      writeDeviceValue("favorite-models", JSON.stringify(next));
      toast.success(
        next.includes(modelId)
          ? t("settings:modelAddedToFavorites")
          : t("settings:modelRemovedFromFavorites")
      );
      return next;
    });
  };
  return {
    modelSearch,
    setModelSearch,
    elevenLabsSearch,
    setElevenLabsSearch,
    fishAudioSearch,
    setFishAudioSearch,
    favoriteModels,
    setFavoriteModels,
    usesDeepSeek,
    modelsData,
    modelsLoading,
    modelsError,
    retryModels,
    elevenLabsData,
    elevenLabsLoading,
    elevenLabsError,
    retryElevenLabs,
    fishAudioData,
    fishAudioLoading,
    fishAudioError,
    retryFishAudio,
    filteredModels,
    groupedElevenLabsVoices,
    filteredFishAudioModels,
    selectedModelInfo,
    toggleFavoriteModel,
  };
}
