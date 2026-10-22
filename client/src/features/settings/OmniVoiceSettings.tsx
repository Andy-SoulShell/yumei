/** 语音设置中的本地服务状态、音色目录和私人克隆音色管理。 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, RefreshCw, Volume2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { OmniVoiceCloneForm } from "../voice/OmniVoiceCloneForm";
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

/** 查看服务状态，选择并管理私人克隆音色；服务地址和密钥仅由运营方配置。 */
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
  const utils = trpc.useUtils();
  const deleteVoice = trpc.tts.deleteOmnivoiceVoice.useMutation();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const busyRef = useRef(false);
  const selected = data?.voices.find(v => v.id === omnivoiceVoiceId);

  async function removeVoice() {
    if (!selected?.cloned || busyRef.current) return;
    busyRef.current = true;
    setError("");
    try {
      await deleteVoice.mutateAsync({ id: selected.id });
      setOmnivoiceVoiceId("default");
      await Promise.all([
        refetch(),
        utils.apiConfig.get.invalidate(),
        utils.girlfriend.invalidate(),
      ]);
      toast.success(t("settings:omnivoiceCloneDeleted"));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("settings:omnivoiceCloneFailed")
      );
    } finally {
      busyRef.current = false;
    }
  }
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
              disabled={uploading || deleteVoice.isPending}
              onChange={event => setOmnivoiceVoiceId(event.target.value)}
            >
              {data.voices.map(voice => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                  {voice.cloned ? ` · ${t("settings:omnivoiceCloned")}` : ""}
                </option>
              ))}
            </select>
            {selected?.cloned && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void removeVoice()}
                disabled={
                  uploading || deleteVoice.isPending || ttsGenerate.isPending
                }
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("settings:omnivoiceDeleteClone")}
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestApiVoice}
            disabled={
              ttsGenerate.isPending ||
              hasUnsavedVoiceChanges ||
              uploading ||
              deleteVoice.isPending
            }
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
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("settings:omnivoiceCloneTitle")}
            </summary>
            <div className="pt-3">
              <OmniVoiceCloneForm
                t={t}
                disabled={deleteVoice.isPending}
                onBusyChange={setUploading}
                onCreated={async voice => {
                  setOmnivoiceVoiceId(voice.id);
                  await refetch();
                }}
                successMessage={t("settings:omnivoiceCloneCreated")}
              />
            </div>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
