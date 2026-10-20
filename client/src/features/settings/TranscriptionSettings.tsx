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
import { Check, ExternalLink, Loader2, Mic, Save } from "lucide-react";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "t"
  | "whisperApiKey"
  | "setWhisperApiKey"
  | "setHasUnsavedWhisperChanges"
  | "handleSaveWhisperConfig"
  | "updatePreferences"
  | "isSavingKeys"
  | "hasUnsavedWhisperChanges"
>;

/** 配置 Whisper 转写密钥并显示该分区的保存状态。 */
export function TranscriptionSettings({
  t,
  whisperApiKey,
  setWhisperApiKey,
  setHasUnsavedWhisperChanges,
  handleSaveWhisperConfig,
  updatePreferences,
  isSavingKeys,
  hasUnsavedWhisperChanges,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5" />
          {t("settings:speechToTextSettings")}
        </CardTitle>
        <CardDescription>
          {t("settings:voiceMessagesAreTranscribedWithOpenAIWhisperUse")}
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
              {t("settings:youHaveUnsavedTranscriptionSettingsSaveChangesTo")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
