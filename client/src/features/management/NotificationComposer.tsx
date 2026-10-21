/** 标题和正文以实际发送场景配对编辑；预览与站内/外推使用同一插值函数。 */
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import type { Locale } from "@shared/locales";
import { renderNotification } from "@shared/notifications";
import { contentText, type ContentText } from "@shared/discovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import type { SettingsNavigation } from "./settingsModel";

export const notificationScenes = [
  { id: "daily", name: "日常陪伴", body: "notifications:dailyCompanion" },
  { id: "upcoming", name: "事件即将到来", body: "notifications:eventUpcoming" },
  { id: "today", name: "事件当天", body: "notifications:eventToday" },
  { id: "followup", name: "事后关心", body: "notifications:eventFollowUp" },
  { id: "private", name: "隐藏通知内容", body: "notifications:privatePreview" },
] as const;
const normalTitle = "notifications:title.thinkingOfYou",
  privateTitle = "notifications:privateTitle";
const languages: { id: Locale; name: string }[] = [
  { id: "zh-CN", name: "简体中文" },
  { id: "en", name: "English" },
  { id: "ja", name: "日本語" },
  { id: "ko", name: "한국어" },
];
export function NotificationComposer({
  config,
  disabled,
  issues,
  onChange,
  view,
  onViewChange,
}: {
  config: ProductConfig;
  disabled: boolean;
  issues: Record<string, string>;
  onChange: (config: ProductConfig) => void;
} & SettingsNavigation) {
  const [editing, setEditing] = useState<string | null>(null),
    [sampleName, setSampleName] = useState("葵"),
    [sampleMemory, setSampleMemory] = useState("一场重要的面试");
  const id = useId(),
    titleInput = useRef<HTMLInputElement>(null),
    bodyInput = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<{
    element: HTMLInputElement | HTMLTextAreaElement;
    position: number;
  } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (pending?.element.isConnected) {
      pending.element.focus();
      pending.element.setSelectionRange(pending.position, pending.position);
    }
    pendingCaret.current = null;
  }, [config.proactive.templates]);
  const locale =
    languages.find(item => item.id === view.selections["notifications.locale"])
      ?.id ?? "zh-CN";
  const scene = notificationScenes.find(item => item.id === editing),
    privateScene = scene?.id === "private";
  const titleKey = scene
    ? privateScene
      ? privateTitle
      : normalTitle
    : editing;
  const bodyKey = scene?.body;
  const templates = config.proactive.templates;
  const ownedKeys = new Set<string>([
    normalTitle,
    privateTitle,
    ...notificationScenes.map(item => item.body),
  ]);
  const extras = Object.keys(templates).filter(key => !ownedKeys.has(key));
  const values = {
    name: sampleName,
    memory: sampleMemory,
    eventDay: "示例事件日期",
  };
  const render = (key: string) =>
    renderNotification(
      config.proactive,
      {
        key,
        values:
          key === normalTitle
            ? { name: sampleName }
            : privateScene
              ? {}
              : values,
      },
      locale
    );
  const write = (key: string, value: string) => {
    const text: ContentText = { ...templates[key] };
    if (locale !== "zh-CN" && !value.trim()) delete text[locale];
    else text[locale] = value;
    onChange({
      ...config,
      proactive: {
        ...config.proactive,
        templates: { ...templates, [key]: text },
      },
    });
  };
  const insert = (
    key: string,
    variable: string,
    element: HTMLInputElement | HTMLTextAreaElement | null
  ) => {
    const current = templates[key]?.[locale] ?? "",
      start = element?.selectionStart ?? current.length,
      end = element?.selectionEnd ?? start;
    if (element)
      pendingCaret.current = { element, position: start + variable.length + 4 };
    write(
      key,
      current.slice(0, start) + `{{${variable}}}` + current.slice(end)
    );
  };
  const editor = (key: string, title: boolean) => {
    const value = templates[key]?.[locale] ?? "",
      privateKey =
        key === privateTitle || key === "notifications:privatePreview";
    const allowed = privateKey
      ? []
      : key === normalTitle
        ? ["name"]
        : ["name", "memory", "eventDay"];
    const remainder = value.replace(/\{\{(name|memory|eventDay)\}\}/g, "");
    const error =
      issues[`proactive.templates.${key}.${locale}`] ??
      (locale === "zh-CN" && !value.trim()
        ? "请填写简体中文"
        : /\{\{|\}\}/.test(remainder) || (privateKey && /\{\{/.test(value))
          ? "包含此通知不能使用的变量"
          : key === normalTitle && /\{\{(?:memory|eventDay)\}\}/.test(value)
            ? "通知标题仅支持角色名"
            : undefined);
    const label = scene ? (title ? "通知标题" : "通知正文") : "模板内容";
    return (
      <div className="space-y-2">
        <Label htmlFor={`${id}-${title ? "title" : "body"}`}>{label}</Label>
        {title ? (
          <Input
            id={`${id}-title`}
            ref={titleInput}
            aria-label={label}
            disabled={disabled}
            value={value}
            maxLength={6000}
            aria-invalid={!!error}
            placeholder={
              locale === "zh-CN"
                ? "填写通知标题"
                : (templates[key]?.["zh-CN"] ?? "留空回退中文")
            }
            onChange={e => write(key, e.target.value)}
          />
        ) : (
          <Textarea
            id={`${id}-body`}
            ref={bodyInput}
            aria-label={label}
            disabled={disabled}
            rows={5}
            value={value}
            maxLength={6000}
            aria-invalid={!!error}
            placeholder={
              locale === "zh-CN"
                ? "填写通知正文"
                : (templates[key]?.["zh-CN"] ?? "留空回退中文")
            }
            onChange={e => write(key, e.target.value)}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {allowed.map(variable => (
            <Button
              key={variable}
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                insert(
                  key,
                  variable,
                  title ? titleInput.current : bodyInput.current
                )
              }
            >
              插入
              {
                (
                  {
                    name: "角色名",
                    memory: "事件内容",
                    eventDay: "事件日期",
                  } as Record<string, string>
                )[variable]
              }
            </Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {value.length} / 6000
            {locale !== "zh-CN" && !value.trim() ? " · 使用中文" : ""}
          </span>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="status">
            {error}
          </p>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {notificationScenes.map(item => (
          <button
            type="button"
            key={item.id}
            aria-label={`编辑通知：${item.name}`}
            disabled={disabled}
            className="space-y-2 rounded-xl border p-4 text-left hover:border-primary/40"
            onClick={() => setEditing(item.id)}
          >
            <span className="block text-sm font-semibold">{item.name}</span>
            <span className="block line-clamp-1 text-sm">
              {renderNotification(
                config.proactive,
                {
                  key: item.id === "private" ? privateTitle : normalTitle,
                  values: item.id === "private" ? {} : { name: sampleName },
                },
                locale
              )}
            </span>
            <span className="block line-clamp-2 text-xs leading-5 text-muted-foreground">
              {renderNotification(
                config.proactive,
                { key: item.body, values: item.id === "private" ? {} : values },
                locale
              )}
            </span>
          </button>
        ))}
      </div>
      {extras.length > 0 && (
        <details className="admin-config-group rounded-xl border p-4">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            其他通知模板 · {extras.length} 项
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {extras.map(key => (
              <button
                type="button"
                key={key}
                disabled={disabled}
                className="rounded-lg border p-3 text-left text-xs leading-5"
                onClick={() => setEditing(key)}
              >
                {contentText(templates[key], locale)}
              </button>
            ))}
          </div>
        </details>
      )}
      {editing && titleKey && (
        <Dialog
          open
          onOpenChange={open => {
            if (!open && !disabled) setEditing(null);
          }}
        >
          <DialogContent
            className="sm:max-w-4xl"
            showCloseButton={!disabled}
            onEscapeKeyDown={event => {
              if (disabled) event.preventDefault();
            }}
            onInteractOutside={event => {
              if (disabled) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>{scene?.name ?? "编辑通知模板"}</DialogTitle>
              <DialogDescription>
                当前草稿 · 预览不发送通知
                {scene && !privateScene ? " · 标题由普通联系场景共用" : ""}
              </DialogDescription>
            </DialogHeader>
            <RadioGroup
              aria-label="通知编辑语言"
              value={locale}
              disabled={disabled}
              className="flex flex-wrap gap-2"
              onValueChange={next =>
                onViewChange({
                  ...view,
                  selections: {
                    ...view.selections,
                    "notifications.locale": next,
                  },
                })
              }
            >
              {languages.map(item => (
                <RadioGroupChoice
                  key={item.id}
                  value={item.id}
                  variant="segment"
                >
                  {item.name}
                </RadioGroupChoice>
              ))}
            </RadioGroup>
            <div className="grid max-h-[62dvh] min-w-0 gap-5 overflow-y-auto p-1 md:grid-cols-[3fr_2fr]">
              <div className="space-y-5">
                {editor(titleKey, Boolean(scene))}
                {bodyKey && editor(bodyKey, false)}
              </div>
              <div className="space-y-4">
                <div
                  aria-label="这条通知的实际预览"
                  className="space-y-2 rounded-xl border bg-muted/25 p-4"
                >
                  <p className="text-xs text-muted-foreground">
                    YUMEI · 通知示例
                  </p>
                  <p className="break-words text-sm font-semibold">
                    {render(titleKey)}
                  </p>
                  {bodyKey && (
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {render(bodyKey)}
                    </p>
                  )}
                </div>
                {!privateScene && (
                  <div className="space-y-3">
                    <label className="block space-y-2 text-xs font-medium">
                      示例角色名
                      <Input
                        aria-label="示例角色名"
                        value={sampleName}
                        onChange={e => setSampleName(e.target.value)}
                      />
                    </label>
                    {bodyKey && scene?.id !== "daily" && (
                      <label className="block space-y-2 text-xs font-medium">
                        示例事件内容
                        <Input
                          aria-label="示例事件内容"
                          value={sampleMemory}
                          onChange={e => setSampleMemory(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => setEditing(null)}
            >
              完成通知编辑
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
