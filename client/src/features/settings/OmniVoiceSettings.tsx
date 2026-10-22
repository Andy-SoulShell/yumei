import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, RefreshCw, Volume2 } from "lucide-react";
import type { SettingsController } from "./useSettingsController";

type Props = Pick<
  SettingsController,
  | "t"
  | "omnivoiceVoiceId"
  | "setOmnivoiceVoiceId"
  | "handleTestApiVoice"
  | "ttsGenerate"
  | "hasUnsavedVoiceChanges"
>;

/** 本地服务公开音色目录；地址和服务密钥仅由运营方配置。 */
export function OmniVoiceSettings({
  t,
  omnivoiceVoiceId,
  setOmnivoiceVoiceId,
  handleTestApiVoice,
  ttsGenerate,
  hasUnsavedVoiceChanges,
}: Props) {
  const { data, isLoading, refetch } = trpc.tts.omnivoiceStatus.useQuery(
    undefined,
    { retry: false }
  );
  const available = data?.available === true;
  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm" role="status">
        {isLoading
          ? t("settings:omnivoiceChecking")
          : available
            ? t("settings:omnivoiceAvailable")
            : data?.configured === false
              ? t("settings:omnivoiceNotConfigured")
              : t("settings:omnivoiceOffline")}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={() => void refetch()}
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        {t("settings:omnivoiceRefresh")}
      </Button>
      {available && (
        <>
          <div className="space-y-2">
            <Label htmlFor="omnivoice-voice">
              {t("settings:omnivoiceVoice")}
            </Label>
            <select
              id="omnivoice-voice"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={omnivoiceVoiceId || "default"}
              onChange={event => setOmnivoiceVoiceId(event.target.value)}
            >
              {data.voices.map(voice => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
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
            {t("settings:omnivoicePreview")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("settings:omnivoicePreviewHint")}
          </p>
        </>
      )}
    </div>
  );
}
