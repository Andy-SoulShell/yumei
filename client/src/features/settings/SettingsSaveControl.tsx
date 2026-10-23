/** 分区独立的保存按钮与可被辅助技术读取的结果；从不把初始状态称为已保存。 */
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
export type SettingsSaveState = {
  status: "idle" | "saving" | "saved" | "error" | "partial";
  refreshFailed?: boolean;
};
export type SettingsSaveSection =
  "behavior" | "voice" | "model" | "image" | "transcription";
export type SettingsSaveFeedback = Partial<
  Record<SettingsSaveSection, SettingsSaveState>
>;

export function SettingsSaveControl({
  state,
  dirty,
  busy,
  scope,
  onSave,
  onRefresh,
}: {
  state?: SettingsSaveState;
  dirty: boolean;
  busy: boolean;
  scope: string;
  onSave: () => unknown;
  onRefresh?: () => unknown;
}) {
  const { t } = useI18n();
  const saving = state?.status === "saving";
  const failure = state?.status === "error" || state?.status === "partial";
  const label = saving
    ? t("common:saving")
    : failure
      ? t("settingsFlow:retrySection")
      : t("settingsFlow:saveSection");
  return (
    <div className="settings-save-control space-y-2" aria-busy={saving}>
      <p className="text-xs leading-relaxed text-muted-foreground">{scope}</p>
      <Button
        type="button"
        className="min-h-11 w-full whitespace-normal"
        onClick={() => void onSave()}
        disabled={busy || !dirty}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        {label}
      </Button>
      <p
        role={failure ? "alert" : "status"}
        className={`text-xs leading-relaxed ${failure ? "text-destructive" : "text-muted-foreground"}`}
      >
        {saving ? (
          t("settingsFlow:savingSection")
        ) : failure ? (
          t(
            state?.status === "partial"
              ? "settingsFlow:partiallySaved"
              : "settingsFlow:saveFailed"
          )
        ) : state?.status === "saved" ? (
          dirty ? (
            t("settingsFlow:savedWithNewEdits")
          ) : (
            <span className="inline-flex items-center gap-1.5 text-primary">
              <CheckCircle2 className="size-3.5" />
              {t("settingsFlow:savedSection")}
            </span>
          )
        ) : dirty ? (
          t("settingsFlow:unsaved")
        ) : (
          t("settingsFlow:noChanges")
        )}
      </p>
      {state?.refreshFailed && (
        <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>{t("settingsFlow:refreshFailed")}</p>
          {onRefresh && (
            <Button
              type="button"
              className="min-h-11"
              variant="outline"
              onClick={() => void onRefresh()}
            >
              {t("settingsFlow:refreshSaved")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
