import { KeyStatusIndicator } from "@/components/KeyStatusIndicator";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { ExternalLink, Loader2, Volume2 } from "lucide-react";
import type { FishAudioModel } from "./types";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "t"
  | "fishAudioApiKey"
  | "apiConfig"
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
  | "handleTestApiVoice"
  | "ttsGenerate"
>;
/** Fish Audio 模型搜索、选择和试听。 */
export function FishVoiceSettings({
  t,
  fishAudioApiKey,
  apiConfig,
  setFishAudioApiKey,
  fishAudioLoading,
  fishAudioError,
  retryFishAudio,
  fishAudioData,
  fishAudioModelId,
  fishAudioSearch,
  setFishAudioSearch,
  filteredFishAudioModels,
  handleSelectFishAudioModel,
  fishAudioModelName,
  handleTestApiVoice,
  ttsGenerate,
}: Props) {
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label
          htmlFor="fishAudioKey"
          className="flex items-center justify-between"
        >
          <span>{t("settings:fishAudioAPIKey")}</span>
          <KeyStatusIndicator
            name="fish-audio"
            value={fishAudioApiKey}
            saved={apiConfig?.keys["fish-audio"]?.isSet}
          />
        </Label>
        <Input
          id="fishAudioKey"
          type="password"
          placeholder={t("settings:enterYourFishAudioAPIKey")}
          value={fishAudioApiKey}
          onChange={e => {
            setFishAudioApiKey(e.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          {t("settings:getAnAPIKey")}
          <a
            href="https://fish.audio/zh-CN/go-api/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
          >
            {t("settings:fishAudio")}
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>

      {/* 加载状态 */}
      {fishAudioApiKey.length > 10 && fishAudioLoading && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">
            {t("settings:loadingVoiceModels")}
          </span>
        </div>
      )}

      {/* 错误提示 */}
      {fishAudioError && <PageError onRetry={() => void retryFishAudio()} />}

      {fishAudioData && (
        <SearchSelect
          value={fishAudioModelId}
          label={t("settings:changeModel")}
          placeholder={t("settings:searchVoiceModels")}
          emptyText={
            fishAudioLoading
              ? t("settings:loadingVoiceModels")
              : t("settings:noMatchingVoiceModels")
          }
          search={fishAudioSearch}
          onSearchChange={setFishAudioSearch}
          options={filteredFishAudioModels.map((model: FishAudioModel) => ({
            value: model.id,
            label: model.name,
            description: model.description,
            detail: model.tags.slice(0, 3).join(" · "),
          }))}
          onValueChange={id => {
            const model = fishAudioData.models.find(
              (model: FishAudioModel) => model.id === id
            );
            if (model) handleSelectFishAudioModel(model);
          }}
        />
      )}
      {fishAudioModelId && (
        <p className="text-xs text-muted-foreground">
          {t("settings:selectedVoiceModel")} ·{" "}
          {fishAudioModelName || fishAudioModelId}
        </p>
      )}

      {/* 测试按钮 */}
      {fishAudioModelId && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestApiVoice}
          disabled={ttsGenerate.isPending}
        >
          {ttsGenerate.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Volume2 className="w-4 h-4 mr-2" />
          )}
          {t("settings:testFishAudioSpeech")}
        </Button>
      )}
    </div>
  );
}
