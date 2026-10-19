/** 参考主题色卡的八套配色选择，以及独立的界面语言和显示模式。 */
import { Check, Globe, Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  THEME_IDS,
  type ThemeId,
  type ColorMode,
  type UiLanguage,
} from "@shared/preferences";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useI18n } from "@/lib/i18n";
import { THEMES } from "@/lib/themes";
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
        <SelectTrigger aria-label={t("界面语言")} className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t("跟随系统")}</SelectItem>
          <SelectItem value="zh-CN">简体中文</SelectItem>
          <SelectItem value="en">English</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** 独立自动保存，不提交或重置其他设置分区的草稿。 */
export function AppearanceSettings() {
  const { preferences, update, saving, saveError, retry } = usePreferences();
  const { t } = useI18n();
  const modes: { value: ColorMode; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "跟随系统", icon: Monitor },
    { value: "light", label: "浅色", icon: Sun },
    { value: "dark", label: "深色", icon: Moon },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          {t("外观与语言")}
        </CardTitle>
        <CardDescription>
          {t("按你的偏好显示，选择后自动保存到账号。")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t("界面语言")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("仅影响界面，不改变 AI 回复语言和聊天记录。")}
            </p>
          </div>
          <LanguagePicker />
        </div>
        <fieldset>
          <legend className="mb-3 text-sm font-medium">{t("显示模式")}</legend>
          <RadioGroup
            aria-label={t("显示模式")}
            className="grid grid-cols-3 gap-2"
            value={preferences.colorMode}
            onValueChange={colorMode =>
              update({ colorMode: colorMode as ColorMode })
            }
          >
            {modes.map(({ value, label, icon: Icon }) => (
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
          <legend className="mb-3 text-sm font-medium">{t("主题")}</legend>
          <RadioGroup
            aria-label={t("主题")}
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            value={preferences.theme}
            onValueChange={theme => update({ theme: theme as ThemeId })}
          >
            {THEME_IDS.map(id => {
              const theme = THEMES[id];
              const selected = preferences.theme === id;
              return (
                <RadioGroupChoice
                  key={id}
                  value={id}
                  className={`flex min-h-24 items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? "border-primary/60 bg-primary/10" : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/60"}`}
                >
                  <span
                    className="flex shrink-0 -space-x-1.5"
                    aria-hidden="true"
                  >
                    {theme.colors.map(color => (
                      <span
                        key={color}
                        style={{ backgroundColor: color }}
                        className="h-4 w-4 rounded-full border border-black/10 sm:h-5 sm:w-5"
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {t(theme.name)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t(theme.description)}
                    </span>
                  </span>
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
              <span>{t("偏好尚未同步到账号，当前选择已在本机保留。")}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={retry}
              >
                {t("重试保存")}
              </Button>
            </div>
          ) : saving ? (
            t("正在同步偏好…")
          ) : (
            t("选择后立即生效")
          )}
        </div>
      </CardContent>
    </Card>
  );
}
