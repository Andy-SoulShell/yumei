/** 固定奖励、心情和通知以具名卡片选择，避免一次展开所有语言和规则。 */
import type { ProductConfig } from "@shared/productConfig";
import { Badge } from "@/components/ui/badge";
import { ConfigForm, fieldLabel, type FormSchema } from "./ConfigForm";
import type { SettingsNavigation } from "./settingsModel";
const notificationNames: Record<string, string> = {
  "notifications:title.thinkingOfYou": "想念通知标题",
  "notifications:privateTitle": "隐私通知标题",
  "notifications:privatePreview": "隐私通知正文",
  "notifications:eventUpcoming": "事件即将到来",
  "notifications:eventToday": "事件当天",
  "notifications:eventFollowUp": "事件后续关心",
  "notifications:dailyCompanion": "日常陪伴正文",
};
export function SettingsRecord({
  value,
  schema,
  path,
  issues,
  disabled,
  onChange,
  view,
  onViewChange,
}: {
  value: Record<string, unknown>;
  schema?: FormSchema;
  path: string;
  config: ProductConfig;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: unknown) => void;
} & SettingsNavigation) {
  const keys = Object.keys(schema?.properties ?? value).filter(
    key => key in value
  );
  const choice = view.selections[path] ?? keys[0];
  const selected = choice in value ? choice : keys[0];
  const item = value[selected];
  const label = (key: string) => notificationNames[key] ?? fieldLabel(key);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {keys.map(key => {
          const row = value[key] as Record<string, unknown>;
          const errors = Object.keys(issues).filter(
            field =>
              field === `${path}.${key}` || field.startsWith(`${path}.${key}.`)
          ).length;
          return (
            <button
              type="button"
              key={key}
              disabled={disabled}
              aria-pressed={key === selected}
              className={`min-w-0 rounded-xl border p-3 text-left text-sm ${key === selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
              onClick={() =>
                onViewChange({
                  ...view,
                  selections: { ...view.selections, [path]: key },
                })
              }
            >
              <span className="flex items-center justify-between gap-2">
                <span>
                  {typeof row?.emoji === "string" ? row.emoji + " " : ""}
                  {label(key)}
                </span>
                {errors > 0 && <Badge variant="destructive">{errors}</Badge>}
              </span>
              {typeof row?.basePoints === "number" && (
                <span className="mt-2 block text-xs text-muted-foreground">
                  基础 {row.basePoints} 分 · 额外 {String(row.bonusPoints)} 分 ·{" "}
                  {row.enabled ? "已启用" : "已停用"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selected && (
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">{label(selected)}</h3>
          <ConfigForm
            key={selected}
            flat
            value={item}
            schema={
              schema?.properties?.[selected] ??
              (typeof schema?.additionalProperties === "object"
                ? schema.additionalProperties
                : undefined)
            }
            path={`${path}.${selected}`}
            issues={issues}
            disabled={disabled}
            onChange={next => onChange({ ...value, [selected]: next })}
          />
        </section>
      )}
    </div>
  );
}
