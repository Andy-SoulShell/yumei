/** 带单位与边界的数值控件，单位切换只影响展示，清空不会变成 0。 */
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import type { FormSchema } from "./ConfigForm";
import {
  defaultUnit,
  displayedNumber,
  fieldHint,
  numericError,
  numericRange,
  storedNumber,
  valueUnits,
} from "./fieldPresentation";

export function NumberField({
  id: suppliedId,
  label,
  value,
  schema,
  path,
  disabled,
  onChange,
  error: externalError,
  currency,
}: {
  id?: string;
  label: string;
  value: number;
  schema: FormSchema;
  path: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  error?: string;
  currency?: string;
}) {
  const generated = useId(),
    id = suppliedId ?? generated;
  const units = valueUnits(path, currency);
  const [factor, setFactor] = useState(
    () => defaultUnit(path, value, units).factor
  );
  const [input, setInput] = useState<{
    value: number;
    factor: number;
    text: string;
  }>();
  const selected =
    units.find(item => item.factor === factor) ??
    defaultUnit(path, value, units);
  const error = numericError(value, schema) ?? externalError;
  const clock = /quiet(Start|End)$/.test(path);
  const hour = /(?:startHour|endHour)$/.test(path);
  const slider = /(?:volume|temperature|topP|hue|pitch|browserRate)$/.test(
    path
  );
  const hint = fieldHint(path);
  const lower = schema.minimum ?? schema.exclusiveMinimum;
  const upper = schema.maximum ?? schema.exclusiveMaximum;
  const shown =
    input && Object.is(input.value, value) && input.factor === selected.factor
      ? input.text
      : displayedNumber(value, selected.factor);
  const help = `${id}-value-help`;
  const props = {
    id,
    "aria-label": label,
    "aria-describedby": help,
    "aria-invalid": !!error,
    disabled,
  };
  return (
    <div className="space-y-2">
      {clock ? (
        <Input
          {...props}
          type="time"
          step={60}
          value={
            Number.isInteger(value) && value >= 0 && value < 1440
              ? `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
              : ""
          }
          onChange={event => {
            const parts = event.target.value.split(":");
            onChange(
              parts.length === 2
                ? Number(parts[0]) * 60 + Number(parts[1])
                : NaN
            );
          }}
        />
      ) : hour ? (
        <select
          {...props}
          className="admin-select w-full"
          value={Number.isFinite(value) ? value : ""}
          onChange={event => onChange(Number(event.target.value))}
        >
          {!Number.isFinite(value) && <option value="">请选择小时</option>}
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>
              {String(i).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              {...props}
              className="min-w-0 flex-1"
              type="number"
              inputMode="decimal"
              min={lower === undefined ? undefined : lower / selected.factor}
              max={upper === undefined ? undefined : upper / selected.factor}
              step={
                schema.multipleOf
                  ? schema.multipleOf / selected.factor
                  : schema.type === "integer"
                    ? 1 / selected.factor
                    : "any"
              }
              value={shown}
              onChange={event => {
                const next = storedNumber(
                  event.target.value,
                  selected.factor,
                  schema.type === "integer"
                );
                setInput({
                  value: next,
                  factor: selected.factor,
                  text: event.target.value,
                });
                onChange(next);
              }}
            />
            {units.length > 1 ? (
              <select
                aria-label={`${label}单位`}
                className="admin-select w-24 shrink-0"
                disabled={disabled}
                value={selected.factor}
                onChange={event => setFactor(Number(event.target.value))}
              >
                {units.map(item => (
                  <option key={item.label} value={item.factor}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">
                {selected.label}
              </span>
            )}
          </div>
          {slider && lower !== undefined && upper !== undefined && (
            <input
              type="range"
              aria-label={`${label}滑块`}
              aria-describedby={help}
              disabled={disabled}
              min={lower / selected.factor}
              max={upper / selected.factor}
              step="any"
              value={
                Number.isFinite(value) ? Number(shown) : lower / selected.factor
              }
              className="w-full accent-primary"
              onChange={event =>
                onChange(
                  storedNumber(
                    event.target.value,
                    selected.factor,
                    schema.type === "integer"
                  )
                )
              }
            />
          )}
        </>
      )}
      <div
        id={help}
        className="space-y-1 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {error && <p className="text-destructive">{error}</p>}
        {!clock && !hour && <p>{numericRange(schema, selected, units)}</p>}
        {hour && <p>00:00–23:00 · 以所选时区的整点为准</p>}
        {hint && <p>{hint}</p>}
      </div>
    </div>
  );
}
