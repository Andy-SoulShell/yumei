/** 主题选取、明暗预览和字段编辑共享当前草稿。 */
import { useId, useState } from "react";
import { Check, Plus, Sun, Moon, Trash2 } from "lucide-react";
import type { ThemesConfig } from "@shared/productConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { isHexColor } from "./ColorField";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
type Theme = ThemesConfig["items"][number];
const title = (value: Theme) => value.name["zh-CN"] || value.id;
function ThemePreview({
  theme,
  mode,
}: {
  theme: Theme;
  mode: "light" | "dark";
}) {
  const primary = theme[mode],
    background = theme.background[mode];
  if (!isHexColor(primary) || !isHexColor(background)) return null;
  return (
    <div
      className="overflow-hidden rounded-2xl border p-4 sm:p-5"
      style={{
        background,
        color: `oklch(${mode === "dark" ? "0.93 0.01" : "0.235 0.015"} ${theme.hue})`,
      }}
    >
      <div className="mb-5 flex items-center justify-between text-xs opacity-70">
        <span className="flex items-center gap-1.5">
          {mode === "light" ? (
            <Sun className="size-3.5" />
          ) : (
            <Moon className="size-3.5" />
          )}
          {mode === "light" ? "浅色预览" : "深色预览"}
        </span>
        <span>YUMEI</span>
      </div>
      <div className="flex gap-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          style={{
            background: `color-mix(in srgb, ${primary} 15%, transparent)`,
            color: primary,
          }}
        >
          Y
        </span>
        <div
          className="rounded-2xl rounded-tl-sm p-3 text-xs"
          style={{
            background:
              mode === "light"
                ? "#ffffff"
                : "color-mix(in srgb, white 7%, transparent)",
          }}
        >
          今天过得怎么样？
        </div>
      </div>
      <div
        className="ml-10 mt-3 rounded-2xl rounded-tr-sm p-3 text-xs"
        style={{
          background: primary,
          color: mode === "dark" ? theme.foreground : "#ffffff",
        }}
      >
        想和你分享一些开心的事。
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-current/10 p-3">
        <span className="text-xs opacity-50">说点什么…</span>
        <span
          className="rounded-lg px-3 py-1.5 text-xs"
          style={{
            background: primary,
            color: mode === "dark" ? theme.foreground : "#ffffff",
          }}
        >
          发送
        </span>
      </div>
    </div>
  );
}
export function ThemeEditor({
  value,
  schema,
  onChange,
  disabled,
  issues,
}: {
  value: ThemesConfig;
  schema?: FormSchema;
  onChange: (value: ThemesConfig) => void;
  disabled: boolean;
  issues?: Record<string, string>;
}) {
  const [index, setIndex] = useState(0),
    id = useId();
  const selected = value.items[Math.min(index, value.items.length - 1)];
  if (!selected)
    return (
      <p className="text-sm text-muted-foreground">
        主题列表无效，请在 JSON 中修正。
      </p>
    );
  const add = () => {
    const item = {
      ...structuredClone(selected),
      id: `theme-${crypto.randomUUID().slice(0, 8)}`,
      name: { "zh-CN": "新主题" },
      enabled: true,
    };
    onChange({ ...value, items: [...value.items, item] });
    setIndex(value.items.length);
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">主题库</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            选择主题后编辑，预览会随草稿实时更新。
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || value.items.length >= 100}
          onClick={add}
        >
          <Plus className="size-3.5" />
          新建主题
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {value.items.map((item, i) => (
          <button
            type="button"
            key={i}
            disabled={disabled}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            className={`relative rounded-2xl border p-3 text-left transition-colors ${i === index ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background hover:border-primary/40"}`}
          >
            <span className="mb-3 flex h-12 overflow-hidden rounded-xl">
              {item.colors.map((color, j) => (
                <span
                  key={j}
                  className="flex-1"
                  style={{ background: isHexColor(color) ? color : undefined }}
                />
              ))}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {title(item)}
              </span>
              {i === index && (
                <Check className="size-3.5 shrink-0 text-primary" />
              )}
            </span>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {item.id === value.defaultThemeId
                ? "默认主题"
                : item.enabled
                  ? "已启用"
                  : "已停用"}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{title(selected)}</h2>
          {selected.id === value.defaultThemeId && (
            <Badge variant="secondary">默认</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={
              disabled ||
              !selected.enabled ||
              selected.id === value.defaultThemeId
            }
            onClick={() => onChange({ ...value, defaultThemeId: selected.id })}
          >
            设为默认
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              disabled ||
              selected.id === value.defaultThemeId ||
              value.items.length <= 1
            }
            onClick={() => {
              onChange({
                ...value,
                items: value.items.filter((_, i) => i !== index),
              });
              setIndex(Math.max(0, index - 1));
            }}
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" aria-label="主题明暗预览">
        <ThemePreview theme={selected} mode="light" />
        <ThemePreview theme={selected} mode="dark" />
      </div>
      <p className="text-xs text-muted-foreground">
        主题标识 {selected.id} 保持不变；颜色、文案和启用状态按当前草稿编辑。
      </p>
      <Tabs defaultValue="appearance">
        <TabsList aria-label="主题编辑分区">
          <TabsTrigger value="appearance" disabled={disabled}>
            配色与外观
          </TabsTrigger>
          <TabsTrigger value="copy" disabled={disabled}>
            名称与文案
          </TabsTrigger>
        </TabsList>
        {[
          {
            id: "appearance",
            fields: [
              "hue",
              "colors",
              "light",
              "dark",
              "background",
              "foreground",
            ],
          },
          { id: "copy", fields: ["name", "description", "enabled"] },
        ].map(tab => (
          <TabsContent key={tab.id} value={tab.id}>
            <ConfigForm
              key={id + index}
              flat
              value={Object.fromEntries(
                Object.entries(selected).filter(([key]) =>
                  tab.fields.includes(key)
                )
              )}
              path={`themes.items.${index}`}
              schema={{
                ...schema?.properties?.items?.items,
                properties: Object.fromEntries(
                  Object.entries(
                    schema?.properties?.items?.items?.properties ?? {}
                  ).filter(([key]) => tab.fields.includes(key))
                ),
              }}
              disabled={disabled}
              issues={issues}
              onChange={next => {
                const item = { ...selected, ...(next as Partial<Theme>) };
                onChange({
                  ...value,
                  defaultThemeId:
                    selected.id === value.defaultThemeId
                      ? item.id
                      : value.defaultThemeId,
                  items: value.items.map((old, i) =>
                    i === index ? item : old
                  ),
                });
              }}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
