/** 倍速以可选项管理，当前默认项始终保留在可选列表中。 */
import { useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormSchema } from "./ConfigForm";
type Playback = ProductConfig["experience"]["playback"];
export function PlaybackSpeedsEditor({
  value,
  schema,
  disabled,
  onChange,
}: {
  value: Playback;
  schema?: FormSchema;
  disabled: boolean;
  onChange: (value: Playback) => void;
}) {
  const [custom, setCustom] = useState("");
  const contract = schema?.properties?.speeds;
  const candidates = Array.from(
    new Set([0.5, 0.75, 1, 1.25, 1.5, 2, ...value.speeds])
  ).sort((a, b) => a - b);
  const number = Number(custom);
  const valid =
    custom.trim() &&
    Number.isFinite(number) &&
    number >= (contract?.items?.minimum ?? 0.25) &&
    number <= (contract?.items?.maximum ?? 4) &&
    !value.speeds.includes(number);
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">用户可以选择的倍速</h3>
        <p className="text-xs leading-6 text-muted-foreground">
          点选来开放或收起一个倍速。更换默认倍速后，才可收起原默认项。
        </p>
        <div className="flex flex-wrap gap-2">
          {candidates.map(speed => (
            <Button
              key={speed}
              variant={value.speeds.includes(speed) ? "secondary" : "outline"}
              aria-pressed={value.speeds.includes(speed)}
              aria-label={`允许 ${speed} 倍`}
              disabled={
                disabled ||
                speed === value.defaultSpeed ||
                (!value.speeds.includes(speed) &&
                  value.speeds.length >= (contract?.maxItems ?? 20))
              }
              onClick={() =>
                onChange({
                  ...value,
                  speeds: value.speeds.includes(speed)
                    ? value.speeds.filter(item => item !== speed)
                    : [...value.speeds, speed].sort((a, b) => a - b),
                })
              }
            >
              {speed}×
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            aria-label="自定义倍速"
            placeholder="自定义倍速"
            min={contract?.items?.minimum}
            max={contract?.items?.maximum}
            step="any"
            disabled={disabled}
            value={custom}
            onChange={e => setCustom(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={
              disabled ||
              !valid ||
              value.speeds.length >= (contract?.maxItems ?? 20)
            }
            onClick={() => {
              onChange({
                ...value,
                speeds: [...value.speeds, number].sort((a, b) => a - b),
              });
              setCustom("");
            }}
          >
            添加
          </Button>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">第一次播放采用哪个倍速</h3>
        <div
          role="group"
          aria-label="默认倍速"
          className="flex flex-wrap gap-2"
        >
          {value.speeds.map(speed => (
            <Button
              key={speed}
              aria-pressed={speed === value.defaultSpeed}
              variant={speed === value.defaultSpeed ? "secondary" : "outline"}
              disabled={disabled}
              onClick={() => onChange({ ...value, defaultSpeed: speed })}
            >
              {speed}×{speed === value.defaultSpeed ? " · 默认" : ""}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
