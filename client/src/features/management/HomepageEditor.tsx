/** 通过可视化选择与排序编排首页，保留完整多语言内容。 */
import { useId, useState } from "react";
import { z } from "zod";
import { ArrowUp, ArrowDown, Trash2, Plus, Eye } from "lucide-react";
import {
  homepageSchema,
  contentText,
  type Homepage,
  type ContentText,
} from "@shared/discovery";
import type { Locale } from "@shared/locales";
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
import { LandingCarousel } from "@/features/discovery/LandingCarousel";
import { CharacterCard } from "@/components/CharacterCard";
import { CharacterDetailContent } from "@/components/CharacterDetailDialog";
import { fieldLabel, type FormSchema } from "./ConfigForm";
import { NumberField } from "./NumberField";
import { ImagePreview } from "./ImagePreview";
import type { CharacterRow } from "./managementModel";
const homeFields = (z.toJSONSchema(homepageSchema) as FormSchema).properties!;

export function homepageIssues(value: Homepage, rows: CharacterRow[]) {
  const parsed = homepageSchema.safeParse(value),
    errors = parsed.success
      ? []
      : parsed.error.issues.map(
          issue =>
            `${issue.path.map(part => (typeof part === "number" ? `第 ${part + 1} 项` : fieldLabel(String(part)))).join(" · ")}：${issue.message}`
        );
  if (!rows.some(row => !row.archived && row.id === value.defaultPresetId))
    errors.push("请选择有效的默认角色");
  if (new Set(value.featuredIds).size !== value.featuredIds.length)
    errors.push("精选角色不能重复");
  for (const id of value.featuredIds)
    if (!rows.some(row => !row.archived && row.data.listed && row.id === id))
      errors.push(
        `精选中的${rows.find(row => row.id === id)?.data.name || "角色"}已归档或未公开，请移除或更换`
      );
  for (const key of ["slides", "faqs"] as const)
    if (new Set(value[key].map(item => item.id)).size !== value[key].length)
      errors.push(`${key === "slides" ? "轮播" : "问答"}标识不能重复`);
  return errors;
}
function CopyField({
  label,
  value,
  locale,
  onChange,
  multiline = false,
  autoFocus = false,
}: {
  label: string;
  value: ContentText;
  locale: Locale;
  onChange: (value: ContentText) => void;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId(),
    props = {
      id,
      autoFocus,
      maxLength: 6000,
      value: value[locale] || "",
      placeholder:
        locale === "zh-CN" ? "请输入内容" : value["zh-CN"] || "留空使用中文",
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => {
        const next = { ...value };
        if (locale !== "zh-CN" && !event.target.value.trim())
          delete next[locale];
        else next[locale] = event.target.value;
        onChange(next);
      },
    };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? <Textarea {...props} rows={4} /> : <Input {...props} />}
    </div>
  );
}
function OrderActions({
  index,
  length,
  label,
  onMove,
  onRemove,
}: {
  index: number;
  length: number;
  label: string;
  onMove: (target: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`上移${label}`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`下移${label}`}
        disabled={index === length - 1}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`移除${label}`}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
function HomePreview({
  home,
  rows,
  locale,
  onClose,
}: {
  home: Homepage;
  rows: CharacterRow[];
  locale: Locale;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<CharacterRow>();
  const featured = home.featuredIds
    .map(id =>
      rows.find(row => row.id === id && !row.archived && row.data.listed)
    )
    .filter((row): row is CharacterRow => !!row)
    .slice(0, home.homeCharacterLimit);
  return (
    <>
      <Dialog
        open
        onOpenChange={open => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>首页预览</DialogTitle>
            <DialogDescription>
              当前草稿的展示效果，尚未保存的修改也会显示。预览不会创建角色。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <LandingCarousel
              slides={home.slides.map(slide => ({
                ...slide,
                title: contentText(slide.title, locale),
                highlight: contentText(slide.highlight, locale),
                action: contentText(slide.action, locale),
              }))}
              intervalMs={home.carouselIntervalMs}
              preview
            />
            <div>
              <h2 className="mb-4 text-lg font-semibold">精选角色</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {featured.map(row => (
                  <CharacterCard
                    key={row.id}
                    name={row.data.name}
                    image={row.data.imageUrl}
                    label={contentText(row.data.label, locale)}
                    description={contentText(row.data.tagline, locale)}
                    age={row.data.age}
                    styleLabel={row.data.style === "anime" ? "动漫" : "写实"}
                    onClick={() => setSelected(row)}
                  />
                ))}
              </div>
              {!featured.length && (
                <p className="text-sm text-muted-foreground">
                  暂未选择精选角色
                </p>
              )}
            </div>
            {home.faqs.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">常见问题</h2>
                {home.faqs.map(faq => (
                  <details key={faq.id} className="border-b py-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      {contentText(faq.question, locale)}
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {contentText(faq.answer, locale)}
                    </p>
                  </details>
                ))}
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {selected && (
        <Dialog
          open
          onOpenChange={open => {
            if (!open) setSelected(undefined);
          }}
        >
          <DialogContent className="character-detail">
            <CharacterDetailContent
              selected={{
                ...selected.data,
                label: contentText(selected.data.label, locale),
                tagline: contentText(selected.data.tagline, locale),
              }}
            >
              <Button variant="outline" onClick={() => setSelected(undefined)}>
                返回首页预览
              </Button>
            </CharacterDetailContent>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
export function HomepageEditor({
  value,
  onChange,
  rows,
  busy,
  onUpload,
  uploadAccept,
}: {
  value: Homepage;
  onChange: (value: Homepage) => void;
  rows: CharacterRow[];
  busy: boolean;
  onUpload: (file: File) => Promise<string>;
  uploadAccept?: string;
}) {
  const [tab, setTab] = useState("featured"),
    [locale, setLocale] = useState<Locale>("zh-CN"),
    [query, setQuery] = useState(""),
    [preview, setPreview] = useState(false);
  const [created, setCreated] = useState("");
  const active = rows.filter(row => !row.archived),
    available = active.filter(
      row =>
        row.data.listed &&
        !value.featuredIds.includes(row.id) &&
        row.data.name.includes(query.trim())
    );
  const images = Array.from(
    new Map(
      active.map(row => [
        row.data.imageUrl,
        { path: row.data.imageUrl, name: row.data.name },
      ])
    ).values()
  );
  const move = <T,>(items: T[], from: number, to: number) => {
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  };
  const update = <K extends keyof Homepage>(key: K, next: Homepage[K]) =>
    onChange({ ...value, [key]: next });
  const slide = (index: number, next: Partial<Homepage["slides"][number]>) =>
    update(
      "slides",
      value.slides.map((item, i) => (i === index ? { ...item, ...next } : item))
    );
  const faq = (index: number, next: Partial<Homepage["faqs"][number]>) =>
    update(
      "faqs",
      value.faqs.map((item, i) => (i === index ? { ...item, ...next } : item))
    );
  return (
    <>
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <legend className="sr-only">首页编排</legend>
        <div className="admin-toolbar">
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="首页内容分区"
          >
            {[
              {
                id: "featured",
                name: `精选角色 (${value.featuredIds.length})`,
              },
              { id: "slides", name: `轮播 (${value.slides.length})` },
              { id: "faqs", name: `常见问题 (${value.faqs.length})` },
              { id: "display", name: "展示设置" },
            ].map(item => (
              <Button
                key={item.id}
                size="sm"
                variant={tab === item.id ? "secondary" : "ghost"}
                aria-pressed={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {item.name}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="admin-select"
              aria-label="首页文案语言"
              value={locale}
              onChange={event => setLocale(event.target.value as Locale)}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreview(true)}
            >
              <Eye className="size-4" />
              预览首页
            </Button>
          </div>
        </div>
        {tab === "featured" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">
                把最想推荐的角色放在前面
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                按展示顺序排列，使用箭头调整位置。只有公开角色可以加入精选。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {value.featuredIds.map((id, index) => {
                const row = rows.find(row => row.id === id);
                return (
                  <div
                    key={`${id}-${index}`}
                    className="flex items-center gap-3 rounded-xl border p-3"
                  >
                    {row && (
                      <img
                        src={row.data.imageUrl}
                        alt=""
                        className="h-16 w-12 rounded-lg object-contain"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {row?.data.name || "失效角色"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        第 {index + 1} 位
                        {row?.archived
                          ? " · 已归档"
                          : !row?.data.listed
                            ? " · 未公开"
                            : ""}
                      </p>
                    </div>
                    <OrderActions
                      index={index}
                      length={value.featuredIds.length}
                      label={row?.data.name || "精选角色"}
                      onMove={to =>
                        update(
                          "featuredIds",
                          move(value.featuredIds, index, to)
                        )
                      }
                      onRemove={() =>
                        update(
                          "featuredIds",
                          value.featuredIds.filter((_, i) => i !== index)
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
            <details className="admin-config-group rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                添加精选角色
              </summary>
              <Input
                aria-label="查找可添加的精选角色"
                className="my-4"
                placeholder="搜索角色名字"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {available.map(row => (
                  <Button
                    key={row.id}
                    variant="outline"
                    className="h-auto justify-start gap-3 p-2"
                    disabled={value.featuredIds.length >= 50}
                    onClick={() =>
                      update("featuredIds", [...value.featuredIds, row.id])
                    }
                  >
                    <img
                      src={row.data.imageUrl}
                      alt=""
                      className="h-12 w-9 rounded-md object-contain"
                    />
                    <span className="min-w-0 truncate">{row.data.name}</span>
                    <Plus className="ml-auto size-4 shrink-0" />
                  </Button>
                ))}
                {!available.length && (
                  <p className="text-sm text-muted-foreground">
                    没有可添加的角色，试试其他名字。
                  </p>
                )}
              </div>
            </details>
          </div>
        )}
        {tab === "slides" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              第一张最先展示。标题、强调文字和按钮会按当前语言呈现。
            </p>
            {value.slides.map((item, index) => (
              <details
                key={item.id}
                open={index === 0 || item.id === created}
                className="admin-config-group rounded-2xl border p-4"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {index + 1}. {contentText(item.title, locale) || "新轮播"}
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      最多 3 张画面
                    </span>
                    <OrderActions
                      index={index}
                      length={value.slides.length}
                      label={`轮播${index + 1}`}
                      onMove={to =>
                        update("slides", move(value.slides, index, to))
                      }
                      onRemove={() =>
                        update(
                          "slides",
                          value.slides.filter((_, i) => i !== index)
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CopyField
                      label={`轮播${index + 1}标题`}
                      autoFocus={item.id === created}
                      value={item.title}
                      locale={locale}
                      onChange={title => slide(index, { title })}
                    />
                    <CopyField
                      label={`轮播${index + 1}强调文字`}
                      value={item.highlight}
                      locale={locale}
                      onChange={highlight => slide(index, { highlight })}
                    />
                    <CopyField
                      label={`轮播${index + 1}按钮文案`}
                      value={item.action}
                      locale={locale}
                      onChange={action => slide(index, { action })}
                    />
                    <label className="space-y-2 text-sm font-medium">
                      按钮链接
                      <Input
                        aria-label={`轮播${index + 1}按钮链接`}
                        value={item.href}
                        onChange={event =>
                          slide(index, { href: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {item.images.map((src, imageIndex) => (
                      <div
                        key={imageIndex}
                        className="space-y-2 rounded-xl border p-3"
                      >
                        <ImagePreview
                          src={src}
                          alt={`轮播${index + 1}画面${imageIndex + 1}`}
                          disabled={busy}
                          className="h-60 w-full"
                        />
                        <select
                          className="admin-select w-full"
                          aria-label={`轮播${index + 1}画面${imageIndex + 1}`}
                          value={src}
                          onChange={event =>
                            slide(index, {
                              images: item.images.map((old, i) =>
                                i === imageIndex ? event.target.value : old
                              ),
                            })
                          }
                        >
                          {!images.some(image => image.path === src) && (
                            <option value={src}>当前画面</option>
                          )}
                          {images.map(image => (
                            <option key={image.path} value={image.path}>
                              {image.name}的封面
                            </option>
                          ))}
                        </select>
                        <div className="flex justify-between gap-2">
                          <label className="cursor-pointer text-xs text-primary">
                            上传替换
                            <input
                              type="file"
                              aria-label={`上传轮播${index + 1}画面${imageIndex + 1}`}
                              className="sr-only"
                              accept={uploadAccept}
                              onChange={event => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file)
                                  void onUpload(file)
                                    .then(url =>
                                      slide(index, {
                                        images: item.images.map((old, i) =>
                                          i === imageIndex ? url : old
                                        ),
                                      })
                                    )
                                    .catch(() => {});
                              }}
                            />
                          </label>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={item.images.length <= 1}
                            onClick={() =>
                              slide(index, {
                                images: item.images.filter(
                                  (_, i) => i !== imageIndex
                                ),
                              })
                            }
                          >
                            移除画面
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={item.images.length >= 3}
                    onClick={() =>
                      slide(index, {
                        images: [
                          ...item.images,
                          images.find(
                            image => !item.images.includes(image.path)
                          )?.path || item.images[0],
                        ],
                      })
                    }
                  >
                    添加画面
                  </Button>
                </div>
              </details>
            ))}
            <Button
              variant="outline"
              disabled={value.slides.length >= 20 || !images.length}
              onClick={() => {
                const id = `slide-${crypto.randomUUID().slice(0, 8)}`;
                setCreated(id);
                update("slides", [
                  ...value.slides,
                  {
                    id,
                    title: { "zh-CN": "新的相遇" },
                    highlight: { "zh-CN": "从一句你好开始。" },
                    action: { "zh-CN": "探索角色" },
                    href: "/explore",
                    images: [images[0].path],
                  },
                ]);
              }}
            >
              <Plus className="size-4" />
              新增轮播
            </Button>
          </div>
        )}
        {tab === "faqs" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              用简洁的问答帮助用户了解产品，顺序与首页一致。
            </p>
            {value.faqs.map((item, index) => (
              <details
                key={item.id}
                open={index === 0 || item.id === created}
                className="admin-config-group rounded-2xl border p-4"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {index + 1}. {contentText(item.question, locale) || "新问题"}
                </summary>
                <div className="mt-4 space-y-4">
                  <OrderActions
                    index={index}
                    length={value.faqs.length}
                    label={`问答${index + 1}`}
                    onMove={to => update("faqs", move(value.faqs, index, to))}
                    onRemove={() =>
                      update(
                        "faqs",
                        value.faqs.filter((_, i) => i !== index)
                      )
                    }
                  />
                  <CopyField
                    label={`问题${index + 1}`}
                    autoFocus={item.id === created}
                    value={item.question}
                    locale={locale}
                    onChange={question => faq(index, { question })}
                  />
                  <CopyField
                    label={`回答${index + 1}`}
                    value={item.answer}
                    locale={locale}
                    onChange={answer => faq(index, { answer })}
                    multiline
                  />
                </div>
              </details>
            ))}
            <Button
              variant="outline"
              disabled={value.faqs.length >= 50}
              onClick={() => {
                const id = `faq-${crypto.randomUUID().slice(0, 8)}`;
                setCreated(id);
                update("faqs", [
                  ...value.faqs,
                  {
                    id,
                    question: { "zh-CN": "" },
                    answer: { "zh-CN": "" },
                  },
                ]);
              }}
            >
              <Plus className="size-4" />
              新增问答
            </Button>
          </div>
        )}
        {tab === "display" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              默认角色
              <select
                aria-label="默认角色"
                className="admin-select w-full"
                value={value.defaultPresetId}
                onChange={event =>
                  update("defaultPresetId", event.target.value)
                }
              >
                {!active.some(row => row.id === value.defaultPresetId) && (
                  <option value={value.defaultPresetId}>当前角色已失效</option>
                )}
                {active.map(row => (
                  <option key={row.id} value={row.id}>
                    {row.data.name}
                  </option>
                ))}
              </select>
              <p className="text-xs font-normal text-muted-foreground">
                作为默认预设使用，可与探索页展示分开设置。
              </p>
            </label>
            {(
              [
                {
                  key: "homeCharacterLimit",
                  label: "首页最多展示角色数",
                  min: 0,
                  max: 100,
                },
                {
                  key: "pageSize",
                  label: "探索页每页角色数",
                  min: 1,
                  max: 100,
                },
              ] as const
            ).map(item => (
              <label key={item.key} className="space-y-2 text-sm font-medium">
                {item.label}
                <NumberField
                  label={item.label}
                  path={`home.${item.key}`}
                  schema={homeFields[item.key]}
                  value={value[item.key]}
                  onChange={next => update(item.key, next)}
                />
              </label>
            ))}
            <label className="space-y-2 text-sm font-medium">
              轮播切换间隔
              <NumberField
                label="轮播切换间隔"
                path="home.carouselIntervalMs"
                schema={homeFields.carouselIntervalMs}
                value={value.carouselIntervalMs}
                onChange={next => update("carouselIntervalMs", next)}
              />
            </label>
          </div>
        )}
      </fieldset>
      {preview && (
        <HomePreview
          home={value}
          rows={rows}
          locale={locale}
          onClose={() => setPreview(false)}
        />
      )}
    </>
  );
}
