import { VoiceServiceAccess } from "./VoiceServiceAccess";
import { useProductConfig } from "@/features/product/useProductConfig";
import { KeyStatusIndicator } from "@/components/KeyStatusIndicator";
import { PageError } from "@/components/PageError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { ExternalLink, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { ElevenLabsVoice } from "./types";
import type { SettingsController } from "./useSettingsController";
type Props = Pick<
  SettingsController,
  | "t"
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
  | "hasUnsavedVoiceChanges"
>;
/** ElevenLabs 音色搜索、选择和试听。 */
export function ElevenLabsVoiceSettings({
  t,
  elevenlabsApiKey,
  apiConfig,
  setElevenlabsApiKey,
  elevenLabsLoading,
  elevenLabsError,
  retryElevenLabs,
  elevenLabsData,
  elevenlabsVoiceId,
  elevenLabsSearch,
  setElevenLabsSearch,
  groupedElevenLabsVoices,
  handleSelectElevenLabsVoice,
  elevenlabsVoiceName,
  handleTestApiVoice,
  ttsGenerate,
  hasUnsavedVoiceChanges,
}: Props) {
  const sitePolicy = useProductConfig();
  return (
    <div className="space-y-4 pt-2">
      <VoiceServiceAccess provider="elevenlabs" config={apiConfig}>
        <div className="space-y-2">
          <Label
            htmlFor="elevenlabsKey"
            className="flex items-center justify-between"
          >
            <span>{t("settings:elevenlabsAPIKey")}</span>
            <KeyStatusIndicator
              name="elevenlabs"
              value={elevenlabsApiKey}
              saved={apiConfig?.keys.elevenlabs?.isSet}
            />
          </Label>
          <Input
            id="elevenlabsKey"
            type="password"
            placeholder={t("settings:enterYourElevenLabsAPIKey")}
            value={elevenlabsApiKey}
            onChange={e => {
              setElevenlabsApiKey(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings:getAnAPIKey")}
            <a
              href={sitePolicy.raw?.site.links.elevenlabs}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
            >
              {t("settings:elevenlabsIo")}
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </VoiceServiceAccess>

      {/* 加载状态 */}
      {elevenLabsLoading && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">
            {t("settings:loadingVoices")}
          </span>
        </div>
      )}

      {/* 错误提示 */}
      {elevenLabsError && <PageError onRetry={() => void retryElevenLabs()} />}

      {elevenLabsData && !elevenLabsLoading && (
        <SearchSelect
          value={elevenlabsVoiceId}
          label={t("settings:changeVoice")}
          placeholder={t("settings:searchVoices")}
          emptyText={t("settings:noMatchingVoices")}
          search={elevenLabsSearch}
          onSearchChange={setElevenLabsSearch}
          options={groupedElevenLabsVoices.flatMap(([category, voices]) =>
            voices.map(voice => ({
              value: voice.id,
              label: voice.name,
              description: voice.description,
              group: category,
            }))
          )}
          onValueChange={id => {
            const voice = elevenLabsData.voices.find(
              (voice: ElevenLabsVoice) => voice.id === id
            );
            if (voice) handleSelectElevenLabsVoice(voice);
          }}
          renderActions={id => {
            const voice = elevenLabsData.voices.find(
              (voice: ElevenLabsVoice) => voice.id === id
            );
            return voice?.previewUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void new Audio(voice.previewUrl)
                    .play()
                    .catch(() => toast.error(t("common:audioPlaybackFailed")));
                }}
              >
                <Volume2 className="size-4" />
                {t("settings:preview")}
              </Button>
            ) : null;
          }}
        />
      )}
      {elevenlabsVoiceId && (
        <p className="text-xs text-muted-foreground">
          {t("settings:selectedVoice")} ·{" "}
          {elevenlabsVoiceName || elevenlabsVoiceId}
        </p>
      )}

      {/* 测试按钮 */}
      {elevenlabsVoiceId && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestApiVoice}
          disabled={ttsGenerate.isPending || hasUnsavedVoiceChanges}
        >
          {ttsGenerate.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Volume2 className="w-4 h-4 mr-2" />
          )}
          {t("settings:testElevenLabsSpeech")}
        </Button>
      )}
    </div>
  );
}
