/** 所有业务设置使用任务分区、实时预览和内容卡片，编辑同一份受保护草稿。 */
import { useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { FormSchema } from "./ConfigForm";
import { SettingsPreview } from "./SettingsPreview";
import { SettingsFields } from "./SettingsFields";
import { SettingsCollection } from "./SettingsCollection";
import { WorkflowEditor } from "./WorkflowEditor";
import {
  settingsPanels,
  getSetting,
  setSetting,
  settingSchema,
  type SettingsSection,
} from "./settingsModel";

export function SettingsEditor({
  section,
  config,
  schema,
  issues,
  disabled,
  onChange,
}: {
  section: SettingsSection;
  config: ProductConfig;
  schema?: FormSchema;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: ProductConfig) => void;
}) {
  const panels = settingsPanels[section];
  const [tab, setTab] = useState(panels[0].id);
  const [workflowBuffers, setWorkflowBuffers] = useState<
    Record<string, string>
  >({});
  const current = config[section];
  const update = (next: unknown) => onChange({ ...config, [section]: next });
  return (
    <div className="space-y-5">
      <SettingsPreview config={config} section={section} panel={tab} />
      <Tabs
        value={tab}
        onValueChange={setTab}
        activationMode="manual"
        className="min-w-0"
      >
        <TabsList
          aria-label="设置任务分区"
          className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/30 p-1.5"
        >
          {panels.map(item => {
            const count = Object.keys(issues).filter(key =>
              item.fields.some(
                field =>
                  key === `${section}.${field}` ||
                  key.startsWith(`${section}.${field}.`)
              )
            ).length;
            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                disabled={disabled}
                className="min-h-10 flex-none gap-2 px-3"
              >
                {item.title}
                {count > 0 && (
                  <Badge variant="destructive" className="px-1.5 text-[10px]">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {panels.map(item => (
          <TabsContent key={item.id} value={item.id} className="mt-5 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
            </div>
            {item.collection ? (
              <SettingsCollection
                kind={item.collection}
                items={
                  getSetting(current, item.fields[0]) as Record<
                    string,
                    unknown
                  >[]
                }
                schema={settingSchema(schema, item.fields[0])}
                path={`${section}.${item.fields[0]}`}
                config={config}
                issues={issues}
                disabled={disabled}
                onChange={next =>
                  update(setSetting(current, item.fields[0], next))
                }
              />
            ) : item.workflow ? (
              <WorkflowEditor
                value={config.models.image.workflows[item.workflow]}
                raw={
                  workflowBuffers[item.workflow] ??
                  JSON.stringify(
                    config.models.image.workflows[item.workflow].nodes,
                    null,
                    2
                  )
                }
                onRawChange={raw =>
                  setWorkflowBuffers(old => ({ ...old, [item.workflow!]: raw }))
                }
                onChange={workflow =>
                  onChange({
                    ...config,
                    models: {
                      ...config.models,
                      image: {
                        ...config.models.image,
                        workflows: {
                          ...config.models.image.workflows,
                          [item.workflow!]: workflow,
                        },
                      },
                    },
                  })
                }
                disabled={disabled}
                reference={item.workflow === "reference"}
              />
            ) : (
              <SettingsFields
                value={current}
                schema={schema}
                fields={item.fields}
                path={section}
                config={config}
                issues={issues}
                disabled={disabled}
                onChange={update}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
