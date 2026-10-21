/** 各设置页面按运营任务分区，字段路径只用于编辑当前草稿。 */
import type { ProductConfig } from "@shared/productConfig";
import type { FormSchema, FieldChoice } from "./ConfigForm";
export type SettingsSection = Exclude<keyof ProductConfig, "themes">;
export type SettingsPanel = {
  id: string;
  title: string;
  description: string;
  fields: string[];
  collection?: "plans" | "poses" | "levels" | "quickTemplates";
  workflow?: "text" | "reference";
};
const panel = (
  id: string,
  title: string,
  description: string,
  fields: string[]
): SettingsPanel => ({ id, title, description, fields });
export const settingsPanels: Record<SettingsSection, SettingsPanel[]> = {
  billing: [
    {
      ...panel(
        "plans",
        "套餐管理",
        "像用户选套餐一样查看价格和权益，选择一张卡片即可编辑。",
        ["plans"]
      ),
      collection: "plans",
    },
    panel(
      "subscription",
      "订阅与默认",
      "选择默认套餐与计费方式；默认套餐须启用且价格为零。",
      [
        "mode",
        "defaultTierId",
        "selfHostedTierId",
        "defaultChatModel",
        "pastDueGraceMs",
      ]
    ),
    panel(
      "rate",
      "请求频率",
      "分别控制每个用户每分钟可以发起的请求，0 表示禁止。",
      ["rateLimits"]
    ),
  ],
  selfies: [
    {
      ...panel(
        "poses",
        "姿势库",
        "用名称、表情和解锁等级管理用户能选择的自拍姿势。",
        ["poses"]
      ),
      collection: "poses",
    },
    panel("default", "默认姿势", "选择已启用、在第 1 级即可使用的默认姿势。", [
      "defaultPoseId",
    ]),
  ],
  intimacy: [
    {
      ...panel(
        "levels",
        "等级阶梯",
        "预览升级路线，再调整阶段名称、称呼、颜色和经验门槛。",
        ["levels"]
      ),
      collection: "levels",
    },
    panel(
      "rewards",
      "互动奖励",
      "按互动类型设置奖励，阈值会使用对应的时长、字符或天数单位。",
      ["rules"]
    ),
    panel(
      "limits",
      "每日与夜间",
      "控制每日经验上限、有效消息长度和夜间奖励时段。",
      ["dailyPointsLimit", "minimumTextLength", "night"]
    ),
  ],
  characters: [
    panel(
      "behavior",
      "默认相处方式",
      "调整新角色的表达、称呼和对话示例；已有角色保留自己的设置。",
      ["defaultBehavior"]
    ),
    panel(
      "limits",
      "资料长度",
      "每种资料分别设置字符上限，发布前会检查现有官方角色是否兼容。",
      ["limits"]
    ),
    panel(
      "prompts",
      "标题与资料预算",
      "预览会话标题，并分配角色、风格和偏好的提示词预算。",
      ["conversationTitle", "promptBudgets"]
    ),
  ],
  emotion: [
    panel("moods", "心情样式", "调整用户看到的心情名称、表情和配色。", [
      "moods",
    ]),
    panel(
      "scores",
      "分数与恢复",
      "设置基线、上下限和恢复时间，分数应保持下限 ≤ 基线 ≤ 上限。",
      [
        "baseline",
        "minScore",
        "maxScore",
        "recoveryMs",
        "hurtDurationMs",
        "hurtThreshold",
      ]
    ),
    panel(
      "interaction",
      "互动影响",
      "为互动设置加减分，并调整开心与心动的展示门槛。",
      ["deltas", "thresholds"]
    ),
  ],
  memory: [
    panel(
      "capacity",
      "容量与分类",
      "按等级设置记忆容量和召回条数，召回不能超过对应容量。",
      [
        "enabled",
        "categories",
        "levelRules",
        "maxExtractedLength",
        "maxEditedLength",
        "recall",
      ]
    ),
    panel(
      "extraction",
      "记住什么",
      "决定何时提取记忆、参考多少消息，以及每次生成的数量。",
      ["extraction"]
    ),
    panel("summary", "摘要整理", "管理长期摘要使用的素材与输出预算。", [
      "summary",
    ]),
    panel(
      "matching",
      "去重与更正",
      "用相似度百分比控制重复识别，并调整记忆权重。",
      ["matching"]
    ),
    panel("ranking", "检索排序", "设置语义检索、新鲜度衰减与相关性加分。", [
      "semantic",
      "ranking",
    ]),
    panel("jobs", "任务与重试", "设置后台处理批次、重试和任务租约。", ["jobs"]),
  ],
  proactive: [
    panel(
      "schedule",
      "联系安排",
      "用本地时钟设置免打扰和联系频率；主动联系仍需用户明确开启。",
      ["enabled", "defaults", "frequencyDays", "minimumGapMs"]
    ),
    panel(
      "copy",
      "通知文案",
      "维护用户实际收到的文案；私密通知不允许包含角色或事件变量。",
      ["templates"]
    ),
    panel(
      "events",
      "事件与未读",
      "调整事件关心窗口、未回应退避和通知有效期。",
      ["events", "unreadBackoff", "contactLifetimeMs"]
    ),
    panel(
      "delivery",
      "投递与检查",
      "管理投递批次、超时、重试及客户端检查频率。",
      ["leaseMs", "tickMs", "pushTimeoutMs", "batchSize", "retry", "client"]
    ),
  ],
  uploads: [
    ...(
      [
        ["avatar", "头像"],
        ["reference", "角色参考图"],
        ["couple", "合照参考图"],
        ["official", "官方内容图片"],
      ] as const
    ).map(([key, title]) =>
      panel(
        key,
        title,
        "选择允许的图片格式和容量上限，直接查看用户将看到的上传规则。",
        [key]
      )
    ),
    panel(
      "audio",
      "音频与录音",
      "选择音频格式，按顺序安排录音编码，设置时长和采样率。",
      ["audio"]
    ),
    panel(
      "request",
      "请求容量",
      "请求体需要容纳文件转为 Base64 后的数据，以及完整业务配置。",
      ["requestMaxBytes"]
    ),
  ],
  models: [
    panel(
      "chat",
      "聊天服务",
      "选择模型服务和默认模型；凭据继续由服务端密钥管理。",
      ["chat"]
    ),
    panel(
      "image",
      "图片服务",
      "选择 fal 或 ComfyUI，再填写对应服务地址与图片模型。",
      [
        "image.provider",
        "image.comfyuiBaseUrl",
        "image.falSelfie",
        "image.falCouple",
      ]
    ),
    {
      ...panel(
        "text-workflow",
        "文生图工作流",
        "导入 ComfyUI API 节点 JSON，通过节点名称绑定输入与输出。",
        ["image.workflows.text"]
      ),
      workflow: "text",
    },
    {
      ...panel(
        "reference-workflow",
        "参考图工作流",
        "管理参考图节点与缩放节点，绑定必须对应实际存在的节点。",
        ["image.workflows.reference"]
      ),
      workflow: "reference",
    },
    panel("voice", "语音服务", "管理转写和两个朗读服务的模型名称。", [
      "transcription",
      "tts",
    ]),
  ],
  runtime: [
    panel(
      "chat",
      "聊天执行",
      "管理回复长度、采样、超时和并发，保留模型默认值选项。",
      ["chat"]
    ),
    panel("image", "图片执行", "管理生成、下载、额度预留和结果容量。", [
      "image",
    ]),
    panel("voice", "语音执行", "管理转写、合成、文本长度和临时资源保留。", [
      "voice",
    ]),
    panel("ai", "内部任务", "管理每日任务尝试数量和单次超时。", ["ai"]),
    panel("catalog", "模型目录", "设置模型目录加载超时和每批数量。", [
      "catalog",
    ]),
    panel("storage", "存储与签名", "设置存储请求超时与临时链接有效期。", [
      "storage",
    ]),
    panel(
      "maintenance",
      "自动清理",
      "管理临时素材、任务、限流记录和回收站保留时间。",
      ["maintenance"]
    ),
  ],
  experience: [
    panel(
      "playback",
      "朗读体验",
      "配置用户可以选择的倍速、默认服务、音调和音量。",
      ["playback"]
    ),
    panel(
      "pagination",
      "列表与搜索",
      "设置每页条数、最近角色数量和搜索摘要长度。",
      ["pagination"]
    ),
    panel("feedback", "录音与反馈", "配置最短录音时长和升级提示停留时间。", [
      "minimumRecordingSeconds",
      "levelNoticeMs",
    ]),
    panel("transport", "连接与重试", "设置客户端请求、心跳与重连间隔。", [
      "transport",
    ]),
    panel("operations", "统计窗口", "设置默认统计天数、最大窗口和样本数量。", [
      "operations",
    ]),
  ],
  prompts: [
    {
      ...panel(
        "quick",
        "快捷模板",
        "像管理内容卡片一样编辑用户可选的快捷模板，多语言留空可回退中文。",
        ["quickTemplates"]
      ),
      collection: "quickTemplates",
    },
    panel(
      "chat",
      "聊天提示",
      "编辑角色对话的主模板、安全约束和语言规则，保留所需变量。",
      [
        "chat.safetyClause",
        "chat.system",
        "chat.languageRule",
        "chat.defaultLanguage",
        "chat.lengthRule",
        "chat.turnLanguage",
      ]
    ),
    panel(
      "behavior",
      "表达与关系",
      "分别管理表达方式、情绪语气和关系阶段的指令。",
      [
        "chat.expression",
        "chat.verbosity",
        "chat.initiative",
        "chat.tone",
        "chat.cause",
        "chat.emotionIntensity",
        "chat.relationshipStages",
      ]
    ),
    panel("image", "图片提示", "设置自拍、合照和默认场景的提示词。", ["image"]),
    panel(
      "memory",
      "记忆与语音提示",
      "设置提取、摘要、记忆上下文和语音转写指令。",
      [
        "extraction",
        "summary",
        "memoryContext",
        "transcription",
        "memoryTemporal",
        "chat.memoryEnabled",
        "chat.memoryDisabled",
      ]
    ),
    panel(
      "context",
      "上下文预算",
      "分配平台、历史、补充消息和总字符预算，跨字段约束即时校验。",
      ["context"]
    ),
  ],
  site: [
    panel(
      "footer",
      "页脚说明",
      "编辑用户会看到的公开说明，多语言可单独维护。",
      ["disclosure"]
    ),
    panel(
      "links",
      "服务与支持",
      "逐项维护服务和支持入口，使用无凭据的 HTTPS 地址。",
      ["links"]
    ),
  ],
};
export function getSetting(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (item, key) =>
        item && typeof item === "object"
          ? (item as Record<string, unknown>)[key]
          : undefined,
      value
    );
}
export function setSetting(
  value: unknown,
  path: string,
  next: unknown
): unknown {
  const [key, ...rest] = path.split(".");
  const object = value as Record<string, unknown>;
  return {
    ...object,
    [key]: rest.length ? setSetting(object?.[key], rest.join("."), next) : next,
  };
}
export function settingSchema(
  schema: FormSchema | undefined,
  path: string
): FormSchema | undefined {
  return path
    .split(".")
    .reduce<FormSchema | undefined>(
      (item, key) => item?.properties?.[key],
      schema
    );
}
export function settingsChoices(
  config: ProductConfig,
  path: string
): FieldChoice[] | undefined {
  if (/^billing\.(defaultTierId|selfHostedTierId)$/.test(path))
    return config.billing.plans
      .filter(item => item.enabled)
      .map(item => ({ value: item.id, label: item.label["zh-CN"] || item.id }));
  if (path === "selfies.defaultPoseId")
    return config.selfies.poses
      .filter(item => item.enabled && item.minLevel === 1)
      .map(item => ({
        value: item.id,
        label: `${item.emoji} ${item.label["zh-CN"] || item.id}`,
      }));
  if (path === "experience.playback.defaultSpeed")
    return config.experience.playback.speeds.map(value => ({
      value: String(value),
      label: `${value} 倍`,
    }));
  return undefined;
}
