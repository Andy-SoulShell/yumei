/** 以实际关系等级查看继承的容量规则，新增门槛时保留前后等级的原规则。 */
import type { ProductConfig } from "@shared/productConfig";
import { memoryLevelRule } from "@shared/memory";
import { Button } from "@/components/ui/button";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import type { SettingsNavigation } from "./settingsModel";

export function MemoryCapacityEditor({
  value,
  schema,
  config,
  disabled,
  issues,
  onChange,
  view,
  onViewChange,
}: {
  value: ProductConfig["memory"]["levelRules"];
  schema?: FormSchema;
  config: ProductConfig;
  disabled: boolean;
  issues: Record<string, string>;
  onChange: (next: unknown) => void;
} & SettingsNavigation) {
  const selected = Number(view.selections["memory.capacityLevel"] ?? 1),
    level = config.intimacy.levels.some(item => item.level === selected)
      ? selected
      : 1,
    rule = memoryLevelRule(level, { ...config.memory, levelRules: value }),
    index = value.indexOf(rule),
    next = value[index + 1]?.minLevel,
    name = config.intimacy.levels.find(item => item.level === level)?.name[
      "zh-CN"
    ];
  return (
    <div className="space-y-4">
      <label className="block space-y-2 text-sm font-medium">
        查看哪个等级的记忆能力
        <select
          aria-label="查看哪个等级的记忆能力"
          value={level}
          disabled={disabled}
          className="admin-select w-full"
          onChange={e =>
            onViewChange({
              ...view,
              selections: {
                ...view.selections,
                "memory.capacityLevel": e.target.value,
              },
            })
          }
        >
          {config.intimacy.levels.map(item => (
            <option key={item.level} value={item.level}>
              {item.level} 级 · {item.name["zh-CN"]}（{item.requiredPoints} 分）
            </option>
          ))}
        </select>
      </label>
      <p
        className="rounded-xl bg-primary/5 p-3 text-sm leading-6"
        aria-live="polite"
      >
        {name}使用第 {rule.minLevel} 级起的容量规则：最多存 {rule.capacity}{" "}
        条，普通回复最多选 {rule.recallCount} 条。修改下方数值会影响第{" "}
        {rule.minLevel}–{next ? next - 1 : config.intimacy.levels.length} 级。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["capacity", "recallCount"] as const).map(key => (
          <ConfigForm
            key={`${index}.${key}`}
            value={rule[key]}
            path={`memory.levelRules.${index}.${key}`}
            schema={schema?.items?.properties?.[key]}
            disabled={disabled}
            issues={issues}
            onChange={next =>
              onChange(
                value.map((item, i) =>
                  i === index ? { ...item, [key]: next } : item
                )
              )
            }
          />
        ))}
      </div>
      {issues["memory"] && (
        <p role="status" className="text-xs text-destructive">
          {issues.memory}
        </p>
      )}
      {rule.minLevel !== level && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || value.length >= 100}
          onClick={() =>
            onChange(
              [...value, { ...rule, minLevel: level }].sort(
                (a, b) => a.minLevel - b.minLevel
              )
            )
          }
        >
          从第 {level} 级开始单独设置
        </Button>
      )}
      <details className="admin-config-group rounded-lg border p-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          查看全部容量门槛 · 合并规则
        </summary>
        <div className="mt-3 space-y-3">
          {value.map((item, i) => (
            <div
              key={item.minLevel}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span>
                第 {item.minLevel} 级起：存 {item.capacity} 条 / 召回{" "}
                {item.recallCount} 条
              </span>
              {i > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    if (
                      window.confirm(
                        `移除第 ${item.minLevel} 级的容量门槛？该范围将继承第 ${value[i - 1].minLevel} 级起的规则。`
                      )
                    )
                      onChange(value.filter((_, at) => at !== i));
                  }}
                >
                  移除门槛并继承前一规则
                </Button>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
