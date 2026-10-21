/** 围绕角色内容组织常用字段，其余设置按需展开。 */
import { useId, type ChangeEvent, type ReactNode } from "react";
import type { OfficialCharacter, ContentText } from "@shared/discovery";
import {
  officialImageSchema,
  officialCharacterSchema,
} from "@shared/discovery";
import { companionBehaviorSchema } from "@shared/companionBehavior";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { officialFieldNames, type CharacterRules } from "./officialEditor";
import { uploadDescription } from "@shared/operationalConfig";
import type { ProductConfig } from "@shared/productConfig";
import { NumberField } from "./NumberField";

const behaviorForm = z.toJSONSchema(companionBehaviorSchema) as FormSchema;
const numberSchemas = (z.toJSONSchema(officialCharacterSchema) as FormSchema)
  .properties!;
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p
        id={`${id}-help`}
        className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        aria-live="polite"
      >
        {error || hint}
      </p>
    </div>
  );
}
export function OfficialCharacterForm({
  value,
  onChange,
  issues,
  rules,
  uploadRule,
  busy,
  uploading,
  onUpload,
  images,
}: {
  value: OfficialCharacter;
  onChange: (value: OfficialCharacter) => void;
  issues: Record<string, string>;
  rules: CharacterRules;
  uploadRule: ProductConfig["uploads"]["official"];
  busy: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  images: { imageUrl: string; name: string }[];
}) {
  const prefix = useId();
  const update = <K extends keyof OfficialCharacter>(
    key: K,
    next: OfficialCharacter[K]
  ) => onChange({ ...value, [key]: next });
  const text = (
    key: "name" | "personality" | "appearance" | "interests",
    label: string,
    limit: number,
    multiline = false,
    hint = ""
  ) => {
    const id = `${prefix}-${key}`,
      props = {
        id,
        value: value[key],
        maxLength: limit,
        disabled: busy,
        "aria-invalid": !!issues[key],
        "aria-describedby": `${id}-help`,
        onChange: (
          event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        ) => update(key, event.target.value),
      };
    return (
      <Field
        id={id}
        label={label}
        error={issues[key]}
        hint={`${value[key].length} / ${limit} 字${hint ? ` · ${hint}` : ""}`}
      >
        {multiline ? (
          <Textarea {...props} rows={key === "personality" ? 5 : 3} />
        ) : (
          <Input {...props} />
        )}
      </Field>
    );
  };
  const localized = (
    key: "label" | "tagline",
    locale: keyof ContentText,
    label: string,
    hint: string
  ) => {
    const id = `${prefix}-${key}-${locale}`;
    return (
      <Field
        id={id}
        label={label}
        hint={hint}
        error={issues[`${key}.${locale}`]}
      >
        <Input
          id={id}
          disabled={busy}
          value={value[key][locale] || ""}
          aria-invalid={!!issues[`${key}.${locale}`]}
          aria-describedby={`${id}-help`}
          placeholder={hint}
          onChange={event => {
            const next = { ...value[key] };
            if (locale !== "zh-CN" && !event.target.value.trim())
              delete next[locale];
            else next[locale] = event.target.value;
            update(key, next);
          }}
        />
      </Field>
    );
  };
  return (
    <div className="space-y-7">
      <section aria-label="基本资料" className="space-y-4">
        <div>
          <h2 className="font-semibold">基本资料</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            填写名字和人物设定即可开始；身份标签、介绍和外貌可使用默认内容。
          </p>
        </div>
        {text("name", "名字（必填）", Math.min(100, rules.limits.name))}
        <div className="grid grid-cols-2 gap-4">
          <Field
            id={`${prefix}-age`}
            label="年龄"
            error={issues.age}
            hint="仅限成年角色，18–120 岁"
          >
            <NumberField
              id={`${prefix}-age`}
              label="年龄"
              path="character.age"
              schema={numberSchemas.age}
              disabled={busy}
              value={value.age}
              error={issues.age}
              onChange={next => update("age", next)}
            />
          </Field>
          <Field id={`${prefix}-style`} label="画面风格">
            <select
              id={`${prefix}-style`}
              value={value.style}
              disabled={busy}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              onChange={event =>
                update(
                  "style",
                  event.target.value as OfficialCharacter["style"]
                )
              }
            >
              <option value="anime">动漫</option>
              <option value="realistic">写实</option>
            </select>
          </Field>
        </div>
        {text(
          "personality",
          "人物设定（必填）",
          Math.min(2000, rules.limits.personality),
          true,
          "性格、身份，以及与用户相处的方式"
        )}
      </section>
      <section aria-label="封面与展示" className="space-y-4">
        <h2 className="font-semibold">封面与展示</h2>
        <div className="flex items-start gap-4">
          {officialImageSchema.safeParse(value.imageUrl).success && (
            <img
              src={value.imageUrl}
              alt="当前封面"
              className="h-28 w-20 rounded-xl object-cover"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`${prefix}-cover`}>
              {uploading ? "正在上传…" : "更换封面"}
            </Label>
            <Input
              id={`${prefix}-cover`}
              aria-label="上传官方图片"
              type="file"
              accept={uploadRule.mimeTypes.join(",")}
              disabled={busy}
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onUpload(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {uploadDescription(uploadRule).formats} · 最大{" "}
              {uploadDescription(uploadRule).maxSize}。可继续使用已有封面。
            </p>
            <select
              aria-label="使用已有封面"
              disabled={busy}
              value={
                images.some(item => item.imageUrl === value.imageUrl)
                  ? value.imageUrl
                  : ""
              }
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
              onChange={event => {
                if (event.target.value) update("imageUrl", event.target.value);
              }}
            >
              <option value="">已上传的封面</option>
              {images.map(item => (
                <option key={item.imageUrl} value={item.imageUrl}>
                  {item.name}的封面
                </option>
              ))}
            </select>
            {issues.imageUrl && (
              <p role="alert" className="text-xs text-destructive">
                {issues.imageUrl}
              </p>
            )}
          </div>
        </div>
        {localized("label", "zh-CN", "身份标签（选填）", "留空使用「AI 伙伴」")}
        {localized(
          "tagline",
          "zh-CN",
          "角色介绍（选填）",
          "留空使用人物设定的前 100 字"
        )}
        <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div>
            <Label htmlFor={`${prefix}-listed`}>展示在探索页</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              关闭后仍可用于首页默认角色；首页精选要求开启。
            </p>
          </div>
          <Switch
            id={`${prefix}-listed`}
            checked={value.listed}
            disabled={busy}
            onCheckedChange={next => update("listed", next)}
          />
        </div>
      </section>
      <details className="admin-config-group rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          更多设置（选填）
        </summary>
        <div className="mt-5 space-y-5">
          {text(
            "appearance",
            "外貌说明",
            Math.min(2000, rules.limits.appearance),
            true,
            "留空以封面图片为准"
          )}
          {text(
            "interests",
            "兴趣",
            Math.min(1000, rules.limits.interests),
            true
          )}
          <Field
            id={`${prefix}-nickname`}
            label="对用户的称呼"
            error={issues["behavior.userNickname"]}
            hint={`${value.behavior.userNickname.length} / ${rules.limits.nickname} 字 · 留空由角色自然称呼`}
          >
            <Input
              id={`${prefix}-nickname`}
              value={value.behavior.userNickname}
              disabled={busy}
              aria-invalid={!!issues["behavior.userNickname"]}
              aria-describedby={`${prefix}-nickname-help`}
              onChange={event =>
                update("behavior", {
                  ...value.behavior,
                  userNickname: event.target.value,
                })
              }
            />
          </Field>
          <details className="admin-config-group rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">
              相处方式与示例对话
            </summary>
            <div className="mt-4">
              <ConfigForm
                value={Object.fromEntries(
                  Object.entries(value.behavior).filter(
                    ([key]) => key !== "userNickname"
                  )
                )}
                schema={{
                  ...behaviorForm,
                  properties: Object.fromEntries(
                    Object.entries(behaviorForm.properties || {}).filter(
                      ([key]) => key !== "userNickname"
                    )
                  ),
                }}
                path="behavior"
                disabled={busy}
                onChange={next =>
                  update("behavior", {
                    ...(next as OfficialCharacter["behavior"]),
                    userNickname: value.behavior.userNickname,
                  })
                }
              />
            </div>
          </details>
          <details className="admin-config-group rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">多语言展示</summary>
            <p className="mt-3 text-xs text-muted-foreground">
              其他语言可留空，前台自动回退简体中文；右侧预览可切换语言。
            </p>
            <div className="mt-4 space-y-4">
              {(["en", "ja", "ko"] as const).map(locale => (
                <div key={locale} className="grid gap-3 sm:grid-cols-2">
                  {localized(
                    "label",
                    locale,
                    `${officialFieldNames[locale]} · 身份标签`,
                    "留空使用简体中文"
                  )}
                  {localized(
                    "tagline",
                    locale,
                    `${officialFieldNames[locale]} · 角色介绍`,
                    "留空使用简体中文"
                  )}
                </div>
              ))}
            </div>
          </details>
          <Field
            id={`${prefix}-sort`}
            label="展示顺序"
            error={issues.sortOrder}
            hint="数字越小越靠前，新角色自动排在末尾"
          >
            <NumberField
              id={`${prefix}-sort`}
              label="展示顺序"
              path="character.sortOrder"
              schema={numberSchemas.sortOrder}
              disabled={busy}
              value={value.sortOrder}
              error={issues.sortOrder}
              onChange={next => update("sortOrder", next)}
            />
          </Field>
          <details className="admin-config-group rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">资源与标识</summary>
            <p className="mt-3 break-all text-xs text-muted-foreground">
              角色标识：{value.id}（自动生成，保存后保持不变）
            </p>
            <Field
              id={`${prefix}-path`}
              label="站内图片路径"
              error={issues.imageUrl}
            >
              <Input
                id={`${prefix}-path`}
                value={value.imageUrl}
                disabled={busy}
                onChange={event => update("imageUrl", event.target.value)}
              />
            </Field>
          </details>
        </div>
      </details>
      {Object.keys(issues).length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-medium">保存前请完成以下内容</p>
          <ul className="mt-2 list-inside list-disc text-destructive">
            {Object.entries(issues).map(([key, error]) => (
              <li key={key}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
