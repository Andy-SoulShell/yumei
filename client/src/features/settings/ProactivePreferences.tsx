import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";
import { PageError } from "@/components/PageError";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_PROACTIVE_PREFERENCES,
  proactivePreferencesSchema,
  type ProactivePreferences as Preferences,
} from "@shared/proactiveContact";

/** 从持久记录只挑选可编辑字段，避免把 revision 等元数据作为偏好提交。 */
function editable(value: Preferences): Preferences {
  return {
    timeZone: value.timeZone,
    proactiveEnabled: value.proactiveEnabled,
    proactiveMode: value.proactiveMode,
    quietStart: value.quietStart,
    quietEnd: value.quietEnd,
    frequencyDays: value.frequencyDays,
    hidePrivatePreview: value.hidePrivatePreview,
  };
}
function clock(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 1439) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function minutes(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hours, minute] = value.split(":").map(Number);
  return hours < 24 && minute < 60 ? hours * 60 + minute : NaN;
}

/** 显式保存主动联系授权；冲突和请求失败均保留草稿，不自动覆盖其他会话的设置。 */
export function ProactivePreferences() {
  const { t } = useI18n();
  const query = trpc.notification.preferences.useQuery();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [validation, setValidation] = useState<
    "timeZone" | "frequencyDays" | "quiet" | null
  >(null);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const saved = query.data;
  const values = draft ?? editable(saved ?? DEFAULT_PROACTIVE_PREFERENCES);
  const mutation = trpc.notification.updatePreferences.useMutation({
    onSuccess: data => {
      submitting.current = false;
      if (!mounted.current) return;
      utils.notification.preferences.setData(undefined, data);
      void utils.memory.state.invalidate();
      setDraft(null);
      setBaseRevision(null);
      setValidation(null);
      setConflict(false);
      setSaveError(false);
      toast.success(t("settings:proactiveSaved"));
    },
    onError: error => {
      submitting.current = false;
      if (!mounted.current) return;
      if (error.data?.code === "CONFLICT") setConflict(true);
      else setSaveError(true);
    },
  });
  const busy = mutation.isPending || reloading;
  const change = (update: Partial<Preferences>) => {
    if (!saved || busy || submitting.current) return;
    setBaseRevision(current => current ?? saved.revision);
    setDraft(current => ({ ...editable(current ?? saved), ...update }));
    setValidation(null);
    setSaveError(false);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!saved || !draft || busy || conflict || submitting.current) return;
    const parsed = proactivePreferencesSchema.safeParse({
      ...values,
      timeZone: values.timeZone.trim(),
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setValidation(
        field === "frequencyDays"
          ? "frequencyDays"
          : field === "quietStart" || field === "quietEnd"
            ? "quiet"
            : "timeZone"
      );
      document
        .getElementById(
          field === "frequencyDays"
            ? "proactive-frequency"
            : field === "quietStart" || field === "quietEnd"
              ? field === "quietEnd"
                ? "proactive-quiet-end"
                : "proactive-quiet-start"
              : "proactive-timezone"
        )
        ?.focus();
      return;
    }
    setSaveError(false);
    submitting.current = true;
    mutation.mutate({
      expectedRevision: baseRevision ?? saved.revision,
      preferences: parsed.data,
    });
  };
  const reloadSaved = async () => {
    setReloading(true);
    try {
      const result = await query.refetch();
      if (result.error || !result.data) {
        setSaveError(true);
        return;
      }
      setDraft(null);
      setBaseRevision(null);
      setConflict(false);
      setValidation(null);
      setSaveError(false);
    } catch {
      setSaveError(true);
    } finally {
      setReloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5 text-primary" />
          {t("settings:proactiveTitle")}
        </CardTitle>
        <CardDescription>{t("settings:proactiveDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div role="status" className="flex justify-center py-6">
            <Loader2
              className="size-6 animate-spin"
              aria-label={t("auth:working")}
            />
          </div>
        ) : !saved ? (
          <PageError onRetry={() => void query.refetch()} />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="proactive-enabled">
                  {t("settings:proactiveEnabled")}
                </Label>
                <p
                  id="proactive-enabled-help"
                  className="text-xs text-muted-foreground"
                >
                  {t("settings:proactiveConsentHelp")}
                </p>
              </div>
              <Switch
                id="proactive-enabled"
                checked={values.proactiveEnabled}
                disabled={busy}
                aria-describedby="proactive-enabled-help"
                onCheckedChange={proactiveEnabled =>
                  change({ proactiveEnabled })
                }
              />
            </div>

            <fieldset
              disabled={busy || !values.proactiveEnabled}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="proactive-mode">
                  {t("settings:proactiveMode")}
                </Label>
                <Select
                  value={values.proactiveMode}
                  disabled={busy || !values.proactiveEnabled}
                  onValueChange={value => {
                    if (value === "events" || value === "daily")
                      change({ proactiveMode: value });
                  }}
                >
                  <SelectTrigger
                    id="proactive-mode"
                    aria-describedby="proactive-mode-help"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="events">
                      {t("settings:proactiveEvents")}
                    </SelectItem>
                    <SelectItem value="daily">
                      {t("settings:proactiveDaily")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p
                  id="proactive-mode-help"
                  className="text-xs text-muted-foreground"
                >
                  {t(
                    values.proactiveMode === "events"
                      ? "settings:proactiveEventsHelp"
                      : "settings:proactiveDailyHelp"
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="proactive-frequency">
                  {t("settings:proactiveFrequency")}
                </Label>
                <Input
                  id="proactive-frequency"
                  type="number"
                  min={1}
                  max={14}
                  step={1}
                  value={
                    Number.isFinite(values.frequencyDays)
                      ? values.frequencyDays
                      : ""
                  }
                  aria-invalid={validation === "frequencyDays"}
                  aria-describedby={
                    validation === "frequencyDays"
                      ? "proactive-frequency-help proactive-validation-error"
                      : "proactive-frequency-help"
                  }
                  onChange={event =>
                    change({
                      frequencyDays: event.target.value
                        ? Number(event.target.value)
                        : NaN,
                    })
                  }
                />
                <p
                  id="proactive-frequency-help"
                  className="text-xs text-muted-foreground"
                >
                  {t("settings:proactiveFrequencyHelp")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="proactive-quiet-start">
                    {t("settings:proactiveQuietStart")}
                  </Label>
                  <Input
                    id="proactive-quiet-start"
                    type="time"
                    value={clock(values.quietStart)}
                    aria-invalid={validation === "quiet"}
                    aria-describedby={
                      validation === "quiet"
                        ? "proactive-quiet-help proactive-validation-error"
                        : "proactive-quiet-help"
                    }
                    onChange={event =>
                      change({ quietStart: minutes(event.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proactive-quiet-end">
                    {t("settings:proactiveQuietEnd")}
                  </Label>
                  <Input
                    id="proactive-quiet-end"
                    type="time"
                    value={clock(values.quietEnd)}
                    aria-invalid={validation === "quiet"}
                    aria-describedby={
                      validation === "quiet"
                        ? "proactive-quiet-help proactive-validation-error"
                        : "proactive-quiet-help"
                    }
                    onChange={event =>
                      change({ quietEnd: minutes(event.target.value) })
                    }
                  />
                </div>
              </div>
              <p
                id="proactive-quiet-help"
                className="text-xs text-muted-foreground"
              >
                {t(
                  values.quietStart === values.quietEnd
                    ? "settings:proactiveQuietOff"
                    : "settings:proactiveQuietHelp"
                )}
              </p>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="proactive-timezone">
                {t("settings:proactiveTimeZone")}
              </Label>
              <Input
                id="proactive-timezone"
                list="proactive-timezones"
                maxLength={64}
                value={values.timeZone}
                disabled={busy}
                aria-invalid={validation === "timeZone"}
                aria-describedby={
                  validation === "timeZone"
                    ? "proactive-timezone-help proactive-validation-error"
                    : "proactive-timezone-help"
                }
                onChange={event => change({ timeZone: event.target.value })}
              />
              <datalist id="proactive-timezones">
                {[
                  "UTC",
                  "Asia/Shanghai",
                  "Asia/Tokyo",
                  "Asia/Seoul",
                  "Europe/London",
                  "America/New_York",
                  "America/Los_Angeles",
                ].map(zone => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <p
                id="proactive-timezone-help"
                className="text-xs text-muted-foreground"
              >
                {t("settings:proactiveTimeZoneHelp")}
              </p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="proactive-preview">
                  {t("settings:proactivePrivatePreview")}
                </Label>
                <p
                  id="proactive-preview-help"
                  className="text-xs text-muted-foreground"
                >
                  {t("settings:proactivePrivatePreviewHelp")}
                </p>
              </div>
              <Switch
                id="proactive-preview"
                checked={values.hidePrivatePreview}
                disabled={busy}
                aria-describedby="proactive-preview-help"
                onCheckedChange={hidePrivatePreview =>
                  change({ hidePrivatePreview })
                }
              />
            </div>

            {validation && (
              <p
                id="proactive-validation-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {t(
                  validation === "timeZone"
                    ? "settings:proactiveInvalidTimeZone"
                    : validation === "frequencyDays"
                      ? "settings:proactiveInvalidFrequency"
                      : "settings:proactiveInvalidQuiet"
                )}
              </p>
            )}
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                {t("settings:proactiveSaveFailed")}
              </p>
            )}
            {conflict && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm"
              >
                <p>{t("settings:proactiveConflict")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void reloadSaved()}
                >
                  {t("settings:proactiveReloadSaved")}
                </Button>
              </div>
            )}
            <Button type="submit" disabled={!draft || busy || conflict}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("settings:proactiveSave")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
