/** 依据现有配置契约生成普通表单；复杂工作流仍可切换完整 JSON 编辑。 */
import { useId, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { ChoiceField } from "./ChoiceField";
import { officialImageSchema } from "@shared/discovery";
import { ColorField, isHexColor } from "./ColorField";
import { NumberField } from "./NumberField";
import { ImagePreview } from "./ImagePreview";
import {
  fieldHint,
  nullableLabel,
  textError,
  textKind,
} from "./fieldPresentation";
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
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
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
  recoveryMs: "恢复时间尺度（毫秒）",
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
  playback: "朗读与播放",
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
  voiceTranscription: "语音转文字",
  ttsProviders: "可用朗读服务",
  modelLocked: "锁定默认聊天模型",
  couplePhoto: "合照功能",
  selfie: "图片生成",
  transcribe: "语音转文字",
  level: "等级",
  history: "历史对话预算",
  nickname: "用户称呼长度",
  exampleLength: "单条示例长度",
  exampleCount: "示例对话组数",
  globalPrompt: "全局偏好长度",
  replyLanguage: "语言偏好长度",
  replyLength: "回复长度偏好",
  steady: "平常互动",
  affection: "表达喜欢",
  conflict: "发生冲突",
  repair: "关系修复",
  text_message: "文字互动",
  voice_message: "语音互动",
  daily_first: "每日首次互动",
  edit_profile: "完善资料",
  long_conversation: "深入对话",
  night_chat: "夜间陪伴",
  maxExtractedLength: "单条提取长度",
  everyRounds: "提取间隔",
  sourceMessageLimit: "参考消息数",
  maxResults: "单次提取数量",
  firstRound: "首轮提取",
  explicitRequests: "响应用户记忆请求",
  factLimit: "摘要参考记忆数",
  maxTopics: "摘要主题数量",
  maxQuoteLength: "引用长度",
  weight: "语义检索权重",
  duplicateThreshold: "重复判定相似度",
  correctionThreshold: "更正判定相似度",
  initialWeightMin: "初始权重下限",
  initialWeightMax: "初始权重上限",
  reinforcement: "重复提及的权重增加",
  freshnessFloor: "新鲜度最低保留比例",
  decayDays: "衰减周期",
  affinityMultiplier: "相关性加权系数",
  affinityMax: "相关性加分上限",
  pinnedBonus: "置顶加分",
  recall: "记忆召回",
  maxChars: "召回文本预算",
  explicitUsesCapacity: "明确回忆时使用完整容量",
  maxAttempts: "最大尝试次数",
  retryBaseMs: "首次重试间隔",
  retryMaxMs: "重试间隔上限",
  baseMs: "首次重试间隔",
  maxMs: "重试间隔上限",
  quietMs: "免打扰后重试间隔",
  base: "退避倍率",
  maxExponent: "退避指数上限",
  maxDays: "最长等待天数",
  unreadPollMs: "未读通知检查间隔",
  initialCheckMs: "首次检查等待",
  checkIntervalMs: "定期检查间隔",
  deepseekThinking: "DeepSeek 思考模式",
  replyTimeoutMs: "回复总超时",
  queueTimeoutMs: "排队最长等待",
  heartbeatMs: "任务心跳间隔",
  pollMs: "任务轮询间隔",
  schedulerMs: "调度间隔",
  burstMessages: "合并消息上限",
  segmentChars: "单段输出长度",
  flushMs: "输出刷新间隔",
  flushPollMs: "刷新检查间隔",
  comfyuiTimeoutMs: "ComfyUI 总超时",
  comfyuiRequestTimeoutMs: "ComfyUI 单次请求超时",
  comfyuiPollMs: "ComfyUI 结果检查间隔",
  cancelTimeoutMs: "取消请求超时",
  falTimeoutMs: "fal 生成超时",
  downloadTimeoutMs: "结果下载超时",
  maxImageBytes: "结果图片容量上限",
  reservationGraceMs: "额度预留宽限",
  transcriptionTimeoutMs: "转写超时",
  ttsTimeoutMs: "语音合成超时",
  ttsMaxChars: "单次朗读文本长度",
  ttsRetentionMs: "语音保留时间",
  credentialTtlMs: "临时凭据有效期",
  timeoutMs: "请求超时",
  fishPageSize: "Fish Audio 目录每页数量",
  mediaBatchSize: "每批清理媒体数量",
  mediaLeaseMs: "媒体清理租约",
  mediaRetryBaseMs: "媒体首次重试间隔",
  mediaRetryMaxMs: "媒体重试间隔上限",
  mediaRetryMaxExponent: "媒体重试指数上限",
  stagedRetentionMs: "临时素材保留时间",
  companionTrashRetentionMs: "角色回收站保留时间",
  rateWindowRetentionMs: "限流记录保留时间",
  generationTimeoutMs: "过期生成任务清理时限",
  observerPollMs: "后台任务检查间隔",
  observerHeartbeatMs: "后台连接心跳",
  clientPollMs: "客户端重连检查间隔",
  defaultDays: "默认统计天数",
  sampleSize: "统计样本数量",
  tone: "情绪语气",
  cause: "互动原因",
  calm: "平静",
  concerned: "关心",
  hurt: "受伤",
  relationshipStages: "关系阶段",
  instruction: "阶段指令",
  languageRule: "回复语言规则",
  lengthRule: "回复长度规则",
  turnLanguage: "本轮语言提示",
  memoryEnabled: "记忆启用提示",
  memoryDisabled: "记忆关闭提示",
  defaultScene: "默认自拍场景",
  defaultCoupleScene: "默认合照场景",
  memoryContext: "记忆上下文模板",
  memoryTemporal: "时间记忆说明",
  unknown: "未知时间",
  undated: "未注明日期",
  past: "过往事件",
  dated: "指定日期",
  fact: "事实",
  preference: "偏好",
  event: "事件",
  relationship: "关系",
};
export function fieldLabel(key: string) {
  return (labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")).replace(
    /（(?:毫秒|字节|秒|分钟|Hz|天|本地分钟)）$/,
    ""
  );
}
/** 同名字段在不同业务阶段有不同含义，不用叶子名称推断用户任务。 */
export function semanticFieldLabel(path: string) {
  const labelsByPath: Record<string, string> = {
    "prompts.chat.defaultLanguage": "未指定回复语言时的指令",
    "prompts.image.reference": "有参考图的自拍模板",
    "prompts.image.text": "无参考图的自拍模板",
    "prompts.image.couple": "合照生成模板",
    "prompts.chat.cause.support": "用户需要支持时的指令",
    "emotion.deltas.support": "用户需要支持时的情绪变化",
    "experience.operations.maxDays": "最多可统计天数",
    "proactive.unreadBackoff.maxDays": "未读退避最长间隔",
    "site.links.support": "客服与帮助入口",
    "intimacy.rules.text_message.bonusThreshold": "额外分的文字长度门槛",
    "intimacy.rules.voice_message.bonusThreshold": "额外分的语音时长门槛",
    "intimacy.rules.daily_first.bonusThreshold": "额外分的连续互动天数",
    "intimacy.rules.long_conversation.bonusThreshold": "深入对话轮次门槛",
  };
  return labelsByPath[path] ?? fieldLabel(path.split(".").at(-1)!);
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
  if (value && typeof value === "object" && "minLevel" in value)
    return `${value.minLevel} 级起`;
  return `第 ${index + 1} 项`;
}
export type FieldChoice = { value: string; label: string; imageUrl?: string };
type FormOptions = {
  choices?: (path: string) => FieldChoice[] | undefined;
  onUpload?: (file: File) => Promise<string>;
  uploadAccept?: string;
  issues?: Record<string, string>;
  flat?: boolean;
  currency?: string;
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
  month: "每月",
  year: "每年",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  fal: "fal.ai",
  comfyui: "ComfyUI",
  mirror: "镜中自拍",
  auto: "自动选择",
  fact: "事实",
  preference: "偏好",
  event: "事件",
  relationship: "关系",
};
export const formOptionLabel = (value: string) =>
  optionLabels[value] ??
  (value === "support" ? "需要支持" : labels[value]) ??
  value;
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
  issues,
  flat = false,
  currency,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  schema?: FormSchema;
  path?: string;
  depth?: number;
  disabled?: boolean;
} & FormOptions) {
  disabled ||= schema?.readOnly ?? false;
  disabled ||= path === "proactive.defaults.proactiveEnabled";
  const id = useId(),
    [newKey, setNewKey] = useState("");
  const [locale, setLocale] = useState("zh-CN");
  const key = path.split(".").at(-1)!,
    label = /^\d+$/.test(key)
      ? itemName(value, Number(key))
      : /\.background\.(light|dark)$/.test(path)
        ? key === "light"
          ? "浅色背景"
          : "深色背景"
        : semanticFieldLabel(path),
    s = normalized(schema, value);
  const options = { choices, onUpload, uploadAccept, issues, currency, flat };
  const issue = issues?.[path];
  const header = (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate text-sm font-medium">{label}</span>
    </span>
  );
  if (value === null)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/15 p-3">
        {header}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {nullableLabel(path)}
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
    // 无顺序语义的格式与权益用多选，录音编码仍保留优先顺序编辑。
    if (s.items?.enum && /(?:mimeTypes|ttsProviders)$/.test(key))
      return (
        <fieldset
          className="space-y-3 rounded-xl border p-4"
          disabled={disabled}
          aria-describedby={`${id}-help`}
        >
          <legend className="px-1 text-sm font-medium">{label}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.items.enum.map(option => {
              const checked = value.includes(option);
              return (
                <label
                  key={String(option)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    disabled={
                      disabled || (checked && value.length <= (s.minItems ?? 0))
                    }
                    onCheckedChange={checked =>
                      onChange(
                        checked === true
                          ? [...value, option]
                          : value.filter(item => item !== option)
                      )
                    }
                  />
                  {optionLabels[String(option)] ??
                    String(option)
                      .replace(/^image\//, "")
                      .toUpperCase()}
                </label>
              );
            })}
          </div>
          <p
            id={`${id}-help`}
            className={`text-xs ${issue ? "text-destructive" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {issue ||
              `至少 ${s.minItems ?? 0} 项${s.maxItems ? `，最多 ${s.maxItems} 项` : ""}；可多选`}
          </p>
        </fieldset>
      );
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
          <p className="text-xs text-muted-foreground">
            至少 {s.minItems ?? 0} 项
            {s.maxItems !== undefined ? `，最多 ${s.maxItems} 项` : ""}
            {key === "recordingMimeTypes"
              ? "；从上到下按录音编码优先顺序使用"
              : ""}
          </p>
          {issue && (
            <p className="text-xs text-destructive" role="status">
              {issue}
            </p>
          )}
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
                      disabled={disabled || value.length <= (s.minItems ?? 0)}
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
              onClick={() =>
                onChange([
                  ...value,
                  s.items?.enum?.find(item => !value.includes(item)) ??
                    empty(s.items),
                ])
              }
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
    if (languages) {
      const codes = s.propertyNames!.enum!,
        selected = codes.includes(locale) ? locale : "zh-CN";
      const languageSchema =
        typeof s.additionalProperties === "object"
          ? s.additionalProperties
          : undefined;
      return (
        <fieldset className="min-w-0 space-y-3 rounded-xl bg-muted/15 p-3 sm:p-4">
          <legend className="px-1 text-sm font-medium">{label}</legend>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label={`${label}的编辑语言`}
          >
            {codes.map(code => (
              <Button
                type="button"
                key={code}
                size="sm"
                variant={selected === code ? "secondary" : "ghost"}
                aria-pressed={selected === code}
                disabled={disabled}
                onClick={() => setLocale(code)}
              >
                {fieldLabel(code)}
                {issues?.[`${path}.${code}`] && (
                  <span className="text-destructive"> · 需修正</span>
                )}
              </Button>
            ))}
          </div>
          <ConfigForm
            {...options}
            value={String(object[selected] ?? "")}
            schema={
              selected === "zh-CN"
                ? languageSchema
                : { ...languageSchema, minLength: 0 }
            }
            path={`${path}.${selected}`}
            depth={depth + 1}
            disabled={disabled}
            onChange={next => {
              const result = { ...object };
              if (selected !== "zh-CN" && !String(next).trim())
                delete result[selected];
              else result[selected] = next;
              onChange(result);
            }}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            简体中文必填；其他语言选填，留空时回退中文。切换语言会保留当前输入。
          </p>
        </fieldset>
      );
    }
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
                currency={
                  typeof object.currency === "string"
                    ? object.currency
                    : currency
                }
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
    if (flat)
      return depth === 0 ? (
        <div className="min-w-0">{fields}</div>
      ) : (
        <fieldset className="min-w-0 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">{label}</legend>
          {fields}
        </fieldset>
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
          {fieldHint(path) && (
            <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
              {fieldHint(path)}
            </span>
          )}
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
    (textKind(path) === "timezone"
      ? Array.from(
          new Set(["UTC", String(value), ...Intl.supportedValuesOf("timeZone")])
        )
          .filter(Boolean)
          .map(value => ({ value, label: value }))
      : textKind(path) === "currency"
        ? Array.from(
            new Set([String(value), ...Intl.supportedValuesOf("currency")])
          )
            .filter(Boolean)
            .map(value => ({ value, label: value }))
        : undefined) ??
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
  const selected = values?.find(item => item.value === String(value));
  const color =
    typeof value === "string" &&
    (isHexColor(value) || s.pattern?.includes("0-9a-fA-F"));
  const image =
    typeof value === "string" && /imageUrl$|\.images\.\d+$/.test(path);
  const kind = textKind(path);
  const error =
    issue ??
    (typeof value === "string" ? textError(value, s, path) : undefined);
  const hint = fieldHint(path);
  const helpId = `${id}-help`;
  return (
    <Field className="min-w-0 gap-2" data-invalid={!!error}>
      <FieldLabel htmlFor={id} className="block">
        {header}
      </FieldLabel>
      {values ? (
        <>
          <ChoiceField
            id={id}
            label={label}
            disabled={disabled}
            value={String(value)}
            choices={values}
            error={error}
            describedBy={helpId}
            onChange={next =>
              onChange(typeof value === "number" ? Number(next) : next)
            }
          />
          {selected?.imageUrl &&
            officialImageSchema.safeParse(selected.imageUrl).success && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/20 p-3">
                <img
                  src={selected.imageUrl}
                  alt=""
                  className="size-12 rounded-xl object-contain"
                />
                <span className="text-xs text-muted-foreground">
                  {selected.label}
                </span>
              </div>
            )}
        </>
      ) : typeof value === "number" ? (
        <NumberField
          id={id}
          label={label}
          schema={s}
          path={path}
          currency={currency}
          disabled={disabled}
          value={value}
          error={issue}
          onChange={onChange}
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
          minLength={s.minLength}
          aria-invalid={!!error}
          aria-describedby={helpId}
          className="resize-y text-sm leading-6"
          onChange={event => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={String(value)}
          type={kind === "url" ? "url" : "text"}
          inputMode={/lemonVariantId$/.test(path) ? "numeric" : undefined}
          list={
            kind === "timezone" || kind === "currency"
              ? `${id}-options`
              : undefined
          }
          disabled={disabled}
          maxLength={s.maxLength}
          minLength={s.minLength}
          pattern={s.pattern}
          aria-invalid={!!error}
          aria-describedby={helpId}
          onChange={event => onChange(event.target.value)}
        />
      )}{" "}
      {typeof value !== "number" && (
        <div
          id={helpId}
          className="space-y-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          {error && <FieldError className="text-xs">{error}</FieldError>}
          {typeof value === "string" && s.maxLength !== undefined && (
            <p>
              {value.length} / {s.maxLength} 字符
              {s.minLength ? ` · 至少 ${s.minLength} 字符` : " · 可留空"}
            </p>
          )}
          {hint && <p>{hint}</p>}
          {kind === "url" && (
            <p>
              {path.startsWith("models.")
                ? "完整的 HTTP / HTTPS 服务地址，不含账号密码"
                : "完整的 HTTPS 公开链接，不含账号密码"}
            </p>
          )}
        </div>
      )}
      {(kind === "timezone" || kind === "currency") && (
        <datalist id={`${id}-options`}>
          {(kind === "timezone"
            ? [
                "UTC",
                "Asia/Shanghai",
                "Asia/Tokyo",
                "Asia/Seoul",
                "America/New_York",
                "Europe/London",
              ]
            : ["USD", "CNY", "EUR", "JPY", "KRW", "GBP", "HKD", "TWD", "SGD"]
          ).map(item => (
            <option key={item} value={item} />
          ))}
        </datalist>
      )}
      {image && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
          {officialImageSchema.safeParse(value).success ? (
            <ImagePreview
              src={String(value)}
              alt="图片预览"
              disabled={disabled}
              className="h-52 w-44"
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
          {nullableLabel(path) === "不限量"
            ? "设为不限量"
            : nullableLabel(path)}
        </Button>
      )}
    </Field>
  );
}
