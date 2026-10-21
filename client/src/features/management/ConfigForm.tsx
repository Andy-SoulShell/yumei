/** 依据现有配置契约生成普通表单；复杂工作流仍可切换完整 JSON 编辑。 */
import { useId, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { officialImageSchema } from "@shared/discovery";
import { ColorField, isHexColor } from "./ColorField";
export type FormSchema = {
  readOnly?: boolean;
  pattern?: string;
  prefixItems?: FormSchema[];
  propertyNames?: { enum?: string[] };
  type?: string;
  properties?: Record<string, FormSchema>;
  items?: FormSchema;
  additionalProperties?: FormSchema | boolean;
  anyOf?: FormSchema[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
  required?: string[];
  const?: unknown;
};
const labels: Record<string, string> = {
  home: "首页展示",
  character: "角色资料",
  id: "标识 ID",
  enabled: "启用",
  name: "名称",
  label: "显示名称",
  description: "说明",
  title: "标题",
  highlight: "强调文字",
  action: "按钮文案",
  href: "跳转路径",
  images: "图片",
  imageUrl: "图片路径",
  question: "问题",
  answer: "回答",
  slides: "轮播",
  faqs: "常见问题",
  defaultPresetId: "默认官方角色",
  featuredIds: "首页精选角色",
  pageSize: "目录每页数量",
  homeCharacterLimit: "首页角色数量",
  carouselIntervalMs: "轮播间隔（毫秒）",
  billing: "套餐与计费",
  plans: "套餐列表",
  limits: "权益与限制",
  price: "价格",
  amount: "金额",
  currency: "货币",
  period: "周期",
  defaultTierId: "默认套餐",
  selfHostedTierId: "自托管套餐",
  defaultChatModel: "OpenRouter 默认模型",
  mode: "模式",
  dailyMessages: "每日消息数",
  dailySelfies: "每日图片数",
  monthlySelfies: "每月图片数",
  maxGirlfriends: "角色数量",
  checkoutUrl: "结账地址",
  lemonVariantId: "支付变体 ID",
  rateLimits: "每分钟请求频率",
  pastDueGraceMs: "欠费宽限（毫秒）",
  selfies: "自拍姿势",
  defaultPoseId: "默认姿势",
  poses: "姿势列表",
  minLevel: "解锁等级",
  promptFragment: "画面提示",
  aliases: "识别别名",
  emoji: "表情",
  intimacy: "亲密度",
  levels: "等级",
  rules: "奖励规则",
  basePoints: "基础积分",
  bonusPoints: "额外积分",
  bonusThreshold: "奖励阈值",
  cooldownMinutes: "冷却（分钟）",
  dailyLimit: "每日次数",
  requiredPoints: "所需积分",
  dailyPointsLimit: "每日经验上限",
  minimumTextLength: "最少消息字数",
  night: "夜间时段",
  timeZone: "时区",
  startHour: "开始小时",
  endHour: "结束小时",
  petName: "阶段称呼",
  prompts: "提示词模板",
  quickTemplates: "快捷模板",
  text: "正文",
  system: "系统模板",
  safetyClause: "安全提示",
  extraction: "记忆提取",
  summary: "摘要",
  chat: "聊天",
  image: "图片",
  context: "上下文预算",
  total: "总字符数",
  platform: "平台提示预算",
  followups: "补充消息预算",
  memory: "记忆规则",
  categories: "分类",
  levelRules: "等级容量",
  capacity: "容量",
  recallCount: "召回数量",
  maxEditedLength: "编辑字数",
  semantic: "语义检索",
  ranking: "排序",
  matching: "去重与更正",
  jobs: "任务与重试",
  themes: "主题",
  defaultThemeId: "默认主题",
  items: "主题列表",
  colors: "预览色卡",
  light: "浅色主色",
  dark: "深色主色",
  background: "背景色",
  foreground: "前景色",
  hue: "色相",
  color: "颜色",
  gradientFrom: "渐变起点",
  gradientTo: "渐变终点",
  proactive: "主动联系与通知",
  defaults: "默认偏好",
  frequencyDays: "联系间隔（天）",
  minimumGapMs: "互动与联系下限（毫秒）",
  unreadBackoff: "未回应退避",
  events: "事件窗口",
  upcomingDays: "提前天数",
  followupDays: "后续天数",
  contactLifetimeMs: "联系有效期（毫秒）",
  leaseMs: "租约（毫秒）",
  tickMs: "调度间隔（毫秒）",
  pushTimeoutMs: "推送超时（毫秒）",
  batchSize: "每批数量",
  retry: "重试",
  client: "客户端检查",
  templates: "多语言通知模板",
  proactiveEnabled: "用户默认主动联系",
  proactiveMode: "联系模式",
  quietStart: "免打扰开始（本地分钟）",
  quietEnd: "免打扰结束（本地分钟）",
  hidePrivatePreview: "隐藏私密预览",
  uploads: "上传与录音",
  requestMaxBytes: "请求体上限（字节）",
  avatar: "头像",
  reference: "角色参考图",
  couple: "合照参考图",
  official: "官方图片",
  audio: "音频",
  maxBytes: "文件上限（字节）",
  mimeTypes: "允许格式",
  recordingMimeTypes: "录音编码优先顺序",
  maxDurationSeconds: "最长时长（秒）",
  sampleRate: "采样率（Hz）",
  chunkMs: "分块间隔（毫秒）",
  models: "模型与服务",
  runtime: "执行与回收",
  provider: "服务",
  operatorBaseUrl: "运营方网关地址",
  deepseekModel: "DeepSeek 模型",
  comfyuiBaseUrl: "ComfyUI 地址",
  falSelfie: "fal 自拍模型",
  falCouple: "fal 合照模型",
  transcription: "语音转写",
  tts: "语音合成",
  elevenlabs: "ElevenLabs",
  fishaudio: "Fish Audio",
  model: "模型",
  workflows: "ComfyUI 工作流",
  nodes: "工作流节点",
  promptNode: "提示词节点",
  seedNode: "采样节点",
  outputNode: "输出节点",
  referenceNode: "参考图节点",
  resizeNode: "缩放节点",
  ai: "内部 AI 任务",
  dailyTaskLimit: "每日尝试次数",
  taskTimeoutMs: "总超时（毫秒）",
  maxInputChars: "输入字数上限",
  maxOutputChars: "输出字数上限",
  maxTokens: "输出 token 上限",
  temperature: "温度",
  topP: "Top-p",
  localConcurrency: "实例并发",
  userConcurrency: "用户并发",
  maintenance: "后台回收",
  catalog: "模型目录",
  voice: "语音执行",
  characters: "角色默认值与上限",
  defaultBehavior: "默认行为",
  conversationTitle: "会话标题模板",
  storage: "存储请求与签名",
  requestTimeoutMs: "请求超时（毫秒）",
  signedUrlTtlSeconds: "签名链接有效期（秒）",
  leaseMinimumMs: "任务最短租约（毫秒）",
  leasePaddingMs: "任务租约余量（毫秒）",
  behavior: "行为设定",
  expression: "表达方式",
  verbosity: "详细程度",
  initiative: "主动程度",
  relationshipPace: "相处节奏",
  emotionIntensity: "情感表达",
  userNickname: "用户称呼",
  examples: "示例对话",
  user: "用户",
  assistant: "角色",
  personality: "性格",
  appearance: "外貌",
  interests: "兴趣",
  customPrompt: "专属提示词",
  age: "年龄",
  style: "风格",
  tagline: "角色介绍",
  listed: "公开展示",
  sortOrder: "排序",
  promptBudgets: "资料提示词预算",
  emotion: "情绪规则与展示",
  baseline: "基准分数",
  minScore: "分数下限",
  maxScore: "分数上限",
  recoveryMs: "恢复周期（毫秒）",
  hurtDurationMs: "受伤状态持续（毫秒）",
  hurtThreshold: "受伤状态阈值",
  deltas: "情绪变化分数",
  thresholds: "心情分数门槛",
  moods: "心情展示",
  excited: "心动",
  happy: "开心",
  content: "满足",
  neutral: "平静",
  lonely: "想念",
  sad: "难过",
  experience: "分页、播放与连接",
  pagination: "列表与分页",
  conversations: "会话列表",
  messages: "消息分页",
  search: "搜索分页",
  recentCharacters: "最近角色数量",
  notifications: "通知数量",
  searchPreviewChars: "搜索摘要字数",
  maxSearchChars: "搜索词上限",
  playback: "浏览器朗读",
  speeds: "可选倍速",
  defaultSpeed: "默认倍速",
  browserRate: "浏览器基础语速",
  pitch: "音调",
  volume: "音量",
  defaultLanguage: "默认朗读语言",
  defaultProvider: "默认语音服务",
  transport: "请求与重连",
  operations: "运营统计",
  minimumRecordingSeconds: "最短录音（秒）",
  levelNoticeMs: "升级提示时长（毫秒）",
  site: "运营链接与页脚",
  disclosure: "页脚说明",
  links: "服务与支持链接",
  support: "支持资源",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  fal: "fal.ai",
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  min: "最小值",
  max: "最大值",
};
export function fieldLabel(key: string) {
  return labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}
function normalized(
  schema: FormSchema | undefined,
  value: unknown
): FormSchema {
  if (!schema) return {};
  return (
    schema.anyOf?.find(
      item =>
        item.type ===
        (Array.isArray(value)
          ? "array"
          : value === null
            ? "null"
            : typeof value)
    ) ??
    schema.anyOf?.find(item => item.type !== "null") ??
    schema
  );
}
function empty(schema: FormSchema | undefined): unknown {
  const s = normalized(schema, undefined);
  if (s.const !== undefined) return s.const;
  if (s.enum?.length) return s.enum[0];
  if (s.type === "object")
    return Object.fromEntries(
      Object.entries(s.properties ?? {}).map(([key, child]) => [
        key,
        empty(child),
      ])
    );
  if (s.type === "array") return [];
  if (s.type === "number" || s.type === "integer") return s.minimum ?? 0;
  if (s.type === "boolean") return false;
  if (s.type === "null") return null;
  return "";
}
function itemName(value: unknown, index: number): string {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["name", "label", "question", "title", "id"]) {
      const item = obj[key];
      if (typeof item === "string" && item) return item;
      if (item && typeof item === "object" && "zh-CN" in item)
        return String(item["zh-CN"]);
    }
  }
  return `第 ${index + 1} 项`;
}
export type FieldChoice = { value: string; label: string; imageUrl?: string };
type FormOptions = {
  choices?: (path: string) => FieldChoice[] | undefined;
  onUpload?: (file: File) => Promise<string>;
  uploadAccept?: string;
};
const optionLabels: Record<string, string> = {
  realistic: "写实",
  anime: "动漫",
  warm: "温柔",
  direct: "直率",
  playful: "俏皮",
  reserved: "内敛",
  concise: "简洁",
  balanced: "适中",
  detailed: "详细",
  quiet: "安静",
  lively: "活泼",
  gradual: "循序渐进",
  natural: "自然",
  gentle: "克制",
  expressive: "丰富",
  free: "免费额度模式",
  none: "自托管不限额",
  lemonsqueezy: "Lemon Squeezy 订阅",
  events: "事件关心",
  daily: "日常陪伴",
  browser: "浏览器朗读",
  elevenlabs: "ElevenLabs",
  fishaudio: "Fish Audio",
  disabled: "关闭",
  enabled: "开启",
};
const longField = (path: string, value: unknown) =>
  typeof value === "string" &&
  (value.length > 100 ||
    /prompt|instruction|personality|appearance|interests|answer|description|disclosure|(?:^|\.)text(?:\.|$)/i.test(
      path
    ));
