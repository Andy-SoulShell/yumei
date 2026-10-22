/** 套餐、姿势、等级和快捷模板使用内容卡片与独立编辑区。 */
import { Plus, Trash2, ArrowUp, ArrowDown, Search } from "lucide-react";
import type { ProductConfig } from "@shared/productConfig";
import { memoryLevelRule } from "@shared/memory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { FormSchema } from "./ConfigForm";
import { SettingsFields } from "./SettingsFields";
import type { SettingsNavigation } from "./settingsModel";
import { LevelBenefitsEditor } from "./LevelBenefitsEditor";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
export type CollectionKind =
  "plans" | "poses" | "videoPresets" | "levels" | "quickTemplates";
type Item = Record<string, unknown>;
const titles: Record<CollectionKind, string> = {
  plans: "套餐",
  poses: "姿势",
  videoPresets: "视频动作",
  levels: "等级",
  quickTemplates: "快捷模板",
};
const text = (value: unknown) =>
  value && typeof value === "object"
    ? String((value as Item)["zh-CN"] || "")
    : String(value || "");
export const collectionName = (item: Item) =>
  text(item.label ?? item.name) || "未命名";
function summary(kind: CollectionKind, item: Item) {
  if (kind === "plans") {
    const price = item.price as {
      amount: number;
      currency: string;
      period: string;
    };
    try {
      return `${new Intl.NumberFormat("zh-CN", { style: "currency", currency: price.currency }).format(price.amount)} / ${price.period === "year" ? "年" : "月"}`;
    } catch {
      return "请完善价格与币种";
    }
  }
  if (kind === "poses")
    return `${item.minLevel} 级解锁 · ${item.mode === "mirror" ? "镜中自拍" : item.mode === "direct" ? "直视镜头" : "自动选择"}`;
  if (kind === "videoPresets")
    return `${item.minLevel} 级解锁 · ${item.enabled ? "已开放" : "未开放"}`;
  if (kind === "levels")
    return `第 ${item.level} 级 · ${item.requiredPoints} 分`;
  return text(item.text).slice(0, 65) || "填写模板内容";
}
export function newCollectionItem(
  kind: CollectionKind,
  items: Item[],
  source?: Item
): Item {
  const copy = source ? structuredClone(source) : {};
  const id = `${kind === "quickTemplates" ? "template" : kind === "videoPresets" ? "video-preset" : kind.slice(0, -1)}-${crypto.randomUUID().slice(0, 8)}`;
  if (kind === "levels") {
    const last = items.at(-1)!;
    const gap = Math.max(
      1,
      Number(last.requiredPoints) - Number(items.at(-2)?.requiredPoints ?? 0)
    );
    return {
      ...structuredClone(last),
      level: items.length + 1,
      requiredPoints: Math.min(100000000, Number(last.requiredPoints) + gap),
      name: { "zh-CN": "新阶段" },
      description: { "zh-CN": "新的相处阶段" },
      petName: { "zh-CN": "伙伴" },
    };
  }
  if (kind === "plans")
    return {
      ...copy,
      id,
      label: { "zh-CN": "新套餐" },
      enabled: false,
      checkoutUrl: null,
      lemonVariantId: null,
    };
  if (kind === "poses")
    return {
      ...copy,
      id,
      label: { "zh-CN": "新姿势" },
      enabled: false,
      aliases: [],
    };
  if (kind === "videoPresets")
    return {
      id,
      label: { "zh-CN": "新动作" },
      emoji: copy.emoji ?? "🎬",
      minLevel: copy.minLevel ?? 1,
      promptFragment: copy.promptFragment ?? "",
      enabled: false,
    };
  return {
    ...copy,
    id,
    label: { "zh-CN": "新模板" },
    text: copy.text ?? { "zh-CN": "请输入新的偏好内容" },
    enabled: false,
  };
}
const groups: Record<CollectionKind, { title: string; fields: string[] }[]> = {
  plans: [
    { title: "名称与展示", fields: ["label", "enabled"] },
    { title: "价格", fields: ["price"] },
    { title: "用户权益", fields: ["limits"] },
    { title: "支付关联", fields: ["checkoutUrl", "lemonVariantId"] },
  ],
  poses: [
    {
      title: "用户看到的姿势",
      fields: ["label", "emoji", "enabled", "minLevel", "mode"],
    },
    { title: "画面与识别", fields: ["promptFragment", "aliases"] },
  ],
  videoPresets: [
    {
      title: "用户看到的动作",
      fields: ["label", "emoji", "enabled", "minLevel"],
    },
    { title: "连续动作与镜头", fields: ["promptFragment"] },
  ],
  levels: [
    {
      title: "阶段与经验",
      fields: ["name", "requiredPoints", "description", "petName", "emoji"],
    },
    { title: "阶段配色", fields: ["color", "gradientFrom", "gradientTo"] },
  ],
  quickTemplates: [
    { title: "模板名称", fields: ["label", "enabled"] },
    { title: "偏好内容", fields: ["text"] },
  ],
};
export function SettingsCollection({
  kind,
  focused = false,
  items,
  schema,
  path,
  config,
  issues,
  disabled,
  onChange,
  view,
  onViewChange,
  onConfigChange,
  rootSchema,
}: {
  kind: CollectionKind;
  focused?: boolean;
  items: Item[];
  schema?: FormSchema;
  path: string;
  config: ProductConfig;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (items: Item[]) => void;
  onConfigChange?: (config: ProductConfig) => void;
  rootSchema?: FormSchema;
} & SettingsNavigation) {
  const selected =
    view.selections[path] ?? String(items[0]?.id ?? items[0]?.level ?? "");
  const search = view.searches[path] ?? "";
  const selectedIndex = items.findIndex(
    item => String(item.id ?? item.level) === selected
  );
  const index = focused ? selectedIndex : Math.max(0, selectedIndex);
  const item = items[index],
    name = item ? collectionName(item) : "";
  const defaultId =
    kind === "plans"
      ? config.billing.defaultTierId
      : kind === "poses"
        ? config.selfies.defaultPoseId
        : undefined;
  const protectedItem =
    (kind === "plans" &&
      (item?.id === config.billing.defaultTierId ||
        item?.id === config.billing.selfHostedTierId)) ||
    (kind === "poses" && item?.id === defaultId);
  const lastLevelReferenced =
    kind === "levels" &&
    index === items.length - 1 &&
    (config.selfies.poses.some(p => p.minLevel >= items.length) ||
      config.videos.presets.some(p => p.minLevel >= items.length) ||
      config.memory.levelRules.some(p => p.minLevel >= items.length) ||
      Object.values(config.prompts.chat.relationshipStages).some(stages =>
        stages.some(p => p.minLevel >= items.length)
      ));
  const removeDisabled =
    disabled ||
    protectedItem ||
    items.length <= (schema?.minItems ?? 0) ||
    (kind === "levels" && (index !== items.length - 1 || lastLevelReferenced));
  const addDisabled =
    disabled ||
    items.length >= (schema?.maxItems ?? Infinity) ||
    (kind === "levels" && Number(items.at(-1)?.requiredPoints) >= 100000000);
  const select = (row: Item) =>
    onViewChange({
      ...view,
      selections: {
        ...view.selections,
        [path]: String(row.id ?? row.level ?? ""),
      },
    });
  const update = (next: unknown) =>
    onChange(items.map((old, i) => (i === index ? (next as Item) : old)));
  const move = (to: number) => {
    const next = [...items];
    const selectedItem = next[index];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
    select(selectedItem);
  };
  return (
    <div className="space-y-6">
      {!focused && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label={`搜索${titles[kind]}`}
                className="pl-9"
                placeholder={`搜索${titles[kind]}名称`}
                value={search}
                disabled={disabled}
                onChange={event =>
                  onViewChange({
                    ...view,
                    searches: { ...view.searches, [path]: event.target.value },
                  })
                }
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={addDisabled}
              onClick={() => {
                const next = newCollectionItem(kind, items, item);
                onChange([...items, next]);
                onViewChange({
                  ...view,
                  selections: {
                    ...view.selections,
                    [path]: String(next.id ?? next.level),
                  },
                  searches: { ...view.searches, [path]: "" },
                });
              }}
            >
              <Plus className="size-4" />
              {kind === "levels" ? "添加下一等级" : `复制为新${titles[kind]}`}
            </Button>
          </div>
          <div
            className={
              kind === "levels"
                ? "grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"
                : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            }
            aria-label={`${titles[kind]}内容库`}
          >
            {items
              .map((row, i) => ({ row, i }))
              .filter(({ row }) =>
                collectionName(row).toLowerCase().includes(search.toLowerCase())
              )
              .map(({ row, i }) => {
                const count = Object.keys(issues).filter(
                  key =>
                    key === `${path}.${i}` || key.startsWith(`${path}.${i}.`)
                ).length;
                return (
                  <button
                    key={String(row.id ?? row.level)}
                    type="button"
                    disabled={disabled}
                    aria-pressed={i === index}
                    onClick={() => select(row)}
                    className={`min-w-0 rounded-xl border ${kind === "levels" ? "p-3" : "p-4"} text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${i === index ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={kind === "levels" ? "text-base" : "text-2xl"}
                      >
                        {kind === "plans"
                          ? "✦"
                          : kind === "quickTemplates"
                            ? "✎"
                            : String(row.emoji || "♡")}
                      </span>
                      <div className="flex gap-1">
                        {row.id !== undefined && row.id === defaultId && (
                          <Badge variant="secondary">默认</Badge>
                        )}
                        {count > 0 ? (
                          <Badge variant="destructive">{count} 处待完善</Badge>
                        ) : (
                          kind !== "levels" && (
                            <Badge variant="outline">
                              {row.enabled ? "启用" : "停用"}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                    <h3
                      className={`${kind === "levels" ? "mt-1 text-sm" : "mt-3"} truncate font-semibold`}
                    >
                      {collectionName(row)}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {summary(kind, row)}
                    </p>
                    {kind === "plans" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {(row.limits as { dailyMessages: number | null })
                          .dailyMessages === null
                          ? "聊天不限量"
                          : `每日 ${(row.limits as { dailyMessages: number }).dailyMessages} 条消息`}
                      </p>
                    )}
                  </button>
                );
              })}
          </div>
          {!items.some(row =>
            collectionName(row).toLowerCase().includes(search.toLowerCase())
          ) && (
            <p className="rounded-xl bg-muted/30 p-5 text-center text-sm text-muted-foreground">
              没有匹配的{titles[kind]}，可以更换关键词。
            </p>
          )}
        </>
      )}
      {item && (
        <section
          aria-label={`编辑${titles[kind]}`}
          className="space-y-5 rounded-2xl border p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">编辑{name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {kind === "levels"
                  ? `第 ${item.level} 级保持不变，只能从末级删除。`
                  : `标识 ${item.id} 自动保持不变。`}
              </p>
            </div>
            <div className="flex gap-1">
              {kind !== "levels" && (
                <>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${name}上移`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index - 1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${name}下移`}
                    disabled={disabled || index === items.length - 1}
                    onClick={() => move(index + 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={removeDisabled}>
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>从草稿中删除{name}？</AlertDialogTitle>
                    <AlertDialogDescription>
                      删除后需要保存并发布才会影响用户。发布前仍可重新读取已保存的草稿。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>保留</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={disabled}
                      onClick={() => {
                        onChange(items.filter((_, i) => i !== index));
                        if (!focused)
                          select(items[Math.max(0, index - 1)] ?? {});
                      }}
                    >
                      删除草稿中的条目
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {(protectedItem || lastLevelReferenced) && (
            <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              {protectedItem
                ? "默认或自托管使用的条目需要先更换关联，才能删除。"
                : "末级仍被姿势、记忆或关系阶段引用，请先调整关联规则。"}
            </p>
          )}
          {kind === "plans" && (
            <p
              className="rounded-xl bg-primary/5 p-4 text-sm leading-6"
              aria-live="polite"
            >
              {config.billing.mode === "none"
                ? "当前为自托管不限额模式：套餐身份用于展示，套餐计量限制不执行。"
                : config.billing.mode === "free"
                  ? `当前为免费模式：所有用户使用「${config.billing.plans.find(plan => plan.id === config.billing.defaultTierId)?.label["zh-CN"]}」。其他套餐不会因启用或填写价格而自动授予用户。`
                  : `当前为订阅模式：${item.id === config.billing.defaultTierId ? "没有有效订阅或订阅失效时，用户回到此套餐。" : "用户需要有效订阅关联到此套餐，才会获得这些权益。"} 套餐顺序也决定升级推荐顺序。`}
              {!item.enabled && " 此套餐已停用，新权益判断不会授予此套餐。"}
            </p>
          )}
          {kind === "levels" &&
            !onConfigChange &&
            (() => {
              const level = Number(item.level),
                memory = memoryLevelRule(level, config.memory),
                poses = config.selfies.poses.filter(
                  pose => pose.enabled && pose.minLevel === level
                ),
                pace = config.characters.defaultBehavior.relationshipPace,
                stage = [...config.prompts.chat.relationshipStages[pace]]
                  .reverse()
                  .find(stage => stage.minLevel <= level);
              return (
                <div
                  className="space-y-2 rounded-xl bg-primary/5 p-4 text-sm leading-6"
                  aria-live="polite"
                >
                  <p className="font-medium">
                    达到 {String(item.requiredPoints)} 分后，进入第 {level} 级
                  </p>
                  <p>
                    本级新解锁：
                    {poses.map(pose => pose.label["zh-CN"]).join("、") ||
                      "没有额外自拍姿势"}
                    。
                  </p>
                  <p>
                    本级视频动作：
                    {config.videos.presets
                      .filter(
                        preset => preset.enabled && preset.minLevel === level
                      )
                      .map(preset => preset.label["zh-CN"])
                      .join("、") || "没有额外视频动作"}
                    。
                  </p>
                  <p>
                    {config.memory.enabled
                      ? `记忆容量 ${memory.capacity} 条，普通回复召回 ${memory.recallCount} 条（继承第 ${memory.minLevel} 级起的规则）。`
                      : "记忆功能关闭，容量规则暂不使用。"}
                  </p>
                  <p>
                    默认关系节奏使用第 {stage?.minLevel ?? 1}{" "}
                    级起的相处指令；不同角色按自己的关系节奏选择。
                  </p>
                  <p className="text-xs text-muted-foreground">
                    可在下方「一起决定体验的设置」中编辑解锁姿势、记忆能力和关系指令。
                  </p>
                </div>
              );
            })()}
          {kind === "levels" && onConfigChange && (
            <RadioGroup
              aria-label="当前等级编辑内容"
              className="grid grid-cols-3 gap-2"
              value={view.selections["level.panel"] ?? "growth"}
              disabled={disabled}
              onValueChange={next =>
                onViewChange({
                  ...view,
                  selections: { ...view.selections, "level.panel": next },
                })
              }
            >
              <RadioGroupChoice value="growth" variant="segment">
                升级门槛
              </RadioGroupChoice>
              <RadioGroupChoice value="benefits" variant="segment">
                解锁与能力
              </RadioGroupChoice>
              <RadioGroupChoice value="appearance" variant="segment">
                阶段配色
              </RadioGroupChoice>
            </RadioGroup>
          )}
          {kind === "levels" &&
          onConfigChange &&
          view.selections["level.panel"] === "benefits" ? (
            <LevelBenefitsEditor
              level={Number(item.level)}
              config={config}
              schema={rootSchema}
              issues={issues}
              disabled={disabled}
              onChange={onConfigChange}
              view={view}
              onViewChange={onViewChange}
            />
          ) : (
            groups[kind]
              .filter(
                (_, at) =>
                  kind !== "levels" ||
                  !onConfigChange ||
                  (view.selections["level.panel"] === "appearance"
                    ? at === 1
                    : at === 0)
              )
              .map(group => (
                <section key={group.title} className="space-y-3 border-t pt-4">
                  <h4 className="text-sm font-semibold">{group.title}</h4>
                  <SettingsFields
                    key={String(item.id ?? item.level) + group.title}
                    value={item}
                    schema={schema?.items}
                    path={`${path}.${index}`}
                    fields={group.fields}
                    config={config}
                    issues={issues}
                    disabled={disabled}
                    onChange={update}
                    view={view}
                    onViewChange={onViewChange}
                  />
                </section>
              ))
          )}
        </section>
      )}
    </div>
  );
}
