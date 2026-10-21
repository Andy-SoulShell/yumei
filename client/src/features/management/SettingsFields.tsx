/** 每个任务只呈现有关字段，字段类型与验证仍由共享契约决定。 */
import type { ProductConfig } from "@shared/productConfig";
import { ConfigForm, fieldLabel, type FormSchema } from "./ConfigForm";
import {
  getSetting,
  setSetting,
  settingSchema,
  settingsChoices,
  type SettingsNavigation,
} from "./settingsModel";
import { SettingsRecord } from "./SettingsRecord";
import { TierLimitsEditor } from "./TierLimitsEditor";
import type { TierLimits } from "@shared/productConfig";

export function SettingsFields({
  value,
  schema,
  path,
  fields,
  config,
  issues,
  disabled,
  onChange,
  view,
  onViewChange,
}: {
  value: unknown;
  schema?: FormSchema;
  path: string;
  fields: string[];
  config: ProductConfig;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: unknown) => void;
} & SettingsNavigation) {
  return (
    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
      {fields.map(field => {
        const current = getSetting(value, field),
          contract = settingSchema(schema, field),
          fullPath = `${path}.${field}`;
        const complex = current !== null && typeof current === "object";
        const record = [
          "intimacy.rules",
          "emotion.moods",
          "proactive.templates",
        ].includes(fullPath);
        const wide =
          complex ||
          (typeof current === "string" &&
            (/^prompts\./.test(path) || current.length > 120));
        return (
          <div key={field} className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
            {complex &&
              !Array.isArray(current) &&
              !contract?.propertyNames?.enum?.includes("zh-CN") && (
                <h3 className="mb-2 text-sm font-semibold">
                  {fieldLabel(field.split(".").at(-1)!)}
                </h3>
              )}
            {/^billing\.plans\.\d+\.limits$/.test(fullPath) ? (
              <TierLimitsEditor
                value={current as TierLimits}
                schema={contract}
                path={fullPath}
                issues={issues}
                disabled={disabled}
                onChange={next => onChange(setSetting(value, field, next))}
              />
            ) : record ? (
              <SettingsRecord
                view={view}
                onViewChange={onViewChange}
                value={current as Record<string, unknown>}
                schema={contract}
                path={fullPath}
                config={config}
                issues={issues}
                disabled={disabled}
                onChange={next => onChange(setSetting(value, field, next))}
              />
            ) : (
              <ConfigForm
                flat
                value={current}
                schema={contract}
                path={fullPath}
                choices={name => settingsChoices(config, name)}
                issues={issues}
                disabled={disabled}
                onChange={next => onChange(setSetting(value, field, next))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