/** 字段只修改草稿内存，提交前仍使用完整共享 schema 校验。 */
export function ConfigForm({
  value,
  onChange,
  schema,
  path = "配置",
  depth = 0,
  disabled = false,
  choices,
  onUpload,
  uploadAccept,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  schema?: FormSchema;
  path?: string;
  depth?: number;
  disabled?: boolean;
} & FormOptions) {
  disabled ||= schema?.readOnly ?? false;
  const id = useId(),
    [newKey, setNewKey] = useState("");
  const key = path.split(".").at(-1)!,
    label = /^\d+$/.test(key)
      ? itemName(value, Number(key))
      : /\.background\.(light|dark)$/.test(path)
        ? key === "light"
          ? "浅色背景"
          : "深色背景"
        : fieldLabel(key),
    s = normalized(schema, value);
  const options = { choices, onUpload, uploadAccept };
  const header = (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate text-sm font-medium">{label}</span>
      <span
        className="max-w-[45%] truncate font-mono text-[10px] font-normal text-muted-foreground/70"
        title={path}
      >
        {key}
      </span>
    </span>
  );
  if (value === null)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/15 p-3">
        {header}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {/(?:Messages|Selfies|Girlfriends)$/.test(key)
              ? "不限量"
              : "未设置"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange(
                empty(
                  schema?.anyOf?.find(item => item.type !== "null") ?? schema
                )
              )
            }
          >
            设置
          </Button>
        </div>
      </div>
    );
  if (Array.isArray(value)) {
    const fixedColors = key === "colors" && !!s.prefixItems;
    const move = (index: number, target: number) => {
      const next = [...value];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    };
    return (
      <details
        open={depth < 1 || fixedColors}
        className="admin-config-group rounded-2xl border p-3 sm:p-4"
      >
        <summary className="cursor-pointer list-none">
          {header}
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {value.length} 项
          </span>
        </summary>
        <div
          className={
            fixedColors ? "mt-4 grid gap-4 sm:grid-cols-3" : "mt-4 space-y-3"
          }
        >
          {value.map((item, index) => (
            <div
              key={index}
              className={
                fixedColors
                  ? "min-w-0"
                  : "rounded-xl border border-border/60 bg-muted/15 p-3"
              }
            >
              {!fixedColors && (
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {itemName(item, index)}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${path} 第 ${index + 1} 项上移`}
                      disabled={disabled || index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${path} 第 ${index + 1} 项下移`}
                      disabled={disabled || index === value.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`删除 ${path} 第 ${index + 1} 项`}
                      disabled={disabled}
                      onClick={() =>
                        onChange(value.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </div>
              )}
              <ConfigForm
                {...options}
                value={item}
                path={`${path}.${index}`}
                schema={s.prefixItems?.[index] ?? s.items}
                depth={depth + 1}
                disabled={disabled}
                onChange={next =>
                  onChange(value.map((old, i) => (i === index ? next : old)))
                }
              />
            </div>
          ))}
          {!fixedColors && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                disabled ||
                (s.maxItems !== undefined && value.length >= s.maxItems)
              }
              onClick={() => onChange([...value, empty(s.items)])}
            >
              <Plus className="size-3.5" />
              新增一项
            </Button>
          )}
        </div>
      </details>
    );
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>,
      languages = s.propertyNames?.enum?.includes("zh-CN"),
      editableRecord = !languages && typeof s.additionalProperties === "object";
    // MySQL JSON 会重排对象键；表单始终遵循共享契约的字段和语言顺序。
    const ordered = Array.from(
      new Set([
        ...(languages
          ? s.propertyNames!.enum!
          : Object.keys(s.properties ?? {})),
        ...Object.keys(object),
      ])
    ).filter(name => name in object);
    const fields = (
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        {ordered.map(name => {
          const item = object[name];
          return (
            <div
              key={name}
              className={`min-w-0 ${editableRecord ? "rounded-xl border border-border/60 bg-muted/15 p-3" : ""} ${!languages && (typeof item === "object" || longField(`${path}.${name}`, item)) ? "sm:col-span-2" : ""}`}
            >
              {editableRecord && (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {name}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`删除 ${path}.${name}`}
                    disabled={disabled}
                    onClick={() =>
                      onChange(
                        Object.fromEntries(
                          Object.entries(object).filter(([key]) => key !== name)
                        )
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
              <ConfigForm
                {...options}
                value={item}
                schema={
                  s.properties?.[name] ??
                  (typeof s.additionalProperties === "object"
                    ? s.additionalProperties
                    : undefined)
                }
                path={`${path}.${name}`}
                depth={depth + 1}
                disabled={disabled}
                onChange={next => onChange({ ...object, [name]: next })}
              />
            </div>
          );
        })}
        {languages ? (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {s
              .propertyNames!.enum!.filter(code => !(code in object))
              .map(code => (
                <Button
                  key={code}
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange({ ...object, [code]: "" })}
                >
                  <Plus className="size-3.5" />
                  添加{fieldLabel(code)}
                </Button>
              ))}
          </div>
        ) : typeof s.additionalProperties === "object" ? (
          <div className="flex gap-2 sm:col-span-2">
            <Input
              aria-label={`${path} 新标识`}
              value={newKey}
              placeholder="新标识"
              disabled={disabled}
              onChange={event => setNewKey(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !newKey.trim() || newKey.trim() in object}
              onClick={() => {
                onChange({
                  ...object,
                  [newKey.trim()]: empty(s.additionalProperties as FormSchema),
                });
                setNewKey("");
              }}
            >
              添加
            </Button>
          </div>
        ) : null}
      </div>
    );
    if (languages)
      return (
        <div className="rounded-xl bg-muted/15 p-3 sm:p-4">
          {header}
          {fields}
        </div>
      );
    return (
      <details
        open={depth < 1}
        className="admin-config-group rounded-2xl border p-3 sm:p-4"
      >
        <summary className="cursor-pointer list-none">{header}</summary>
        {fields}
      </details>
    );
  }
  if (typeof value === "boolean")
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/15 p-3">
        <Label htmlFor={id} className="min-w-0 flex-1">
          {header}
        </Label>
        <Switch
          id={id}
          checked={value}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </div>
    );
  const values: FieldChoice[] | undefined =
    choices?.(path) ??
    s.enum?.map(item => ({
      value: String(item),
      label:
        (/^selfies\.poses\.\d+\.mode$/.test(path)
          ? { mirror: "镜中自拍", direct: "直视镜头", auto: "自动选择" }[
              String(item) as "mirror" | "direct" | "auto"
            ]
          : undefined) ??
        optionLabels[String(item)] ??
        String(item),
    }));
  const selected = values?.find(item => item.value === value);
  const color =
    typeof value === "string" &&
    (isHexColor(value) || s.pattern?.includes("0-9a-fA-F"));
  const image =
    typeof value === "string" && /imageUrl$|\.images\.\d+$/.test(path);
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id} className="block">
        {header}
      </Label>
      {values ? (
        <>
          <select
            id={id}
            disabled={disabled}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
            value={String(value)}
            onChange={event => onChange(event.target.value)}
          >
            {!selected && (
              <option value={String(value)}>
                {String(value) || "请选择"}（需要重新选择）
              </option>
            )}
            {values.map(item => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {selected?.imageUrl &&
            officialImageSchema.safeParse(selected.imageUrl).success && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/20 p-3">
                <img
                  src={selected.imageUrl}
                  alt=""
                  className="size-12 rounded-xl object-cover"
                />
                <span className="text-xs text-muted-foreground">
                  {selected.label}
                </span>
              </div>
            )}
        </>
      ) : typeof value === "number" ? (
        <Input
          id={id}
          type="number"
          step={s.type === "integer" ? 1 : "any"}
          min={s.minimum}
          max={s.maximum}
          disabled={disabled}
          value={Number.isFinite(value) ? value : ""}
          onChange={event =>
            onChange(
              event.target.value === "" ? NaN : Number(event.target.value)
            )
          }
        />
      ) : color ? (
        <ColorField
          id={id}
          label={label}
          value={String(value)}
          disabled={disabled}
          onChange={onChange}
        />
      ) : longField(path, value) ? (
        <Textarea
          id={id}
          value={String(value)}
          disabled={disabled}
          rows={Math.min(10, Math.max(3, String(value).split("\n").length))}
          maxLength={s.maxLength}
          className="resize-y text-sm leading-6"
          onChange={event => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={String(value)}
          disabled={disabled}
          maxLength={s.maxLength}
          onChange={event => onChange(event.target.value)}
        />
      )}{" "}
      {image && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
          {officialImageSchema.safeParse(value).success ? (
            <img
              src={String(value)}
              alt="图片预览"
              className="h-24 w-32 rounded-lg object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              填写有效图片路径，或上传素材
            </span>
          )}
          {onUpload && (
            <Label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs">
              <ImagePlus className="size-4" />
              上传替换
              <Input
                aria-label={`${label} 上传图片`}
                type="file"
                accept={uploadAccept}
                className="sr-only"
                disabled={disabled}
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file)
                    void onUpload(file)
                      .then(onChange)
                      .catch(() => {});
                }}
              />
            </Label>
          )}
        </div>
      )}
      {schema?.anyOf?.some(item => item.type === "null") && (
        <Button
          size="sm"
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          {/(?:Messages|Selfies|Girlfriends)$/.test(key)
            ? "设为不限量"
            : "清空设置"}
        </Button>
      )}
    </div>
  );
}
