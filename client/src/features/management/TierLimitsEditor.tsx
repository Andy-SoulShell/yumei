/** 自拍额度按日、按月、不限量互斥选择，避免两个 nullable 数值产生误解。 */
import { useId, useState } from "react";
import type { TierLimits } from "@shared/productConfig";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { NumberField } from "./NumberField";
function quotaSchema(schema?: FormSchema) {
  return schema?.anyOf?.find(item => item.type !== "null") ?? schema ?? {};
}
function Quota({
  label,
  value,
  path,
  schema,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  path: string;
  schema?: FormSchema;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [last, setLast] = useState(value ?? 0);
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <Label htmlFor={id}>{label}</Label>
      <RadioGroup
        aria-label={`${label}计量方式`}
        className="grid grid-cols-2 gap-2"
        value={value === null ? "unlimited" : "limited"}
        disabled={disabled}
        onValueChange={mode => onChange(mode === "unlimited" ? null : last)}
      >
        <RadioGroupChoice value="limited" variant="segment">
          设置额度
        </RadioGroupChoice>
        <RadioGroupChoice value="unlimited" variant="segment">
          不限量
        </RadioGroupChoice>
      </RadioGroup>
      {value !== null ? (
        <NumberField
          id={id}
          label={label}
          value={value}
          schema={quotaSchema(schema)}
          path={path}
          disabled={disabled}
          onChange={next => {
            setLast(next);
            onChange(next);
          }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">不限制此项额度</p>
      )}
      <p className="text-xs text-muted-foreground">0 表示不提供此项额度。</p>
    </section>
  );
}
export function TierLimitsEditor({
  value,
  schema,
  path,
  issues,
  disabled,
  onChange,
}: {
  value: TierLimits;
  schema?: FormSchema;
  path: string;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: TierLimits) => void;
}) {
  const mode =
    value.dailySelfies !== null
      ? "day"
      : value.monthlySelfies !== null
        ? "month"
        : "unlimited";
  const amount = value.dailySelfies ?? value.monthlySelfies ?? 0;
  const [last, setLast] = useState(amount);
  const changeMode = (next: string) =>
    onChange({
      ...value,
      dailySelfies: next === "day" ? last : null,
      monthlySelfies: next === "month" ? last : null,
    });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["dailyMessages", "每日聊天额度"],
            ["maxGirlfriends", "角色数量额度"],
          ] as const
        ).map(([key, label]) => (
          <Quota
            key={key}
            label={label}
            value={value[key]}
            path={`${path}.${key}`}
            schema={schema?.properties?.[key]}
            disabled={disabled}
            onChange={next => onChange({ ...value, [key]: next })}
          />
        ))}
      </div>
      <section className="space-y-3 rounded-xl border p-4">
        <h4 className="text-sm font-medium">图片生成额度</h4>
        <RadioGroup
          aria-label="图片额度周期"
          className="grid grid-cols-3 gap-2"
          disabled={disabled}
          value={mode}
          onValueChange={changeMode}
        >
          <RadioGroupChoice value="day" variant="segment">
            按日
          </RadioGroupChoice>
          <RadioGroupChoice value="month" variant="segment">
            按月
          </RadioGroupChoice>
          <RadioGroupChoice value="unlimited" variant="segment">
            不限量
          </RadioGroupChoice>
        </RadioGroup>
        {mode !== "unlimited" ? (
          <NumberField
            label={mode === "day" ? "每日图片额度" : "每月图片额度"}
            value={amount}
            schema={quotaSchema(
              schema?.properties?.[
                mode === "day" ? "dailySelfies" : "monthlySelfies"
              ]
            )}
            path={`${path}.${mode === "day" ? "dailySelfies" : "monthlySelfies"}`}
            disabled={disabled}
            onChange={next => {
              setLast(next);
              onChange({
                ...value,
                dailySelfies: mode === "day" ? next : null,
                monthlySelfies: mode === "month" ? next : null,
              });
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">图片数量不限量</p>
        )}
        <p className="text-xs text-muted-foreground">
          0 表示不提供图片额度；切换周期保留填写数值，不自动换算。
        </p>
      </section>
      <ConfigForm
        flat
        value={Object.fromEntries(
          Object.entries(value).filter(
            ([key]) =>
              ![
                "dailyMessages",
                "maxGirlfriends",
                "dailySelfies",
                "monthlySelfies",
              ].includes(key)
          )
        )}
        schema={{
          ...schema,
          properties: Object.fromEntries(
            Object.entries(schema?.properties ?? {}).filter(
              ([key]) =>
                ![
                  "dailyMessages",
                  "maxGirlfriends",
                  "dailySelfies",
                  "monthlySelfies",
                ].includes(key)
            )
          ),
        }}
        path={path}
        issues={issues}
        disabled={disabled}
        onChange={next =>
          onChange({ ...value, ...(next as Partial<TierLimits>) })
        }
      />
    </div>
  );
}
