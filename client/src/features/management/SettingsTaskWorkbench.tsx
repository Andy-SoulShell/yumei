/** 任务先浏览对象与当前内容，再打开一个对象的编辑器。 */
import { useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ExperienceEditor } from "./ProductExperience";
import { SettingsFields } from "./SettingsFields";
import { RewardRuleEditor } from "./RewardRuleEditor";
import { MemoryCapacityEditor } from "./MemoryCapacityEditor";
import { PlaybackSpeedsEditor } from "./PlaybackSpeedsEditor";
import {
  getSetting,
  setSetting,
  settingSchema,
  type SettingsNavigation,
  type SettingsSection,
} from "./settingsModel";
import {
  taskCollections,
  taskEntrySummary,
  type TaskEntry,
} from "./settingsTaskEntries";
import type { FormSchema } from "./ConfigForm";

export function SettingsTaskWorkbench({
  section,
  task,
  title,
  description,
  entries,
  item,
  busy,
  dirty,
  error,
  config,
  rootSchema,
  issues,
  onChange,
  onSave,
  onOpen,
  onBack,
  onCloseItem,
  view,
  onViewChange,
}: {
  section: SettingsSection;
  task: string;
  title: string;
  description: string;
  entries: TaskEntry[];
  item?: string;
  busy: boolean;
  dirty: boolean;
  error: string;
  config: ProductConfig;
  rootSchema: FormSchema;
  issues: Record<string, string>;
  onChange: (config: ProductConfig) => void;
  onSave: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
  onCloseItem: () => void;
} & SettingsNavigation) {
  const [search, setSearch] = useState("");
  const selected = item
    ? entries.find(entry => entry.id === item)
    : entries.length === 1
      ? entries[0]
      : undefined;
  const schema = rootSchema.properties?.[section];
  const update = (next: unknown) => onChange({ ...config, [section]: next });
  const close = item ? onCloseItem : onBack;
  const collections = taskCollections(section, task);
  return (
    <div className="space-y-6" data-admin-workbench={section}>
      <Button variant="ghost" disabled={busy} onClick={onBack}>
        <ArrowLeft className="size-4" />
        返回体验概览
      </Button>
      <div className="admin-experience-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Badge variant="outline">{entries.length} 项内容</Badge>
      </div>
      {collections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {collections.map(path => {
            const values = getSetting(config[section], path) as Record<
              string,
              unknown
            >[];
            const last = values.at(-1);
            const stages = path.includes("relationshipStages");
            const maximum = stages
              ? config.intimacy.levels.length
              : config.characters.limits.exampleCount;
            const label = stages
              ? path.endsWith("gradual")
                ? "循序渐进阶段"
                : "自然相处阶段"
              : "示例对话";
            return (
              <Button
                key={path}
                variant="outline"
                disabled={
                  busy ||
                  values.length >=
                    (settingSchema(schema, path)?.maxItems ?? maximum) ||
                  (stages && Number(last?.minLevel ?? 0) >= maximum) ||
                  (!stages && values.length >= maximum)
                }
                onClick={() => {
                  const value = stages
                    ? {
                        ...structuredClone(last),
                        minLevel: Number(last?.minLevel ?? 0) + 1,
                      }
                    : { user: "你好", assistant: "很高兴见到你。" };
                  update(setSetting(config[section], path, [...values, value]));
                  onOpen(`${path}.${values.length}`);
                }}
              >
                <Plus className="size-4" />
                添加{label}
              </Button>
            );
          })}
        </div>
      )}
      {entries.length > 8 && (
        <div className="relative">
          <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="查找任务内容"
            placeholder="按名称或当前内容查找"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="admin-workbench-grid">
        {entries
          .filter(entry =>
            `${entry.title} ${taskEntrySummary(entry, section, config)}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())
          )
          .map(entry => (
            <Button
              variant="plain"
              size="none"
              key={entry.id}
              className="admin-workbench-card"
              aria-label={`编辑${entry.title}`}
              disabled={busy}
              onClick={() => onOpen(entry.id)}
            >
              <span className="flex items-start justify-between gap-3">
                <strong className="text-sm leading-6">{entry.title}</strong>
                <Pencil className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </span>
              {entry.advanced && (
                <Badge variant="outline" className="mt-2 w-fit">
                  进阶设置
                </Badge>
              )}
              <span className="mt-3 line-clamp-3 block whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {taskEntrySummary(entry, section, config)}
              </span>
            </Button>
          ))}
      </div>
      {!entries.some(entry =>
        `${entry.title} ${taskEntrySummary(entry, section, config)}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      ) && (
        <p role="status" className="admin-empty">
          没有找到相关内容，换个关键词试试。
        </p>
      )}
      {item && !selected && (
        <div className="admin-empty">
          <p>这项内容已经变动，请重新选择。</p>
          <Button variant="outline" onClick={onCloseItem}>
            返回内容目录
          </Button>
        </div>
      )}
      {selected && (
        <ExperienceEditor
          title={selected.title}
          description={selected.description}
          busy={busy}
          dirty={dirty}
          invalid={Object.keys(issues).length > 0}
          error={error}
          onClose={close}
          onSave={onSave}
        >
          {selected.kind === "reward" ? (
            <RewardRuleEditor
              action={selected.key!}
              value={
                getSetting(
                  config.intimacy.rules,
                  selected.key!
                ) as ProductConfig["intimacy"]["rules"][keyof ProductConfig["intimacy"]["rules"]]
              }
              schema={schema?.properties?.rules?.properties?.[selected.key!]}
              config={config}
              path={`intimacy.rules.${selected.key}`}
              issues={issues}
              disabled={busy}
              onChange={next =>
                update(
                  setSetting(config[section], `rules.${selected.key}`, next)
                )
              }
            />
          ) : selected.kind === "capacity" ? (
            <MemoryCapacityEditor
              focused
              value={config.memory.levelRules}
              schema={schema?.properties?.levelRules}
              config={config}
              issues={issues}
              disabled={busy}
              onChange={next =>
                update(setSetting(config[section], "levelRules", next))
              }
              view={{
                ...view,
                selections: {
                  ...view.selections,
                  "memory.capacityLevel": String(selected.level),
                },
              }}
              onViewChange={onViewChange}
            />
          ) : section === "experience" &&
            selected.fields.includes("playback.speeds") ? (
            <PlaybackSpeedsEditor
              value={config.experience.playback}
              schema={schema?.properties?.playback}
              disabled={busy}
              onChange={playback =>
                onChange({
                  ...config,
                  experience: { ...config.experience, playback },
                })
              }
            />
          ) : (
            <SettingsFields
              value={config[section]}
              schema={schema}
              fields={selected.fields}
              path={section}
              config={config}
              issues={issues}
              disabled={busy}
              onChange={update}
              view={view}
              onViewChange={onViewChange}
            />
          )}
          {selected.arrayPath && (
            <Button
              variant="ghost"
              className="mt-6"
              disabled={
                busy ||
                (selected.arrayPath.includes("relationshipStages") &&
                  selected.index === 0)
              }
              onClick={() => {
                const array = getSetting(
                  config[section],
                  selected.arrayPath!
                ) as unknown[];
                update(
                  setSetting(
                    config[section],
                    selected.arrayPath!,
                    array.filter((_, index) => index !== selected.index)
                  )
                );
                close();
              }}
            >
              <Trash2 className="size-4" />
              移除此条内容
            </Button>
          )}
        </ExperienceEditor>
      )}
    </div>
  );
}
