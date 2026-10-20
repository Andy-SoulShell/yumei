/** 当前设备的实验材质入口，侧栏、抽屉和设置使用同一状态。 */
import { useId } from "react";
import { FlaskConical } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

export function ExperimentalGlassToggle({
  compact = false,
  collapsed = false,
}: {
  compact?: boolean;
  collapsed?: boolean;
}) {
  const { experimentalGlass, setExperimentalGlass } = usePreferences();
  const { t } = useI18n();
  const id = useId();
  const label = t("appearance:experimentalGlass");
  if (collapsed)
    return (
      <Button
        variant="ghost"
        className="sidebar-preference-trigger"
        aria-label={label}
        aria-pressed={experimentalGlass}
        title={`${label} · ${t("appearance:experimentalBadge")}`}
        onClick={() => setExperimentalGlass(!experimentalGlass)}
      >
        <FlaskConical size={20} aria-hidden="true" />
      </Button>
    );
  return (
    <div
      className={
        compact
          ? "sidebar-glass-control"
          : "flex items-start justify-between gap-4 rounded-2xl bg-muted/50 p-4"
      }
    >
      {compact && <FlaskConical size={20} aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="gap-2 text-sm leading-5">
          {label}
          {!compact && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {t("appearance:experimentalBadge")}
            </span>
          )}
        </Label>
        <p
          id={`${id}-description`}
          className={compact ? "sr-only" : "mt-2 text-xs text-muted-foreground"}
        >
          {t("appearance:experimentalGlassDescription")}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-description`}
        checked={experimentalGlass}
        onCheckedChange={setExperimentalGlass}
      />
    </div>
  );
}
