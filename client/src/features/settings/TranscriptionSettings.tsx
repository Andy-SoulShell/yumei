import { useProductConfig } from "@/features/product/useProductConfig";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Mic } from "lucide-react";
import { SettingsSaveControl } from "./SettingsSaveControl";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "t"
  | "whisperApiKey"
  | "setWhisperApiKey"
  | "handleSaveWhisperConfig"
  | "feedback"
  | "isSavingSection"
  | "refreshSavedSettings"
  | "hasUnsavedWhisperChanges"
>;

/** 配置 Whisper 转写密钥并显示该分区的保存状态。 */
export function TranscriptionSettings({
  t,
  whisperApiKey,
  setWhisperApiKey,
  handleSaveWhisperConfig,
  feedback,
  isSavingSection,
  refreshSavedSettings,
  hasUnsavedWhisperChanges,
}: Props) {
  const sitePolicy = useProductConfig();
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
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings:getAnAPIKey")}
            <a
              href={sitePolicy.raw?.site.links.openai}
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
        <SettingsSaveControl
          state={feedback?.transcription}
          dirty={hasUnsavedWhisperChanges}
          busy={isSavingSection}
          scope={t("settingsFlow:transcriptionScope")}
          onSave={handleSaveWhisperConfig}
          onRefresh={refreshSavedSettings}
        />
      </CardContent>
    </Card>
  );
}
