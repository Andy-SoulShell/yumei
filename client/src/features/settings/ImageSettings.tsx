import { useProductConfig } from "@/features/product/useProductConfig";
import { KeyStatusIndicator } from "@/components/KeyStatusIndicator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSaveControl } from "./SettingsSaveControl";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "apiConfig"
  | "t"
  | "falApiKey"
  | "setFalApiKey"
  | "handleSaveFalConfig"
  | "feedback"
  | "isSavingSection"
  | "refreshSavedSettings"
  | "hasUnsavedFalChanges"
>;

/** 配置图片供应商密钥并保留未保存输入。 */
export function ImageSettings({
  apiConfig,
  t,
  falApiKey,
  setFalApiKey,
  handleSaveFalConfig,
  feedback,
  isSavingSection,
  refreshSavedSettings,
  hasUnsavedFalChanges,
}: Props) {
  const sitePolicy = useProductConfig();
  return (
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
            href={sitePolicy.raw?.site.links.fal}
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
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings:optionalUseYourOwnFalAiAccountOr")}
          </p>
        </div>

        {/* fal.ai 配置保存生效按钮 */}
        <SettingsSaveControl
          state={feedback?.image}
          dirty={hasUnsavedFalChanges}
          busy={isSavingSection}
          scope={t("settingsFlow:imageScope")}
          onSave={handleSaveFalConfig}
          onRefresh={refreshSavedSettings}
        />
      </CardContent>
    </Card>
  );
}
