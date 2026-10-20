import { AppearanceSettings } from "@/components/AppearanceSettings";
import { BillingCard } from "@/components/BillingCard";
import { PushCard } from "@/components/PushCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BehaviorSettings } from "@/features/settings/BehaviorSettings";
import { ChatModelSettings } from "@/features/settings/ChatModelSettings";
import { ImageSettings } from "@/features/settings/ImageSettings";
import { TranscriptionSettings } from "@/features/settings/TranscriptionSettings";
import { useSettingsController } from "@/features/settings/useSettingsController";
import { VoiceSettings } from "@/features/settings/VoiceSettings";
import { ArrowLeft, Loader2, Moon, Save, Sun } from "lucide-react";
export default function Settings() {
  const state = useSettingsController();
  const {
    setLocation,
    t,
    toggleTheme,
    theme,
    isLoading,
    updatePreferences,
    isSavingKeys,
    handleSave,
  } = state;

  return (
    <div className="min-h-full bg-background">
      {/* 顶部导航栏 */}
      <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b bg-card sticky top-0 z-10">
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
            <VoiceSettings {...state} />

            {/* ========== 语音转写配置 ========== */}
            <TranscriptionSettings {...state} />

            <AppearanceSettings />

            {/* ========== fal.ai API 配置 ========== */}
            <ImageSettings {...state} />

            {/* ========== LLM 配置 ========== */}
            <ChatModelSettings {...state} />

            {/* ========== AI 行为设定 ========== */}
            <BehaviorSettings {...state} />

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
