/** 常用回复偏好优先，自定义提示与模板按需展开。 */
import { useProductConfig } from "@/features/product/useProductConfig";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Brain, ChevronDown, Sparkles } from "lucide-react";
import { SettingsSaveControl } from "./SettingsSaveControl";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "t"
  | "globalPrompt"
  | "setGlobalPrompt"
  | "showAdvancedPrompt"
  | "setShowAdvancedPrompt"
  | "replyLanguage"
  | "setReplyLanguage"
  | "replyLengthLimit"
  | "setReplyLengthLimit"
  | "handleSaveAiConfig"
  | "hasUnsavedAiChanges"
  | "feedback"
  | "isSavingSection"
  | "refreshSavedSettings"
>;
export function BehaviorSettings({
  t,
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
  feedback,
  isSavingSection,
  refreshSavedSettings,
}: Props) {
  const policy = useProductConfig();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          {t("settingsFlow:chatTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="replyLanguage">{t("settings:aiReplyLanguage")}</Label>
          <Input
            id="replyLanguage"
            value={replyLanguage}
            onChange={event => setReplyLanguage(event.target.value)}
            maxLength={policy.raw?.characters.limits.replyLanguage}
            placeholder={t(
              "settings:defaultChineseYouCanChooseEnglishJapaneseOr"
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="replyLengthLimit">{t("settings:replyLength")}</Label>
          <Input
            id="replyLengthLimit"
            value={replyLengthLimit}
            onChange={event => setReplyLengthLimit(event.target.value)}
            maxLength={policy.raw?.characters.limits.replyLength}
            placeholder={t("settings:forExampleUnder50Words23Sentences")}
          />
        </div>
        <details
          open={showAdvancedPrompt}
          onToggle={event => setShowAdvancedPrompt(event.currentTarget.open)}
          className="settings-details"
        >
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium">
            {t("settingsFlow:customPrompt")}
            <ChevronDown className="size-4" />
          </summary>
          <div className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              {t("settingsFlow:promptScope")}
            </p>
            <Label htmlFor="globalPrompt">
              {t("settings:sharedSystemPrompt")}
            </Label>
            <Textarea
              id="globalPrompt"
              value={globalPrompt}
              onChange={event => setGlobalPrompt(event.target.value)}
              rows={4}
              maxLength={policy.raw?.characters.limits.globalPrompt}
              placeholder={t(
                "settings:forExampleKeepRepliesShortAndPlayfulUse"
              )}
              className="resize-y"
            />
            <p className="text-right text-xs text-muted-foreground">
              {globalPrompt.length}/{policy.raw?.characters.limits.globalPrompt}
            </p>
            <p className="flex items-center gap-1.5 text-sm">
              <Sparkles className="size-4" />
              {t("settings:quickTemplates")}
            </p>
            {!policy.data &&
              (policy.error ? (
                <PageError onRetry={() => void policy.refetch()} />
              ) : (
                <p role="status">{t("auth:working")}</p>
              ))}
            <div className="grid grid-cols-2 gap-2">
              {policy.data?.prompts.quickTemplates.map(template => (
                <Button
                  key={template.id}
                  variant="plain"
                  size="none"
                  type="button"
                  aria-pressed={globalPrompt === template.text}
                  className={`min-h-11 rounded-xl p-3 text-left text-sm ${globalPrompt === template.text ? "bg-primary/10" : "bg-muted/40"}`}
                  onClick={() => setGlobalPrompt(template.text)}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </div>
        </details>
        <SettingsSaveControl
          state={feedback?.behavior}
          dirty={hasUnsavedAiChanges}
          busy={isSavingSection}
          scope={t("settingsFlow:chatScope")}
          onSave={handleSaveAiConfig}
          onRefresh={refreshSavedSettings}
        />
      </CardContent>
    </Card>
  );
}
