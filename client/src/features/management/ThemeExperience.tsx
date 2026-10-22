/** 一个主题是可阅读的外观作品，文案、强调色、画布与色卡分别打磨。 */
import type { ProductConfig } from "@shared/productConfig";
import { contentText } from "@shared/discovery";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { ThemePreview } from "./ThemeEditor";
import { ExperienceEditor } from "./ProductExperience";
import type { useExperienceRoute } from "./managementRoutes";
const parts = [
  {
    id: "copy",
    title: "名称与开放状态",
    fields: ["name", "description", "enabled"],
    description: "用户会看到的主题名称、介绍与开放状态。",
  },
  {
    id: "accent",
    title: "明暗强调色",
    fields: ["light", "dark", "hue"],
    description: "分别调整浅色、深色的主色和整体色相。",
  },
  {
    id: "canvas",
    title: "画布与文字",
    fields: ["background", "foreground"],
    description: "调整主题的背景与文字配色。",
  },
  {
    id: "palette",
    title: "预览色卡",
    fields: ["colors"],
    description: "整理用户选择主题时看到的色卡。",
  },
];
export function ThemeExperience({
  value,
  schema,
  route,
  busy,
  dirty,
  error,
  issues,
  onChange,
  onSave,
}: {
  value: ProductConfig["themes"];
  schema?: FormSchema;
  route: ReturnType<typeof useExperienceRoute>;
  busy: boolean;
  dirty: boolean;
  error: string;
  issues: Record<string, string>;
  onChange: (value: ProductConfig["themes"]) => void;
  onSave: () => void;
}) {
  const index = value.items.findIndex(theme => theme.id === route.item),
    theme = value.items[index];
  if (!theme)
    return (
      <div className="admin-empty">
        <p>没有找到这个主题，请重新选择。</p>
        <Button variant="outline" onClick={route.close}>
          返回主题库
        </Button>
      </div>
    );
  const part = parts.find(item => item.id === route.part);
  return (
    <div className="space-y-6">
      <Button variant="ghost" disabled={busy} onClick={route.close}>
        <ArrowLeft className="size-4" />
        返回主题库
      </Button>
      <div className="admin-experience-heading">
        <div>
          <h2>{contentText(theme.name, "zh-CN")}</h2>
          <p>{contentText(theme.description, "zh-CN")}</p>
        </div>
        <Badge variant="secondary">
          {theme.id === value.defaultThemeId
            ? "默认外观"
            : theme.enabled
              ? "用户可选"
              : "尚未开放"}
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2" aria-label="主题明暗预览">
        <ThemePreview theme={theme} mode="light" />
        <ThemePreview theme={theme} mode="dark" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || !theme.enabled || theme.id === value.defaultThemeId}
          onClick={() => onChange({ ...value, defaultThemeId: theme.id })}
        >
          设为默认
        </Button>
        <Button
          variant="ghost"
          disabled={
            busy || theme.id === value.defaultThemeId || value.items.length <= 1
          }
          onClick={() => {
            onChange({
              ...value,
              items: value.items.filter(item => item.id !== theme.id),
            });
            route.close();
          }}
        >
          <Trash2 className="size-4" />
          删除这个主题
        </Button>
      </div>
      <div className="admin-workbench-grid">
        {parts.map(item => (
          <Button
            key={item.id}
            variant="plain"
            size="none"
            className="admin-workbench-card"
            aria-label={`编辑${item.title}`}
            disabled={busy}
            onClick={() => route.open(route.editing!, theme.id, item.id)}
          >
            <span className="flex items-center justify-between gap-3">
              <strong>{item.title}</strong>
              <Pencil className="size-4" />
            </span>
            <span className="mt-3 text-sm leading-6 text-muted-foreground">
              {item.description}
            </span>
          </Button>
        ))}
      </div>
      {part && (
        <ExperienceEditor
          title={part.title}
          description={part.description}
          busy={busy}
          dirty={dirty}
          error={error}
          invalid={Object.keys(issues).length > 0}
          onSave={onSave}
          onClose={route.closePart}
        >
          <ConfigForm
            flat
            key={theme.id + part.id}
            value={Object.fromEntries(
              part.fields.map(field => [
                field,
                theme[field as keyof typeof theme],
              ])
            )}
            schema={{
              ...schema?.properties?.items?.items,
              properties: Object.fromEntries(
                part.fields.map(field => [
                  field,
                  schema?.properties?.items?.items?.properties?.[field] ?? {},
                ])
              ),
            }}
            path={`themes.items.${index}`}
            issues={issues}
            disabled={busy}
            onChange={next =>
              onChange({
                ...value,
                items: value.items.map(item =>
                  item.id === theme.id
                    ? { ...item, ...(next as Partial<typeof theme>) }
                    : item
                ),
              })
            }
          />
        </ExperienceEditor>
      )}
      {route.part && !part && (
        <p role="status">没有找到这项主题内容，请重新选择。</p>
      )}
    </div>
  );
}
