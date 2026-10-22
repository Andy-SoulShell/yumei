/** 先浏览内容和当前效果，再按具体任务打开就地编辑。 */
import { useEffect, useRef } from "react";
import { useExperienceRoute } from "./managementRoutes";
import {
  ArrowUpRight,
  ArrowLeft,
  Check,
  ChevronRight,
  Palette,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import type { ProductConfig } from "@shared/productConfig";
import { contentText } from "@shared/discovery";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlanLibrary } from "./BillingEditor";
import { SettingsEditor } from "./SettingsEditor";
import { SettingsPreview } from "./SettingsPreview";
import { ThemeEditor, ThemePreview } from "./ThemeEditor";
import {
  collectionName,
  newCollectionItem,
  type CollectionKind,
} from "./SettingsCollection";
import {
  settingsPanels,
  settingSchema,
  type SettingsNavigation,
  type SettingsSection,
} from "./settingsModel";
import { settingsJourneys } from "./settingsRelations";
import type { FormSchema } from "./ConfigForm";
import { SettingsTaskWorkbench } from "./SettingsTaskWorkbench";
import { taskEntries } from "./settingsTaskEntries";
import { ThemeExperience } from "./ThemeExperience";

type Props = SettingsNavigation & {
  section: keyof ProductConfig;
  config: ProductConfig;
  rootSchema: FormSchema;
  issues: Record<string, string>;
  busy: boolean;
  dirty: boolean;
  error: string;
  onChange: (config: ProductConfig) => void;
  onSave: () => void;
};

