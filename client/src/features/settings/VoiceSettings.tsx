import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Check, Globe, Loader2, Mic, Music, Save, Volume2 } from "lucide-react";
import { ElevenLabsVoiceSettings } from "./ElevenLabsVoiceSettings";
import { FishVoiceSettings } from "./FishVoiceSettings";
import { OmniVoiceSettings } from "./OmniVoiceSettings";
import type { TTSProvider } from "./types";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "t"
  | "ttsAutoPlay"
  | "handleTtsToggle"
  | "ttsProvider"
  | "setTtsProvider"
  | "omnivoiceVoiceId"
  | "setOmnivoiceVoiceId"
  | "handleTestBrowserVoice"
  | "elevenlabsApiKey"
  | "apiConfig"
  | "setElevenlabsApiKey"
  | "elevenLabsLoading"
  | "elevenLabsError"
  | "retryElevenLabs"
  | "elevenLabsData"
  | "elevenlabsVoiceId"
  | "elevenLabsSearch"
  | "setElevenLabsSearch"
  | "groupedElevenLabsVoices"
  | "handleSelectElevenLabsVoice"
  | "elevenlabsVoiceName"
  | "handleTestApiVoice"
  | "ttsGenerate"
  | "fishAudioApiKey"
  | "setFishAudioApiKey"
  | "fishAudioLoading"
  | "fishAudioError"
  | "retryFishAudio"
  | "fishAudioData"
  | "fishAudioModelId"
  | "fishAudioSearch"
  | "setFishAudioSearch"
  | "filteredFishAudioModels"
  | "handleSelectFishAudioModel"
  | "fishAudioModelName"
  | "handleSaveVoiceConfig"
  | "updatePreferences"
  | "isSavingKeys"
  | "hasUnsavedVoiceChanges"
>;

/** 选择朗读引擎并组合供应商音色配置。 */
export function VoiceSettings(state: Props) {
  const {
    t,
    ttsAutoPlay,
    handleTtsToggle,
    ttsProvider,
    setTtsProvider,
    handleTestBrowserVoice,
    handleSaveVoiceConfig,
    updatePreferences,
    isSavingKeys,
    hasUnsavedVoiceChanges,
  } = state;

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
    {
      value: "omnivoice",
      label: "OmniVoice",
      icon: <Volume2 className="w-5 h-5" />,
      desc: t("settings:omnivoiceDescription"),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary" />
          {t("settings:voiceSettings")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 自动播放开关 */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="tts-auto-play">
              {t("settings:readRepliesAloud")}
            </Label>
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
                className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                  ttsProvider === option.value
                    ? "bg-primary/10"
                    : "bg-muted/40 hover:bg-accent/60"
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
                    <span className="font-medium text-sm">{option.label}</span>
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
          <div className="space-y-3 pt-2">
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
        {ttsProvider === "elevenlabs" && <ElevenLabsVoiceSettings {...state} />}

        {/* ===== Fish Audio 配置 ===== */}
        {ttsProvider === "fishaudio" && <FishVoiceSettings {...state} />}
        {ttsProvider === "omnivoice" && <OmniVoiceSettings {...state} />}

        {/* 语音配置保存生效按钮 */}
        {ttsProvider !== "browser" && (
          <div className="pt-3">
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
  );
}
