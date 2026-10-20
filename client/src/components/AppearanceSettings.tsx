import { LANGUAGES, LOCALES } from "@shared/locales";
/** 参考主题色卡的八套配色选择，以及独立的界面语言和显示模式。 */
import {
  Check,
  Globe,
  Monitor,
  Moon,
  Palette,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  THEME_IDS,
  type ThemeId,
  type ColorMode,
  type UiLanguage,
} from "@shared/preferences";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useI18n } from "@/lib/i18n";
import { ThemeOption } from "./ThemeOption";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { RadioGroup, RadioGroupChoice } from "./ui/radio-group";

const DISPLAY_MODES: {
  value: ColorMode;
  label: import("@shared/i18n").StaticMessageKey;
  icon: LucideIcon;
}[] = [
  { value: "system", label: "appearance:system", icon: Monitor },
  { value: "light", label: "common:light", icon: Sun },
  { value: "dark", label: "common:dark", icon: Moon },
];

/** 登录前后均可使用的语言选择器，修改后立即生效。 */
export function LanguagePicker() {
  const { preferences, update } = usePreferences();
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 text-sm">
      <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
      <Select
        value={preferences.language}
        onValueChange={language => update({ language: language as UiLanguage })}
      >
        <SelectTrigger
          aria-label={t("appearance:interfaceLanguage")}
          className="min-w-36"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t("appearance:system")}</SelectItem>
          {LOCALES.map(locale => (
            <SelectItem key={locale} value={locale}>
              {LANGUAGES[locale].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** 独立自动保存，不提交或重置其他设置分区的草稿。 */
export function AppearanceSettings() {
  const { preferences, update, saving, saveError, retry } = usePreferences();
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          {t("appearance:appearanceLanguage")}
        </CardTitle>
        <CardDescription>
          {t("appearance:makeYUMEIYoursChoicesAreSavedToYour")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {t("appearance:interfaceLanguage")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("appearance:onlyChangesTheInterfaceAIReplyLanguageAnd")}
            </p>
          </div>
          <LanguagePicker />
        </div>
        <fieldset>
          <legend className="mb-3 text-sm font-medium">
            {t("appearance:displayMode")}
          </legend>
          <RadioGroup
            aria-label={t("appearance:displayMode")}
            className="grid grid-cols-3 gap-2"
            value={preferences.colorMode}
            onValueChange={colorMode =>
              update({ colorMode: colorMode as ColorMode })
            }
          >
            {DISPLAY_MODES.map(({ value, label, icon: Icon }) => (
              <RadioGroupChoice
                variant="segment"
                key={value}
                value={value}
                className="gap-2 px-2"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(label)}</span>
              </RadioGroupChoice>
            ))}
          </RadioGroup>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-medium">
            {t("appearance:theme")}
          </legend>
          <RadioGroup
            aria-label={t("appearance:theme")}
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            value={preferences.theme}
            onValueChange={theme => update({ theme: theme as ThemeId })}
          >
            {THEME_IDS.map(id => {
              const selected = preferences.theme === id;
              return (
                <RadioGroupChoice
                  key={id}
                  value={id}
                  className={`flex min-h-24 items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? "border-primary/60 bg-primary/10" : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/60"}`}
                >
                  <ThemeOption theme={id} />
                  {selected && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </RadioGroupChoice>
              );
            })}
          </RadioGroup>
        </fieldset>
        <div aria-live="polite" className="text-xs text-muted-foreground">
          {saveError ? (
            <div className="flex items-center justify-between gap-2 text-destructive">
              <span>{t("appearance:notSyncedToYourAccountYetYourChoice")}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={retry}
              >
                {t("appearance:retrySave")}
              </Button>
            </div>
          ) : saving ? (
            t("appearance:syncingPreferences")
          ) : (
            t("appearance:changesApplyImmediately")
          )}
        </div>
      </CardContent>
    </Card>
  );
}
