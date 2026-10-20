import { usePageBack } from "@/hooks/usePageBack";
import { PageError } from "@/components/PageError";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { BillingCard } from "@/components/BillingCard";
import { PushCard } from "@/components/PushCard";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BehaviorSettings } from "@/features/settings/BehaviorSettings";
import { ChatModelSettings } from "@/features/settings/ChatModelSettings";
import { ImageSettings } from "@/features/settings/ImageSettings";
import { TranscriptionSettings } from "@/features/settings/TranscriptionSettings";
import { useSettingsController } from "@/features/settings/useSettingsController";
import { VoiceSettings } from "@/features/settings/VoiceSettings";
import { PasswordSettings } from "@/features/settings/PasswordSettings";
import { ArrowLeft, ChevronDown, Loader2, Moon, Save, Sun } from "lucide-react";
export default function Settings() {
  const goBack = usePageBack("/characters");
  const state = useSettingsController();
  const {
    t,
    toggleTheme,
    theme,
    isLoading,
    configError,
    retryConfig,
    apiConfig,
    updatePreferences,
    isSavingKeys,
    handleSave,
  } = state;

  return (
    <div className="min-h-full bg-background">
      {/* 顶部导航栏 */}
      <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b bg-card sticky top-0 z-10">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("setup:back")}
          onClick={goBack}
        >
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
        ) : configError && !apiConfig ? (
          <PageError onRetry={() => void retryConfig()} />
        ) : (
          <>
            <PasswordSettings />
            {/* ========== 订阅与用量 ========== */}
            <BillingCard />

            {/* ========== 推送通知 ========== */}
            <PushCard />

            {/* ========== 语音设置 ========== */}
            <VoiceSettings {...state} />

            <AppearanceSettings />

            {/* ========== AI 行为设定 ========== */}
            <BehaviorSettings {...state} />

            <Collapsible className="rounded-xl border bg-card group">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-5 h-auto"
                >
                  {t("settings:advancedServices")}
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3 space-y-4">
                <TranscriptionSettings {...state} />
                <ImageSettings {...state} />
                <ChatModelSettings {...state} />
              </CollapsibleContent>
            </Collapsible>

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
          </>
        )}
      </div>
    </div>
  );
}
