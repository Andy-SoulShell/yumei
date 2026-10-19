import { KeyStatusIndicator } from "@/components/KeyStatusIndicator";
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
import { Check, Loader2, Save } from "lucide-react";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "apiConfig"
  | "t"
  | "falApiKey"
  | "setFalApiKey"
  | "setHasUnsavedFalChanges"
  | "handleSaveFalConfig"
  | "updatePreferences"
  | "isSavingKeys"
  | "hasUnsavedFalChanges"
>;

/** 配置图片供应商密钥并保留未保存输入。 */
export function ImageSettings({
  apiConfig,
  t,
  falApiKey,
  setFalApiKey,
  setHasUnsavedFalChanges,
  handleSaveFalConfig,
  updatePreferences,
  isSavingKeys,
  hasUnsavedFalChanges,
}: Props) {
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
  );
}
