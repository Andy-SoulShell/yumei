/** 颜色选择与十六进制输入编辑同一个草稿值。 */
import { Input } from "@/components/ui/input";
export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
export function ColorField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const valid = isHexColor(value);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="relative size-11 shrink-0 overflow-hidden rounded-xl border shadow-sm"
        style={{ background: valid ? value : "transparent" }}
      >
        <input
          aria-label={`${label} 颜色选择器`}
          type="color"
          value={valid ? value : "#000000"}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
          className="absolute -inset-2 h-16 w-16 cursor-pointer border-0 p-0 disabled:cursor-default"
        />
      </div>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={!valid}
        maxLength={7}
        spellCheck={false}
        className="min-w-0 flex-1 px-2 font-mono text-xs"
        placeholder="#RRGGBB"
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
}
