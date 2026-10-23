import { useState } from "react";
import { LANGUAGES, LOCALES } from "@shared/locales";
/** 参考主题色卡的八套配色选择，以及独立的界面语言和显示模式。 */
import {
  Check,
  ChevronDown,
  Globe,
  Monitor,
  Moon,
  Palette,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  type ThemeId,
  type ColorMode,
  type UiLanguage,
} from "@shared/preferences";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useI18n } from "@/lib/i18n";
import { ThemeOption } from "./ThemeOption";
import { ExperimentalGlassToggle } from "./ExperimentalGlassToggle";
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

/** 侧栏的语言、显示模式和主题入口，沿用账号偏好的即时保存逻辑。 */
export function SidebarPreferences({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const { preferences, themes, update, saveError, saving, retry } =
    usePreferences();
  const { t } = useI18n();
  const controls = [
    {
      id: "language",
      label: t("appearance:interfaceLanguage"),
      icon: Globe,
      value: preferences.language,
      onChange: (language: string) =>
        update({ language: language as UiLanguage }),
      options: [
        { value: "system", label: t("appearance:system") },
        ...LOCALES.map(locale => ({
          value: locale,
          label: LANGUAGES[locale].label,
        })),
      ],
    },
    {
      id: "colorMode",
      label: t("appearance:displayMode"),
      icon: DISPLAY_MODES.find(mode => mode.value === preferences.colorMode)!
        .icon,
      value: preferences.colorMode,
      onChange: (colorMode: string) =>
        update({ colorMode: colorMode as ColorMode }),
      options: DISPLAY_MODES.map(mode => ({
        value: mode.value,
        label: t(mode.label),
      })),
    },
    {
      id: "theme",
      label: t("appearance:theme"),
      icon: Palette,
      value: preferences.theme,
      onChange: (theme: string) => update({ theme: theme as ThemeId }),
      options: themes.map(item => ({
        value: item.id,
        label: item.name,
      })),
    },
  ];
  return (
    <div
      className="sidebar-preferences"
      role="group"
      aria-label={t("appearance:appearanceLanguage")}
    >
      {controls.map(({ id, label, icon: Icon, value, onChange, options }) => (
        <Select key={id} value={value} onValueChange={onChange}>
          <SelectTrigger
            className="sidebar-preference-trigger"
            aria-label={label}
            title={
              collapsed
                ? `${label}: ${options.find(option => option.value === value)?.label}`
                : undefined
            }
          >
            <Icon size={20} aria-hidden="true" />
            <span className="sidebar-preference-value">
              <SelectValue>
                {id === "theme" ? (
                  <ThemeOption theme={preferences.theme} variant="value" />
                ) : undefined}
              </SelectValue>
            </span>
          </SelectTrigger>
          <SelectContent
            className={
              id === "theme" ? "w-64 max-w-[calc(100vw-2rem)]" : undefined
            }
          >
            {options.map(option => (
              <SelectItem
                key={option.value}
                value={option.value}
                textValue={option.label}
                className={
                  id === "theme"
                    ? "min-h-11 rounded-lg border border-transparent px-2 py-1 pr-8 data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary/5"
                    : undefined
                }
              >
                {id === "theme" ? (
                  <ThemeOption theme={option.value as ThemeId} variant="menu" />
                ) : (
                  option.label
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      <ExperimentalGlassToggle compact collapsed={collapsed} />
      {saveError && (
        <div className="sidebar-preferences-error" role="status">
          {!collapsed && (
            <p>{t("appearance:notSyncedToYourAccountYetYourChoice")}</p>
          )}
          <Button variant="ghost" size="sm" disabled={saving} onClick={retry}>
            {t("appearance:retrySave")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** 登录前后均可使用的语言选择器，修改后立即生效。 */
export function LanguagePicker({ onChanged }: { onChanged?: () => void } = {}) {
  const { preferences, update } = usePreferences();
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 text-sm">
      <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
      <Select
        value={preferences.language}
        onValueChange={language => {
          onChanged?.();
          update({ language: language as UiLanguage });
        }}
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
  const { preferences, themes, update, saving, saveError, retry } =
    usePreferences();
  const { t } = useI18n();
  const [changed, setChanged] = useState(false);
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
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("settingsFlow:appearanceScope")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {t("appearance:interfaceLanguage")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("appearance:onlyChangesTheInterfaceAIReplyLanguageAnd")}
            </p>
          </div>
          <LanguagePicker onChanged={() => setChanged(true)} />
        </div>
        <fieldset>
          <legend className="mb-3 text-sm font-medium">
            {t("appearance:displayMode")}
          </legend>
          <RadioGroup
            aria-label={t("appearance:displayMode")}
            className="grid grid-cols-3 gap-2"
            value={preferences.colorMode}
            onValueChange={colorMode => {
              setChanged(true);
              update({ colorMode: colorMode as ColorMode });
            }}
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
        <details className="settings-details">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium">
            {t("settingsFlow:appearanceAdvanced")}
            <ChevronDown className="size-4 shrink-0" />
          </summary>
          <ExperimentalGlassToggle />
          <fieldset>
            <legend className="mb-3 text-sm font-medium">
              {t("appearance:theme")}
            </legend>
            <RadioGroup
              aria-label={t("appearance:theme")}
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
              value={preferences.theme}
              onValueChange={theme => {
                setChanged(true);
                update({ theme: theme as ThemeId });
              }}
            >
              {themes.map(({ id }) => {
                const selected = preferences.theme === id;
                return (
                  <RadioGroupChoice
                    key={id}
                    value={id}
                    className={`flex min-h-24 items-center gap-3 rounded-2xl px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? "bg-primary/10" : "bg-muted/40 hover:bg-muted/70"}`}
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
        </details>
        <div
          role={saveError ? "alert" : "status"}
          aria-live="polite"
          className="text-xs text-muted-foreground"
        >
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
          ) : changed ? (
            t("settingsFlow:appearanceSaved")
          ) : (
            t("appearance:changesApplyImmediately")
          )}
        </div>
      </CardContent>
    </Card>
  );
}