/** 所有任务编辑器共用完成、保存、忙碌保护和错误反馈。 */
export function ExperienceEditor({
  title,
  description,
  busy,
  dirty,
  invalid,
  error,
  onClose,
  onSave,
  children,
}: {
  title: string;
  description: string;
  busy: boolean;
  dirty: boolean;
  invalid?: boolean;
  error?: string;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="admin-experience-dialog"
        showCloseButton={!busy}
        onEscapeKeyDown={event => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="admin-experience-dialog-body">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-destructive/5 p-4 text-sm text-destructive whitespace-pre-wrap"
            >
              {error}
            </p>
          )}
          {children}
        </div>
        <div className="admin-experience-dialog-footer">
          <p>
            {dirty
              ? "修改已放入当前草稿，保存后可前往发布。"
              : "先调整内容，再保存草稿。"}
          </p>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            返回预览
          </Button>
          <Button disabled={busy || !dirty || invalid} onClick={onSave}>
            {busy ? "正在保存…" : "保存草稿"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 用内容库、预览和任务入口承载管理工作，首页不直接铺开字段。 */
export function ProductExperience(props: Props) {
  const {
    section,
    config,
    rootSchema,
    issues,
    busy,
    dirty,
    error,
    onChange,
    onSave,
    view,
    onViewChange,
  } = props;
  const editorRoute = useExperienceRoute(busy);
  const editing = editorRoute.editing;
  const restoredEditor = useRef("");
  const schema = rootSchema.properties?.[section];
  const panels = section === "themes" ? [] : settingsPanels[section];
  const relatedTasks =
    section === "themes" ? [] : settingsJourneys[section].related;
  const related = relatedTasks.find(
    item => editing === `related.${item.section}.${item.task}`
  );
  const editable =
    section === "themes"
      ? editing === "appearance" || editing === "copy"
      : !!related || panels.some(item => item.id === editing);
  const collectionPanel = panels.find(panel => panel.collection);
  const kind = collectionPanel?.collection;
  const collection = kind
    ? ((config[section] as unknown as Record<string, unknown>)[
        collectionPanel!.fields[0]
      ] as Record<string, unknown>[])
    : [];
  const path = collectionPanel ? `${section}.${collectionPanel.fields[0]}` : "";
  const open = (task: string, id?: string) => {
    onViewChange({
      ...view,
      task,
      selections: id
        ? { ...view.selections, [section === "themes" ? "themes" : path]: id }
        : view.selections,
    });
    editorRoute.open(task, id);
  };
  useEffect(() => {
    if (!editing) {
      restoredEditor.current = "";
      return;
    }
    const routeKey = `${editing}:${editorRoute.item ?? ""}`;
    if (restoredEditor.current === routeKey) return;
    restoredEditor.current = routeKey;
    const key =
      related?.section === "intimacy"
        ? "intimacy.levels"
        : related?.section === "memory"
          ? "memory.capacityLevel"
          : section === "themes"
            ? "themes"
            : path;
    if (
      view.task !== editing ||
      (editorRoute.item && view.selections[key] !== editorRoute.item)
    )
      onViewChange({
        ...view,
        task: editing,
        selections: editorRoute.item
          ? { ...view.selections, [key]: editorRoute.item }
          : view.selections,
      });
  }, [editing, editorRoute.item, section, path, view, onViewChange, related]);
  const selected =
    section === "themes"
      ? config.themes.items.find(item => item.id === view.selections.themes)
      : collection.find(
          item => String(item.id ?? item.level) === view.selections[path]
        );
  const selectedName = selected
    ? section === "themes"
      ? contentText(
          (selected as ProductConfig["themes"]["items"][number]).name,
          "zh-CN"
        )
      : collectionName(selected)
    : "";
  const task = panels.find(item => item.id === editing);
  const addCollection = () => {
    const item = newCollectionItem(
      kind!,
      collection,
      collection.find(
        item => String(item.id ?? item.level) === view.selections[path]
      ) ?? collection[0]
    );
    onChange({
      ...config,
      [section]: {
        ...config[section],
        [collectionPanel!.fields[0]]: [...collection, item],
      },
    });
    open(collectionPanel!.id, String(item.id ?? item.level));
  };
  const collectionTitle: Partial<Record<CollectionKind, string>> = {
    poses: "自拍姿势",
    levels: "关系阶段",
    quickTemplates: "快捷表达",
  };
  const workbenchSection = related?.section ?? section;
  const workbenchTask = related?.task ?? editing;
  if (section === "themes" && editing)
    return (
      <ThemeExperience
        value={config.themes}
        schema={schema}
        route={editorRoute}
        busy={busy}
        dirty={dirty}
        error={error}
        issues={issues}
        onSave={onSave}
        onChange={themes => onChange({ ...config, themes })}
      />
    );
  const entries =
    workbenchSection !== "themes" && workbenchTask
      ? taskEntries(
          workbenchSection,
          workbenchTask,
          config,
          rootSchema.properties?.[workbenchSection]
        )
      : undefined;
  if (editing && entries)
    return (
      <SettingsTaskWorkbench
        key={editing}
        section={workbenchSection as SettingsSection}
        task={workbenchTask!}
        title={related?.label ?? task!.title}
        description={related?.why ?? task!.description}
        entries={entries}
        item={editorRoute.item}
        busy={busy}
        dirty={dirty}
        error={error}
        config={config}
        rootSchema={rootSchema}
        issues={issues}
        onChange={onChange}
        onSave={onSave}
        view={view}
        onViewChange={onViewChange}
        onOpen={id => editorRoute.open(editing, id)}
        onBack={editorRoute.close}
        onCloseItem={editorRoute.closeItem}
      />
    );
  const fullPageTask =
    (workbenchSection === "billing" &&
      ["subscription", "plans"].includes(workbenchTask ?? "")) ||
    (workbenchSection === "proactive" &&
      ["schedule", "copy"].includes(workbenchTask ?? ""));
  if (editing && fullPageTask)
    return (
      <div className="space-y-6">
        <Button variant="ghost" disabled={busy} onClick={editorRoute.close}>
          <ArrowLeft className="size-4" />
          返回体验概览
        </Button>
        <div className="admin-experience-heading">
          <div>
            <h2>{related?.label ?? task?.title}</h2>
            <p>{related?.why ?? task?.description}</p>
          </div>
        </div>
        <SettingsEditor
          focused
          embedded
          section={workbenchSection as SettingsSection}
          config={config}
          schema={rootSchema.properties?.[workbenchSection]}
          rootSchema={rootSchema}
          issues={issues}
          disabled={busy}
          onChange={onChange}
          view={{ ...view, task: workbenchTask }}
          onViewChange={onViewChange}
        />
      </div>
    );
  return (
    <div className="admin-product-experience space-y-8">
      {section === "themes" ? (
        <>
          <div className="admin-experience-heading">
            <div>
              <h2>让每一次打开，都有喜欢的氛围</h2>
              <p>选一种配色看看效果，再决定让哪些主题与用户见面。</p>
            </div>
            <Button
              variant="outline"
              disabled={busy || config.themes.items.length >= 100}
              onClick={() => {
                const source = config.themes.items[0];
                const theme = {
                  ...structuredClone(source),
                  id: `theme-${crypto.randomUUID().slice(0, 8)}`,
                  name: { "zh-CN": "新的主题" },
                  enabled: false,
                };
                onChange({
                  ...config,
                  themes: {
                    ...config.themes,
                    items: [...config.themes.items, theme],
                  },
                });
                open("appearance", theme.id);
              }}
            >
              <Plus className="size-4" />
              新建主题
            </Button>
          </div>
          <div className="admin-theme-gallery">
            {config.themes.items.map(theme => (
              <article className="admin-theme-tile" key={theme.id}>
                <Button
                  variant="plain"
                  size="none"
                  className="block w-full text-left"
                  disabled={busy}
                  onClick={() => open("appearance", theme.id)}
                  aria-label={`编辑主题 ${contentText(theme.name, "zh-CN")}`}
                >
                  <ThemePreview theme={theme} mode="light" />
                  <span className="flex items-center justify-between gap-3 p-4">
                    <span>
                      <strong className="block">
                        {contentText(theme.name, "zh-CN")}
                      </strong>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {contentText(theme.description, "zh-CN")}
                      </span>
                    </span>
                    <Pencil className="size-4 shrink-0 text-muted-foreground" />
                  </span>
                </Button>
                <div className="flex items-center justify-between gap-3 px-4 pb-4">
                  <Badge variant="secondary">
                    {theme.id === config.themes.defaultThemeId
                      ? "默认外观"
                      : theme.enabled
                        ? "用户可选"
                        : "尚未开放"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      busy ||
                      !theme.enabled ||
                      theme.id === config.themes.defaultThemeId
                    }
                    onClick={() =>
                      onChange({
                        ...config,
                        themes: { ...config.themes, defaultThemeId: theme.id },
                      })
                    }
                  >
                    {theme.id === config.themes.defaultThemeId ? (
                      <>
                        <Check className="size-3.5" />
                        已设为默认
                      </>
                    ) : (
                      "设为默认"
                    )}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="admin-experience-heading">
            <div>
              <h2>{settingsJourneys[section].goal}</h2>
              <p>先看当前效果，选择想改善的部分。</p>
            </div>
            {section !== "billing" && !kind && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => open(panels[0].id)}
              >
                调整{panels[0].title}
                <Pencil className="size-3.5" />
              </Button>
            )}
          </div>
          {section === "billing" ? (
            <>
              <div className="admin-experience-banner">
                <div>
                  <span className="admin-experience-icon">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <strong>
                      {config.billing.mode === "none"
                        ? "自由使用，不限额度"
                        : config.billing.mode === "free"
                          ? "免费开始陪伴"
                          : "按订阅享受陪伴"}
                    </strong>
                    <p>套餐内容、价格和权益在下方卡片中预览与编辑。</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => open("subscription")}
                >
                  服务方式
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <PlanLibrary
                config={config}
                schema={schema}
                issues={issues}
                disabled={busy}
                onChange={onChange}
                view={view}
                onViewChange={onViewChange}
                showSetup={false}
              />
            </>
          ) : kind ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">
                  {collectionTitle[kind] ?? "内容库"}
                </h3>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    collection.length >=
                      (settingSchema(schema, collectionPanel!.fields[0])
                        ?.maxItems ?? 100)
                  }
                  onClick={addCollection}
                >
                  <Plus className="size-4" />
                  {kind === "levels"
                    ? "添加下一阶段"
                    : kind === "poses"
                      ? "新增姿势"
                      : "新增快捷表达"}
                </Button>
              </div>
              <div
                className={
                  kind === "levels"
                    ? "admin-stage-gallery"
                    : "admin-content-gallery"
                }
              >
                {collection.map((item, index) => (
                  <Button
                    key={String(item.id ?? item.level)}
                    variant="plain"
                    size="none"
                    disabled={busy}
                    className="admin-content-tile"
                    onClick={() =>
                      open(collectionPanel!.id, String(item.id ?? item.level))
                    }
                    aria-label={`编辑${collectionName(item)}`}
                  >
                    <span className="admin-content-emoji">
                      {String(
                        item.emoji ?? (kind === "quickTemplates" ? "✎" : "♡")
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block">{collectionName(item)}</strong>
                      <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                        {kind === "levels"
                          ? `第 ${item.level} 级 · ${item.requiredPoints} 分开启`
                          : kind === "poses"
                            ? `${item.minLevel} 级解锁 · ${item.enabled ? "已开放" : "未开放"}`
                            : contentText(
                                item.text as Record<string, string>,
                                "zh-CN"
                              ) || "添加一段用户可以选择的表达"}
                      </span>
                    </span>
                    <span className="admin-content-order">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                  </Button>
                ))}
              </div>
              {section === "intimacy" && (
                <SettingsPreview
                  overview
                  onEdit={open}
                  config={config}
                  section={section}
                  panel="levels"
                />
              )}
            </>
          ) : (
            <SettingsPreview
              overview
              onEdit={open}
              config={config}
              section={section}
              panel={panels[0].id}
            />
          )}
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                {kind || section === "billing"
                  ? "继续打磨体验"
                  : "想调整哪一部分？"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                每次聚焦一件事，修改后回到这里看效果。
              </p>
            </div>
            <div className="admin-task-gallery">
              {panels
                .filter(
                  item =>
                    !item.collection &&
                    !(section === "billing" && item.id === "plans")
                )
                .map((item, index) => (
                  <Button
                    key={item.id}
                    variant="plain"
                    size="none"
                    className="admin-task-tile"
                    disabled={busy}
                    onClick={() => open(item.id)}
                    aria-label={`编辑${item.title}`}
                  >
                    <span className="admin-task-tile-icon">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong>{item.title}</strong>
                      <span className="mt-2 block text-xs leading-6 text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Button>
                ))}
            </div>
          </section>
        </>
      )}
      {relatedTasks.length > 0 && (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">也可以一起调整</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              相关体验在这里接着打磨，修改一起留在当前草稿。
            </p>
          </div>
          <div className="admin-task-gallery">
            {relatedTasks.map(item => (
              <Button
                key={item.section + item.task}
                variant="plain"
                size="none"
                className="admin-task-tile"
                disabled={busy}
                onClick={() =>
                  editorRoute.open(
                    `related.${item.section}.${item.task}`,
                    ["intimacy", "memory"].includes(item.section)
                      ? (view.selections["intimacy.levels"] ??
                          view.selections["memory.capacityLevel"] ??
                          "1")
                      : undefined
                  )
                }
              >
                <span className="min-w-0 flex-1">
                  <strong>{item.label}</strong>
                  <span className="mt-2 block text-xs leading-6 text-muted-foreground">
                    {item.why}
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </section>
      )}
      {editing && editable && (
        <ExperienceEditor
          title={
            related?.label ??
            (selectedName && (task?.collection || section === "themes")
              ? `编辑${selectedName}`
              : (task?.title ?? "选择外观"))
          }
          description={
            related?.why ??
            task?.description ??
            "搭配颜色、文案与明暗效果，让用户选到喜欢的氛围。"
          }
          busy={busy}
          dirty={dirty}
          invalid={Object.keys(issues).length > 0}
          error={error}
          onClose={editorRoute.close}
          onSave={onSave}
        >
          {section === "themes" ? (
            <ThemeEditor
              focused
              value={config.themes}
              schema={schema}
              disabled={busy}
              issues={issues}
              view={view}
              onViewChange={onViewChange}
              onChange={themes => onChange({ ...config, themes })}
            />
          ) : (
            <SettingsEditor
              focused
              embedded
              section={related?.section ?? (section as SettingsSection)}
              config={config}
              schema={
                related ? rootSchema.properties?.[related.section] : schema
              }
              rootSchema={rootSchema}
              issues={issues}
              disabled={busy}
              onChange={onChange}
              view={related ? { ...view, task: related.task } : view}
              onViewChange={onViewChange}
            />
          )}
        </ExperienceEditor>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Palette className="size-3.5" />
        预览来自当前草稿，保存并发布后才会展示给用户。
      </p>
    </div>
  );
}
