/** 从用户经历理解规则，按任务编辑，并在同一草稿中处理跨页依赖。 */
import { useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { ArrowUpRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { FormSchema } from "./ConfigForm";
import { SettingsPreview } from "./SettingsPreview";
import { SettingsFields } from "./SettingsFields";
import { SettingsCollection } from "./SettingsCollection";
import { WorkflowEditor } from "./WorkflowEditor";
import { SettingsScenario } from "./SettingsScenario";
import {
  settingsJourneys,
  taskFieldGroups,
  visibleFieldGroup,
  type RelatedTask,
} from "./settingsRelations";
import {
  settingsPanels,
  getSetting,
  setSetting,
  settingSchema,
  type SettingsSection,
  type SettingsViewState,
  createSettingsView,
} from "./settingsModel";

type EditorProps = {
  section: SettingsSection;
  config: ProductConfig;
  schema?: FormSchema;
  rootSchema?: FormSchema;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: ProductConfig) => void;
  view?: SettingsViewState;
  onViewChange?: (next: SettingsViewState) => void;
  embedded?: boolean;
};
export function SettingsEditor({
  section,
  config,
  schema,
  rootSchema,
  issues,
  disabled,
  onChange,
  view: suppliedView,
  onViewChange: suppliedOnViewChange,
  embedded = false,
}: EditorProps) {
  const panels = settingsPanels[section],
    journey = settingsJourneys[section];
  const [localView, setLocalView] = useState(createSettingsView);
  const view = suppliedView ?? localView,
    onViewChange = suppliedOnViewChange ?? setLocalView;
  const tab = panels.some(item => item.id === view.task)
    ? view.task!
    : panels[0].id;
  const workflowBuffers = view.buffers ?? {};
  const [related, setRelated] = useState<RelatedTask | null>(null);
  const [relatedViews, setRelatedViews] = useState<
    Record<string, SettingsViewState>
  >({});
  const current = config[section];
  const update = (next: unknown) => onChange({ ...config, [section]: next });
  return (
    <div className="min-w-0 space-y-6">
      {!embedded && (
        <section aria-label="设置之间的关系" className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            {journey.goal}
          </h2>
        </section>
      )}
      <Tabs
        value={tab}
        onValueChange={task => onViewChange({ ...view, task })}
        activationMode="manual"
        orientation="vertical"
        className="min-w-0 gap-5 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start"
      >
        <TabsList
          aria-label="设置任务分区"
          className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0 lg:flex-col lg:items-stretch"
        >
          {panels.map((item, index) => {
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
                aria-label={item.title + (count ? `，${count} 项需要修正` : "")}
                disabled={disabled}
                className="h-auto min-h-11 flex-none items-start justify-start gap-2 whitespace-normal rounded-xl border border-transparent px-3 py-3 text-left data-[state=active]:border-primary/25 data-[state=active]:bg-primary/5 data-[state=active]:shadow-none"
              >
                <span className="mt-0.5 text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{item.title}</span>
                  <span className="mt-1 hidden text-xs font-normal leading-5 text-muted-foreground lg:block">
                    {taskFieldGroups[section]?.[item.id]?.[0]?.title ??
                      item.description}
                  </span>
                </span>
                {count > 0 && (
                  <Badge variant="destructive" className="px-1.5 text-[10px]">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <div className="min-w-0">
          {panels.map(item => (
            <TabsContent
              key={item.id}
              value={item.id}
              className="m-0 min-w-0 space-y-5"
            >
              <div>
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </div>
              {item.collection ? (
                <SettingsCollection
                  kind={item.collection}
                  onConfigChange={onChange}
                  rootSchema={rootSchema}
                  view={view}
                  onViewChange={onViewChange}
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
                <>
                  <p className="rounded-xl bg-muted/25 p-3 text-sm leading-6">
                    {config.models.image.provider === "comfyui"
                      ? "当前使用 ComfyUI，此工作流会参与对应图片任务。"
                      : "当前运营图片服务使用 fal，此工作流作为备用保存；切换到 ComfyUI 后用于对应任务。"}
                  </p>
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
                      onViewChange({
                        ...view,
                        buffers: { ...workflowBuffers, [item.workflow!]: raw },
                      })
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
                </>
              ) : (
                (
                  taskFieldGroups[section]?.[item.id] ?? [
                    {
                      title: item.title,
                      description: item.description,
                      fields: item.fields,
                    },
                  ]
                ).map((group, index) => {
                  const fields = group.fields.filter(field =>
                    visibleFieldGroup(section, field, config)
                  );
                  const inactive = group.fields.filter(
                    field => !visibleFieldGroup(section, field, config)
                  );
                  const renderFields = (names: string[]) => (
                    <SettingsFields
                      value={current}
                      schema={schema}
                      fields={names}
                      path={section}
                      config={config}
                      issues={issues}
                      disabled={disabled}
                      onChange={update}
                      view={view}
                      onViewChange={onViewChange}
                    />
                  );
                  if (!taskFieldGroups[section]?.[item.id])
                    return (
                      <section
                        key={group.title}
                        className="rounded-xl border p-4 sm:p-5"
                      >
                        {renderFields(fields)}
                      </section>
                    );
                  const content = (
                    <>
                      <p className="mb-4 text-sm leading-6 text-muted-foreground">
                        {group.description}
                      </p>
                      {renderFields(fields)}
                    </>
                  );
                  const hasError = Object.keys(issues).some(key =>
                    group.fields.some(
                      field =>
                        key === `${section}.${field}` ||
                        key.startsWith(`${section}.${field}.`)
                    )
                  );
                  return (
                    <div key={group.title} className="space-y-3">
                      {fields.length > 0 &&
                        (group.advanced ? (
                          <details
                            open={hasError}
                            className="admin-config-group rounded-xl border p-4"
                          >
                            <summary className="cursor-pointer text-sm font-medium">
                              {group.title}
                              <Badge variant="outline" className="ml-2">
                                进阶
                              </Badge>
                              {hasError && (
                                <Badge variant="destructive">需要修正</Badge>
                              )}
                            </summary>
                            <div className="mt-4">{content}</div>
                          </details>
                        ) : (
                          <section className="rounded-xl border p-4 sm:p-5">
                            <h3 className="mb-2 text-sm font-semibold">
                              <span className="mr-2 text-primary">
                                {index + 1}.
                              </span>
                              {group.title}
                            </h3>
                            {content}
                          </section>
                        ))}
                      {inactive.length > 0 && (
                        <details
                          open={hasError}
                          className="admin-config-group rounded-xl border border-dashed p-4"
                        >
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            {group.title} · 当前服务未使用，保留备用值
                            {hasError && (
                              <Badge variant="destructive">需要修正</Badge>
                            )}
                          </summary>
                          <div className="mt-4">{renderFields(inactive)}</div>
                        </details>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>
      <SettingsScenario section={section} panel={tab} config={config} />
      {!embedded && (
        <section
          aria-label="关联设置"
          className="rounded-2xl border p-4 sm:p-5"
        >
          <h3 className="text-sm font-semibold">一起决定体验的设置</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            在这里直接调整，合入当前草稿，最后一起保存、核对并发布。
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {journey.related.map(item => (
              <button
                key={item.section + item.task}
                type="button"
                disabled={disabled || !rootSchema}
                onClick={() => {
                  setRelatedViews(old => ({
                    ...old,
                    [item.section]: {
                      ...(old[item.section] ?? createSettingsView()),
                      task: item.task,
                    },
                  }));
                  setRelated(item);
                }}
                className="rounded-xl border p-4 text-left hover:border-primary/40 disabled:opacity-50"
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {item.label}
                  <ArrowUpRight className="size-4 shrink-0" />
                </span>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                  {item.why}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="rounded-xl bg-muted/25 p-4 text-xs leading-6 text-muted-foreground">
        <strong className="text-foreground">发布后影响谁、何时生效：</strong>
        {journey.scope}
      </p>
      <details className="admin-config-group rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          展开完整展示预览
        </summary>
        <div className="mt-4">
          <SettingsPreview config={config} section={section} panel={tab} />
        </div>
      </details>
      {related && (
        <Dialog
          open
          onOpenChange={open => {
            if (!open && !disabled) setRelated(null);
          }}
        >
          <DialogContent
            className="sm:max-w-5xl"
            showCloseButton={!disabled}
            onEscapeKeyDown={event => {
              if (disabled) event.preventDefault();
            }}
            onInteractOutside={event => {
              if (disabled) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>{related.label}</DialogTitle>
              <DialogDescription>
                {related.why} 修改会合入当前未保存的草稿，关闭后可继续原任务。
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[65dvh] min-w-0 overflow-y-auto p-1">
              <SettingsEditor
                key={related.section}
                embedded
                section={related.section}
                config={config}
                schema={rootSchema?.properties?.[related.section]}
                rootSchema={rootSchema}
                issues={issues}
                disabled={disabled}
                onChange={onChange}
                view={
                  relatedViews[related.section] ?? {
                    ...createSettingsView(),
                    task: related.task,
                  }
                }
                onViewChange={next =>
                  setRelatedViews(old => ({ ...old, [related.section]: next }))
                }
              />
            </div>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => setRelated(null)}
            >
              完成，回到当前任务
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
