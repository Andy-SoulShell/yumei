/** 平台开关留在原位；一份默认联系安排在单独弹框完成。 */
import { useId, useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { NumberField } from "./NumberField";
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function ContactScheduleEditor({
  config,
  schema,
  issues,
  disabled,
  onChange,
}: {
  config: ProductConfig;
  schema?: FormSchema;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: ProductConfig) => void;
}) {
  const [open, setOpen] = useState(false),
    id = useId(),
    rules = config.proactive,
    prefs = rules.defaults;
  const update = (key: keyof typeof prefs, value: unknown) =>
    onChange({
      ...config,
      proactive: { ...rules, defaults: { ...prefs, [key]: value } },
    });
  const number = (
    key: "frequencyDays" | "quietStart" | "quietEnd",
    label: string
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <NumberField
        id={`${id}-${key}`}
        label={label}
        value={prefs[key]}
        path={`proactive.defaults.${key}`}
        schema={
          key === "frequencyDays"
            ? {
                type: "integer",
                minimum: rules.frequencyDays.min,
                maximum: rules.frequencyDays.max,
              }
            : (schema?.properties?.defaults?.properties?.[key] ?? {})
        }
        disabled={disabled}
        onChange={next => update(key, next)}
        error={issues[`proactive.defaults.${key}`]}
      />
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
        <div>
          <Label htmlFor={`${id}-enabled`}>开放主动联系</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {rules.enabled ? "平台已开放 · 用户仍需自行开启" : "平台未开放"}
          </p>
        </div>
        <Switch
          id={`${id}-enabled`}
          checked={rules.enabled}
          disabled={disabled}
          onCheckedChange={enabled =>
            onChange({ ...config, proactive: { ...rules, enabled } })
          }
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-label="编辑新用户默认联系安排"
        className="w-full space-y-3 rounded-xl border p-4 text-left hover:border-primary/40"
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">新用户默认联系安排</strong>
          <Badge variant="secondary">
            {prefs.proactiveMode === "daily" ? "日常陪伴" : "围绕事件"}
          </Badge>
        </span>
        <span className="block text-sm">
          每 {prefs.frequencyDays} 天 · {prefs.timeZone}
        </span>
        <span className="block text-xs text-muted-foreground">
          {prefs.quietStart === prefs.quietEnd
            ? "免打扰未设置"
            : `免打扰 ${clock(prefs.quietStart)}–${clock(prefs.quietEnd)}`}{" "}
          · {prefs.hidePrivatePreview ? "隐藏通知内容" : "展示通知内容"}
        </span>
        <span className="block text-xs text-primary">编辑这份安排</span>
      </button>
      <details
        open={!!issues.proactive}
        className="admin-config-group rounded-xl border p-4"
      >
        <summary className="cursor-pointer text-sm font-medium">
          用户可选频率与联系间隔
        </summary>
        <div className="mt-4 space-y-4">
          <ConfigForm
            flat
            value={rules.frequencyDays}
            path="proactive.frequencyDays"
            schema={schema?.properties?.frequencyDays}
            disabled={disabled}
            issues={issues}
            onChange={next => {
              const range = next as typeof rules.frequencyDays;
              const valid =
                Number.isInteger(range.min) &&
                Number.isInteger(range.max) &&
                range.min >= 1 &&
                range.min <= range.max &&
                range.max <= 365;
              onChange({
                ...config,
                proactive: {
                  ...rules,
                  frequencyDays: range,
                  defaults: valid
                    ? {
                        ...prefs,
                        frequencyDays: Math.min(
                          range.max,
                          Math.max(range.min, prefs.frequencyDays)
                        ),
                      }
                    : prefs,
                },
              });
            }}
          />
          <ConfigForm
            value={rules.minimumGapMs}
            path="proactive.minimumGapMs"
            schema={schema?.properties?.minimumGapMs}
            disabled={disabled}
            issues={issues}
            onChange={next =>
              onChange({
                ...config,
                proactive: { ...rules, minimumGapMs: Number(next) },
              })
            }
          />
        </div>
      </details>
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!disabled) setOpen(next);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl"
          showCloseButton={!disabled}
          onEscapeKeyDown={event => {
            if (disabled) event.preventDefault();
          }}
          onInteractOutside={event => {
            if (disabled) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>新用户默认联系安排</DialogTitle>
            <DialogDescription>
              仅为未保存偏好的用户提供初始值，已有用户保留自己的选择。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[62dvh] space-y-5 overflow-y-auto p-1">
            <RadioGroup
              aria-label="新用户默认联系模式"
              value={prefs.proactiveMode}
              disabled={disabled}
              className="grid grid-cols-2 gap-2"
              onValueChange={mode => update("proactiveMode", mode)}
            >
              <RadioGroupChoice value="events" variant="segment">
                围绕事件关心
              </RadioGroupChoice>
              <RadioGroupChoice value="daily" variant="segment">
                日常陪伴
              </RadioGroupChoice>
            </RadioGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              {number("frequencyDays", "默认联系间隔")}
              <ConfigForm
                value={prefs.timeZone}
                path="proactive.defaults.timeZone"
                schema={schema?.properties?.defaults?.properties?.timeZone}
                disabled={disabled}
                issues={issues}
                onChange={next => update("timeZone", next)}
              />
              {number("quietStart", "免打扰开始")}
              {number("quietEnd", "免打扰结束")}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <Label htmlFor={`${id}-privacy`}>默认隐藏通知内容</Label>
              <Switch
                id={`${id}-privacy`}
                checked={prefs.hidePrivatePreview}
                disabled={disabled}
                onCheckedChange={next => update("hidePrivatePreview", next)}
              />
            </div>
          </div>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setOpen(false)}
          >
            完成联系安排
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
