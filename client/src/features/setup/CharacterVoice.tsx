/** 角色独立音色选择、参考录音上传和即时克隆绑定入口。 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef } from "react";
import { OmniVoiceCloneForm } from "../voice/OmniVoiceCloneForm";
import type { SetupController } from "./useSetupController";

/** 选择私人音色或直接上传克隆，已有角色立即绑定，新角色保留待创建的选择。 */
export function CharacterVoice({
  t,
  omnivoiceVoiceId,
  setOmnivoiceVoiceId,
  editId,
  name,
  setIsCloningVoice,
}: Pick<
  SetupController,
  | "t"
  | "omnivoiceVoiceId"
  | "setOmnivoiceVoiceId"
  | "editId"
  | "name"
  | "setIsCloningVoice"
>) {
  const { data, isLoading, error, refetch } = trpc.tts.omnivoiceStatus.useQuery(
    undefined,
    { retry: false }
  );
  const voices = data?.voices.filter(voice => voice.cloned) ?? [];
  const utils = trpc.useUtils();
  const bindVoice = trpc.girlfriend.update.useMutation();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label htmlFor="character-voice">{t("setup:roleVoiceTitle")}</Label>
      <select
        id="character-voice"
        className="w-full rounded-md border bg-background p-2 text-sm"
        value={omnivoiceVoiceId}
        disabled={isLoading || !!error}
        onChange={event => setOmnivoiceVoiceId(event.target.value)}
      >
        <option value="">{t("setup:roleVoiceDefault")}</option>
        {omnivoiceVoiceId && !voices.some(v => v.id === omnivoiceVoiceId) && (
          <option value={omnivoiceVoiceId}>
            {t("setup:roleVoiceUnavailable")}
          </option>
        )}
        {voices.map(voice => (
          <option key={voice.id} value={voice.id}>
            {voice.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        {t("setup:roleVoiceHint")}
      </p>
      {error && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
        >
          {t("settings:omnivoiceRefresh")}
        </Button>
      )}
      {!isLoading && !error && !voices.length && (
        <p className="text-xs text-muted-foreground">
          {t("setup:roleVoiceEmpty")}
        </p>
      )}
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("settings:omnivoiceCloneTitle")}
        </summary>
        <div className="space-y-3 pt-3">
          {!isLoading && data?.available !== true && (
            <p className="text-xs text-muted-foreground" role="status">
              {data?.configured === false
                ? t("settings:omnivoiceNotConfigured")
                : t("settings:omnivoiceOffline")}
            </p>
          )}
          <OmniVoiceCloneForm
            t={t}
            idPrefix="character"
            defaultName={name.slice(0, 80)}
            disabled={isLoading || data?.available !== true}
            onBusyChange={setIsCloningVoice}
            submitLabel={
              editId
                ? t("setup:roleVoiceCloneAndBind")
                : t("setup:roleVoiceCloneAndSelect")
            }
            successMessage={
              editId
                ? t("setup:roleVoiceCloneBound")
                : t("setup:roleVoiceCloneSelected")
            }
            onCreated={async voice => {
              if (editId)
                await bindVoice.mutateAsync({
                  id: editId,
                  omnivoiceVoiceId: voice.id,
                });
              if (!mounted.current) return;
              setOmnivoiceVoiceId(voice.id);
              utils.tts.omnivoiceStatus.setData(undefined, current =>
                current
                  ? {
                      ...current,
                      voices: [
                        ...current.voices.filter(v => v.id !== voice.id),
                        { ...voice, cloned: true },
                      ],
                    }
                  : current
              );
              // Binding succeeded even if a background catalog refresh fails.
              void utils.tts.omnivoiceStatus
                .invalidate()
                .catch(() => undefined);
              if (editId)
                void utils.girlfriend.invalidate().catch(() => undefined);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {editId
              ? t("setup:roleVoiceInlineHint")
              : t("setup:roleVoiceCreateHint")}
          </p>
        </div>
      </details>
    </div>
  );
}
