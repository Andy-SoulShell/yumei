/** 页面围绕用户经历组织；关联编辑始终写入同一份完整草稿。 */
import type { ProductConfig } from "@shared/productConfig";
import type { SettingsSection } from "./settingsModel";
export type RelatedTask = {
  section: SettingsSection;
  task: string;
  label: string;
  why: string;
};
export type SettingsJourney = {
  goal: string;
  steps: [string, string, string];
  scope: string;
  related: RelatedTask[];
};
const related = (
  section: SettingsSection,
  task: string,
  label: string,
  why: string
): RelatedTask => ({ section, task, label, why });
export const settingsJourneys: Record<SettingsSection, SettingsJourney> = {
  billing: {
    goal: "用户会获得哪份服务？",
    steps: [
      "决定免费、订阅或不限额",
      "套餐定义价格与权益",
      "用户按订阅状态获得套餐",
    ],
    scope:
      "发布后用于后续权益判断；调低额度不会清空已用次数，已用满的用户需要等待重置或升级。每日、每月额度按 UTC 重置。",
    related: [
      related(
        "models",
        "chat",
        "聊天模型",
        "锁定模型使用这里选定的运营服务；用户自带密钥有独立优先级。"
      ),
      related(
        "experience",
        "playback",
        "默认朗读",
        "默认朗读服务还需要套餐允许该服务，或用户提供自己的密钥。"
      ),
    ],
  },
  intimacy: {
    goal: "一次互动，怎样让关系更进一步？",
    steps: [
      "满足条件才奖励积分",
      "累计积分达到等级门槛",
      "等级决定姿势、记忆与相处阶段",
    ],
    scope:
      "发布后按新门槛计算等级与解锁；已有积分保留。奖励还受冷却、单项次数和每日总分共同限制。",
    related: [
      related(
        "selfies",
        "poses",
        "解锁自拍姿势",
        "等级只是姿势门槛；生成图片还需要套餐额度和可用的图片服务。"
      ),
      related(
        "memory",
        "capacity",
        "每级记忆能力",
        "同一个等级决定能存多少条、平常召回多少条。"
      ),
      related(
        "prompts",
        "behavior",
        "关系阶段的表达",
        "关系节奏决定使用哪一组阶段指令；每组按已达到的最高门槛生效。"
      ),
    ],
  },
  selfies: {
    goal: "用户什么时候能选到这个画面？",
    steps: [
      "启用姿势，用户才看得见",
      "达到等级，用户才可选择",
      "画面提示交给图片或视频服务生成",
    ],
    scope:
      "发布后同步更新自拍和视频预设的选项与解锁门槛。名称用于展示，别名用于识别，画面提示影响新图片和视频。",
    related: [
      related(
        "intimacy",
        "levels",
        "关系等级",
        "姿势的解锁等级来自这条升级路线。"
      ),
      related(
        "models",
        "image",
        "图片服务",
        "自拍模式与参考图决定使用对应模型或工作流。"
      ),
      related(
        "billing",
        "plans",
        "图片额度",
        "达到等级也需要有可用图片额度，0 次会阻止生成。"
      ),
    ],
  },
  characters: {
    goal: "新角色会怎样与用户相处？",
    steps: [
      "创建时带入默认相处方式",
      "资料和偏好受字数上限约束",
      "提示预算决定带入回复的内容",
    ],
    scope:
      "默认相处方式只用于新建角色，已有角色保留自己的设置。资料限制用于后续创建和编辑；发布前会检查官方角色兼容性。",
    related: [
      related(
        "prompts",
        "behavior",
        "相处方式对应的指令",
        "表达、主动性和关系节奏会选取这些指令。"
      ),
      related(
        "prompts",
        "context",
        "完整上下文预算",
        "角色、风格和偏好只是整段上下文的一部分。"
      ),
      related(
        "uploads",
        "reference",
        "角色参考图规则",
        "上传限制决定用户能给角色提供什么图片。"
      ),
    ],
  },
  emotion: {
    goal: "用户的表达，怎样影响这一刻的回应？",
    steps: [
      "识别关心、好感、冲突或修复",
      "情绪分数变化并逐渐恢复",
      "短期语气影响回复和心情展示",
    ],
    scope:
      "用于后续互动和心情读取。情绪分数与亲密度积分分别计算，离线只恢复情绪，不扣亲密度。",
    related: [
      related(
        "prompts",
        "behavior",
        "情绪对应的回复指令",
        "心情名称是界面展示；语气与原因对应的提示指令影响回复。"
      ),
      related(
        "intimacy",
        "rewards",
        "长期关系积分",
        "互动奖励是另一条长期成长规则，不使用这里的情绪加减分。"
      ),
    ],
  },
  memory: {
    goal: "从聊过的话，到下一次被记住",
    steps: [
      "成功聊天触发提取",
      "分类、去重后存入等级容量",
      "检索选取记忆带入下一次回复",
    ],
    scope:
      "发布后影响新的提取、整理和召回。调整容量不会在发布瞬间批量删除记忆；自动淘汰时置顶记忆受保护。",
    related: [
      related(
        "intimacy",
        "levels",
        "记忆依赖的等级",
        "容量规则使用关系等级，同一段等级共用一条容量规则。"
      ),
      related(
        "prompts",
        "memory",
        "提取和召回的提示词",
        "提取决定生成哪些记忆，记忆上下文决定怎样交给聊天模型。"
      ),
      related(
        "prompts",
        "context",
        "回复上下文预算",
        "召回条数以外，还受召回字符数和整体上下文预算限制。"
      ),
    ],
  },
  proactive: {
    goal: "什么时候联系，怎样避免打扰？",
    steps: [
      "平台开放且用户主动开启",
      "频率、免打扰和未读共同筛选",
      "事件或日常文案进入投递队列",
    ],
    scope:
      "默认偏好用于尚未保存偏好的用户；已有用户保留自己的设置。平台总开关和频率允许范围会参与每次资格判断。",
    related: [
      related(
        "memory",
        "extraction",
        "事件记忆来源",
        "事件关心依赖已记录的事件；允许联系不等于一定有事件可发送。"
      ),
      related(
        "experience",
        "pagination",
        "通知列表",
        "站内通知的展示条数在这里调整。"
      ),
    ],
  },
  uploads: {
    goal: "用户选了文件，能否顺利发送？",
    steps: [
      "选择用途对应的图片或音频",
      "同时满足格式、容量和录音规则",
      "请求体容纳编码后的完整数据",
    ],
    scope:
      "发布后用于新上传与新录音，已有素材保留。文件上限与请求上限是两道校验，Base64 会让数据增大约三分之一。",
    related: [
      related(
        "experience",
        "feedback",
        "录音最短时长",
        "录音需要同时满足最短发送时长和最长录制时长。"
      ),
      related(
        "runtime",
        "voice",
        "语音处理",
        "上传成功后，转写和朗读仍分别受到执行超时和文本上限约束。"
      ),
    ],
  },
  models: {
    goal: "一次请求最终交给谁处理？",
    steps: [
      "用户密钥优先，否则用运营服务",
      "服务类型决定模型与工作流",
      "执行规则控制等待与结果",
    ],
    scope:
      "用于新任务；进行中的任务保留执行快照。此处预览不会调用模型，服务可用性还需要有效的服务端密钥与网络。",
    related: [
      related(
        "billing",
        "subscription",
        "聊天默认模型与权益",
        "OpenRouter 默认模型在套餐页定义；DeepSeek 使用服务自己的模型。"
      ),
      related(
        "runtime",
        "chat",
        "聊天等待和回复长度",
        "服务地址与模型确定后，执行规则控制超时、并发和回复预算。"
      ),
      related(
        "prompts",
        "image",
        "画面提示词",
        "提示词与选中的图片模型或工作流一起决定生成请求。"
      ),
    ],
  },
  runtime: {
    goal: "用户发出请求后，会怎样得到结果？",
    steps: [
      "请求校验后进入队列",
      "按并发与超时执行任务",
      "分段交付结果，再回收临时资源",
    ],
    scope:
      "新任务捕获发布快照，调度器在后续轮次读取参数。缩短超时可能让较慢请求提前失败；回收只按各自的保留规则执行。",
    related: [
      related(
        "experience",
        "transport",
        "客户端等待与重试",
        "浏览器等待和后台执行是不同计时器，需一起考虑用户会等多久。"
      ),
      related(
        "models",
        "chat",
        "实际聊天服务",
        "回复时长与所选模型和服务能力有关。"
      ),
      related(
        "uploads",
        "request",
        "上传请求上限",
        "生成结果上限与用户上传上限控制两个不同阶段。"
      ),
    ],
  },
  experience: {
    goal: "把后台能力变成用户顺手的体验",
    steps: [
      "列表与搜索决定先看到多少",
      "录音与播放决定怎样交流",
      "连接与重试决定等待体验",
    ],
    scope:
      "发布后随客户端读取配置应用；用户已保存的播放等偏好优先。列表每页条数不会限制实际保存的内容总量。",
    related: [
      related(
        "uploads",
        "audio",
        "录音格式与最长时长",
        "最短录音是发送门槛，最长录音和采样来自上传规则。"
      ),
      related(
        "billing",
        "plans",
        "朗读服务权益",
        "云端朗读需要套餐允许或用户自带对应密钥。"
      ),
      related(
        "runtime",
        "chat",
        "后台回复时限",
        "浏览器请求超时与后台生成时限并非同一个值。"
      ),
    ],
  },
  prompts: {
    goal: "哪些内容会组成一次生成请求？",
    steps: [
      "角色资料、偏好与状态提供素材",
      "模板变量拼入对应指令",
      "按预算组合上下文交给模型",
    ],
    scope:
      "用于后续生成；预览不调用模型，也不承诺模型一定遵循指令。快捷模板用于用户选择偏好，其他模板用于系统内部生成。",
    related: [
      related(
        "characters",
        "behavior",
        "素材来自相处方式",
        "角色的表达、详略和关系节奏决定选用哪段指令。"
      ),
      related(
        "memory",
        "capacity",
        "记忆素材如何选取",
        "记忆条数与字符预算决定注入的素材。"
      ),
      related(
        "models",
        "chat",
        "接收提示的聊天模型",
        "最终表现还取决于实际服务和模型能力。"
      ),
    ],
  },
  site: {
    goal: "用户在哪里看到说明、找到帮助？",
    steps: [
      "公开页面展示页脚说明",
      "帮助入口指向客服与支持",
      "服务链接帮助用户配置密钥",
    ],
    scope:
      "发布后更新公开说明和相关入口；修改链接不会配置密钥或改变实际调用的模型服务。",
    related: [
      related(
        "models",
        "chat",
        "实际服务配置",
        "服务介绍链接与请求实际使用的地址分别维护。"
      ),
    ],
  },
};

export type FieldGroup = {
  title: string;
  description: string;
  fields: string[];
  advanced?: boolean;
};
const group = (
  title: string,
  description: string,
  fields: string[],
  advanced = false
): FieldGroup => ({ title, description, fields, advanced });
/** 只拆分语义，原始字段仍由共享 schema 校验。未指定的任务沿用其明确任务描述。 */
export const taskFieldGroups: Partial<
  Record<SettingsSection, Record<string, FieldGroup[]>>
> = {
  billing: {
    subscription: [
      group(
        "先选服务方式",
        "免费模式使用默认套餐；订阅模式按订阅授予权益；自托管模式关闭套餐计量。",
        ["mode"]
      ),
      group(
        "没有有效订阅时，用哪份套餐",
        "默认套餐必须启用且免费；这也影响订阅失效后的用户。",
        ["defaultTierId"]
      ),
      group(
        "运营聊天默认用什么模型",
        "OpenRouter 使用此模型；DeepSeek 使用模型服务页中的专用模型。",
        ["defaultChatModel"]
      ),
      group(
        "仅自托管使用",
        "自托管时的套餐身份，不代表还会执行该套餐的计量限制。",
        ["selfHostedTierId"],
        true
      ),
      group(
        "订阅欠费怎样处理",
        "欠费从记录的欠费时间开始计时，超过宽限后回到默认套餐。",
        ["pastDueGraceMs"],
        true
      ),
    ],
    rate: [
      group(
        "短时间内能请求多少次",
        "这里控制每人每分钟的请求密度，独立于套餐的每日、每月总额度；0 会直接禁止对应请求。",
        ["rateLimits"]
      ),
    ],
  },
  intimacy: {
    limits: [
      group("先判断消息是否有效", "短于这个长度的文字不结算文字奖励。", [
        "minimumTextLength",
      ]),
      group(
        "每日累计奖励到哪里停止",
        "一次互动的主奖励、首次奖励和夜间奖励合并判断；剩余额度不足时整组不发。",
        ["dailyPointsLimit"]
      ),
      group(
        "哪些本地时段算夜间",
        "只影响夜间互动奖励，不是通知免打扰。开始与结束相同表示没有夜间时段。",
        ["night"]
      ),
    ],
  },
  characters: {
    behavior: [
      group(
        "先选说话的感觉",
        "表达方式、详略和主动性分别选取对应指令，一起影响新角色的日常回复。",
        [
          "defaultBehavior.expression",
          "defaultBehavior.verbosity",
          "defaultBehavior.initiative",
        ]
      ),
      group(
        "关系怎样推进，情绪怎样表达",
        "相处节奏决定按等级采用哪组关系阶段；情感表达决定表现克制还是丰富。",
        ["defaultBehavior.relationshipPace", "defaultBehavior.emotionIntensity"]
      ),
      group(
        "怎样称呼用户",
        "留空时让角色自然称呼；填写后作为新角色的默认称呼。",
        ["defaultBehavior.userNickname"]
      ),
      group(
        "用几句对话示范",
        "示例只示范说话方式，不会作为已经发生的聊天或用户事实。",
        ["defaultBehavior.examples"],
        true
      ),
    ],
    limits: [
      group(
        "角色资料允许保存多长",
        "这些是创建和编辑的输入上限；实际进入模型的字符数由资料提示预算另行控制。",
        [
          "limits.name",
          "limits.personality",
          "limits.appearance",
          "limits.interests",
          "limits.customPrompt",
        ]
      ),
      group(
        "相处方式与示例允许多长",
        "同时约束新角色默认设置和后续输入，不能让已有官方角色超出新限制。",
        ["limits.nickname", "limits.exampleLength", "limits.exampleCount"]
      ),
      group("用户偏好允许多长", "全局偏好、语言与长度偏好有各自的保存上限。", [
        "limits.globalPrompt",
        "limits.replyLanguage",
        "limits.replyLength",
      ]),
    ],
    prompts: [
      group(
        "创建后的会话叫什么",
        "用角色名替换 {{name}}，不会改动已有会话的名称。",
        ["conversationTitle"]
      ),
      group(
        "哪些资料进入回复",
        "资料可以保存多长由资料上限决定；这里决定有多少字符进入提示词。",
        ["promptBudgets"]
      ),
    ],
  },
  emotion: {
    scores: [
      group(
        "分数活动的区间",
        "互动先加减分，再限制在上下限之间；基线是长期恢复的目标。",
        ["minScore", "baseline", "maxScore"]
      ),
      group(
        "多久回到稳定状态",
        "恢复时间是指数恢复的时间尺度，并不是到点瞬间重置。",
        ["recoveryMs"]
      ),
      group(
        "冲突之后怎样延续受伤语气",
        "在持续时间内、分数仍低于受伤门槛时保留受伤语气。",
        ["hurtDurationMs", "hurtThreshold"]
      ),
    ],
    interaction: [
      group(
        "每类表达带来多少变化",
        "识别用户表达后使用对应加减分；这不是亲密度奖励。",
        ["deltas"]
      ),
      group(
        "什么分数显示开心或心动",
        "分数门槛影响心情展示；关心、受伤等状态还取决于互动原因。",
        ["thresholds"]
      ),
    ],
  },
  memory: {
    capacity: [
      group(
        "是否为后续聊天使用记忆",
        "关闭会停止新的自动提取与注入；不会在这里删除已有记录。",
        ["enabled"]
      ),
      group(
        "每个等级能记住多少",
        "容量是保存上限，召回是普通回复最多选取的条数；同一条规则持续生效到下一门槛。",
        ["levelRules"]
      ),
      group(
        "用户要求回忆时怎样选取",
        "可允许明确回忆请求使用完整容量；仍受召回文本预算约束。",
        ["recall"]
      ),
      group(
        "记忆怎样展示与编辑",
        "分类名称只影响展示；提取长度限制模型生成的单条记忆，编辑字数限制人工修改。",
        ["categories", "maxExtractedLength", "maxEditedLength"],
        true
      ),
    ],
    extraction: [
      group(
        "什么情况下尝试记住",
        "仅在成功聊天轮次后判断；首轮、明确要求和固定轮次任一满足就触发。",
        [
          "extraction.firstRound",
          "extraction.explicitRequests",
          "extraction.everyRounds",
        ]
      ),
      group(
        "从哪些内容提取多少条",
        "只取最近的消息，限制每次提取数量；不是每次都一定产生记忆。",
        ["extraction.sourceMessageLimit", "extraction.maxResults"]
      ),
      group(
        "提取任务使用的模型与生成预算",
        "模型留空时使用当前服务的默认模型。",
        ["extraction.models", "extraction.temperature", "extraction.maxTokens"],
        true
      ),
    ],
    summary: [
      group("是否整理长期摘要", "摘要与逐条事实记忆分别维护。", [
        "summary.enabled",
      ]),
      group(
        "整理时参考什么",
        "限制读取事实数量、消息数量、话题数和引用长度。",
        [
          "summary.factLimit",
          "summary.sourceMessageLimit",
          "summary.maxTopics",
          "summary.maxQuoteLength",
        ]
      ),
      group(
        "摘要输出预算",
        "Token 是模型输出预算，与保存字符长度分别计算。",
        ["summary.maxTokens"],
        true
      ),
    ],
    matching: [
      group(
        "这是一条新记忆，还是对旧记忆的补充？",
        "达到重复相似度则合并或强化；更正使用自己的相似度条件。",
        ["matching.duplicateThreshold", "matching.correctionThreshold"]
      ),
      group(
        "存入后有多重要",
        "新记忆在初始权重范围内取值，反复出现时按强化值提高。",
        [
          "matching.initialWeightMin",
          "matching.initialWeightMax",
          "matching.reinforcement",
        ]
      ),
    ],
    ranking: [
      group(
        "哪些记忆更值得带入本轮",
        "语义相关性与关键词、近期信息和重要性共同影响排序。",
        ["ranking"]
      ),
      group(
        "语义检索怎样执行",
        "模型和批次控制向量处理，权重影响语义得分。",
        ["semantic"],
        true
      ),
    ],
    jobs: [
      group(
        "每批处理多少任务",
        "处理批次与最大尝试次数共同限制任务负载。",
        ["jobs.batchSize", "jobs.maxAttempts"],
        true
      ),
      group(
        "处理失败后等多久重试",
        "重试上限不能小于首次重试间隔。",
        ["jobs.retryBaseMs", "jobs.retryMaxMs"],
        true
      ),
      group(
        "任务多久交给其他工作器",
        "租约避免多个工作器重复执行同一任务。",
        ["jobs.leaseMinimumMs", "jobs.leasePaddingMs"],
        true
      ),
    ],
  },
  proactive: {
    schedule: [
      group(
        "先决定是否开放这项功能",
        "平台关闭时任何用户都不会触发主动联系；平台开启后，仍需每位用户自行同意。",
        ["enabled"]
      ),
      group(
        "用户第一次开启时，采用怎样的安排",
        "这些是未保存偏好时的默认值；不会覆盖已有用户的选择。",
        [
          "defaults.proactiveMode",
          "defaults.timeZone",
          "defaults.frequencyDays",
          "defaults.quietStart",
          "defaults.quietEnd",
          "defaults.hidePrivatePreview",
        ]
      ),
      group(
        "用户可以把频率调到多少",
        "默认频率必须位于这个范围；用户已有频率若不在范围内也不会满足联系资格。",
        ["frequencyDays"]
      ),
      group(
        "刚聊过或刚联系过，至少等多久",
        "最小间隔独立于日历天频率；正在活跃聊天时也不会联系。",
        ["minimumGapMs"]
      ),
      group(
        "用户授权规则",
        "主动联系必须由用户明确开启，平台不能替用户默认同意。",
        ["defaults.proactiveEnabled"],
        true
      ),
    ],
    events: [
      group("围绕事件哪几天关心", "仅事件模式使用，依赖已记录的有效事件。", [
        "events",
      ]),
      group(
        "用户没回应时，怎样逐步减少打扰",
        "在用户频率基础上按未读数量指数延长，并受最大天数限制。",
        ["unreadBackoff"]
      ),
      group(
        "这次联系保留多久",
        "过期后不继续展示；实际投递展示窗口还会受到免打扰和本地日结束限制。",
        ["contactLifetimeMs"]
      ),
    ],
    delivery: [
      group(
        "怎样领取和发送一批联系",
        "推送超时必须小于租约，避免同一联系被重复领取。",
        ["batchSize", "tickMs", "leaseMs", "pushTimeoutMs"],
        true
      ),
      group(
        "发送失败或遇到免打扰后再等多久",
        "普通失败重试与免打扰重试分别计时。",
        ["retry"],
        true
      ),
      group(
        "客户端多久检查新联系",
        "这些间隔只影响发现速度，不绕过频率和免打扰判断。",
        ["client"],
        true
      ),
    ],
    copy: [
      group(
        "按实际发送场景编写通知",
        "普通通知由标题和场景正文组合；隐藏隐私时使用不含角色与事件变量的独立标题和正文。",
        ["templates"]
      ),
    ],
  },
  models: {
    chat: [
      group(
        "运营方提供哪家服务",
        "用户填写了 OpenRouter 密钥时优先使用自己的 OpenRouter；否则使用运营服务。",
        ["chat.provider", "chat.operatorBaseUrl"]
      ),
      group(
        "DeepSeek 使用的模型",
        "只在运营服务选择 DeepSeek 时使用。",
        ["chat.deepseekModel"],
        true
      ),
    ],
    image: [
      group(
        "运营方提供哪种图片服务",
        "fal 使用模型名，ComfyUI 使用地址和已绑定的工作流；用户自带 fal 密钥优先。",
        ["image.provider"]
      ),
      group("fal 的两种画面分别用什么模型", "自拍与合照分别调用对应模型。", [
        "image.falSelfie",
        "image.falCouple",
      ]),
      group(
        "ComfyUI 在哪里运行",
        "选择 ComfyUI 后还需要配置文生图和参考图工作流。",
        ["image.comfyuiBaseUrl"]
      ),
    ],
    voice: [
      group(
        "听懂用户发来的语音",
        "转写模型把上传录音转换成文字，仍需套餐转写权益或用户自己的密钥。",
        ["transcription"]
      ),
      group(
        "把角色回复读出来",
        "每个云端朗读服务有自己的模型；默认选哪个服务由播放体验设置。",
        ["tts"]
      ),
    ],
  },
  runtime: {
    chat: [
      group(
        "输入与回复有多长",
        "字符限制控制界面内容，Token 控制模型输出预算，两者分别生效。",
        ["chat.maxInputChars", "chat.maxOutputChars", "chat.maxTokens"]
      ),
      group(
        "生成方式与最长等待",
        "采样留空使用模型默认值；回复与排队各有超时。",
        [
          "chat.temperature",
          "chat.topP",
          "chat.deepseekThinking",
          "chat.replyTimeoutMs",
          "chat.queueTimeoutMs",
        ]
      ),
      group(
        "怎样分段送到用户眼前",
        "分段字符数不得超过回复上限，刷新轮询不得超过刷新间隔。",
        ["chat.segmentChars", "chat.flushMs", "chat.flushPollMs"]
      ),
      group(
        "后台并发与批次",
        "决定同一时间能执行多少任务，和套餐每日额度分别计算。",
        [
          "chat.localConcurrency",
          "chat.userConcurrency",
          "chat.burstMessages",
          "chat.batchSize",
        ],
        true
      ),
      group(
        "任务保活与调度",
        "心跳加轮询必须小于租约。",
        ["chat.leaseMs", "chat.heartbeatMs", "chat.pollMs", "chat.schedulerMs"],
        true
      ),
    ],
    image: [
      group(
        "图片生成和下载各等多久",
        "fal 与 ComfyUI 各用自己的生成时限；生成成功后还要下载图片。",
        [
          "image.falTimeoutMs",
          "image.comfyuiTimeoutMs",
          "image.downloadTimeoutMs",
        ]
      ),
      group(
        "结果和额度预留",
        "结果容量控制服务返回的图片，额度宽限用于生成期间的额度预留。",
        ["image.maxImageBytes", "image.reservationGraceMs"]
      ),
      group(
        "ComfyUI 的轮询与取消",
        "仅调整后台请求，不会改变用户输入的上传限制。",
        [
          "image.comfyuiRequestTimeoutMs",
          "image.comfyuiPollMs",
          "image.cancelTimeoutMs",
        ],
        true
      ),
    ],
    voice: [
      group("听和说分别等多久", "语音转写与朗读是两个任务，各有超时。", [
        "voice.transcriptionTimeoutMs",
        "voice.ttsTimeoutMs",
        "voice.ttsMaxChars",
      ]),
      group(
        "临时语音保留多久",
        "朗读音频与临时访问凭据分别过期。",
        ["voice.ttsRetentionMs", "voice.credentialTtlMs"],
        true
      ),
    ],
    maintenance: [
      group(
        "用户内容能恢复多久",
        "回收站角色按完整天数保留，过期后才进入清理。",
        ["maintenance.companionTrashRetentionMs"]
      ),
      group(
        "临时数据何时过期",
        "暂存素材、限流记录和生成任务各用自己的过期规则。",
        [
          "maintenance.stagedRetentionMs",
          "maintenance.rateWindowRetentionMs",
          "maintenance.generationTimeoutMs",
        ]
      ),
      group(
        "后台怎样执行清理",
        "批次、租约和重试控制工作器执行。",
        [
          "maintenance.tickMs",
          "maintenance.mediaBatchSize",
          "maintenance.mediaLeaseMs",
          "maintenance.mediaRetryBaseMs",
          "maintenance.mediaRetryMaxMs",
          "maintenance.mediaRetryMaxExponent",
        ],
        true
      ),
    ],
  },
  experience: {
    playback: [
      group(
        "默认先用谁朗读",
        "浏览器朗读在设备上执行；云端朗读需要相应权益与密钥。",
        ["playback.defaultProvider"]
      ),
      group("用户可选什么倍速", "默认倍速必须包含在可选列表中。", [
        "playback.speeds",
        "playback.defaultSpeed",
      ]),
      group(
        "浏览器声音的细节",
        "这些值用于浏览器朗读；不会替代云端服务的音色设置。",
        [
          "playback.browserRate",
          "playback.pitch",
          "playback.volume",
          "playback.defaultLanguage",
        ]
      ),
    ],
    feedback: [
      group("多短的录音允许发送", "需要同时不超过上传页的录音最大时长。", [
        "minimumRecordingSeconds",
      ]),
      group(
        "升级时提示停留多久",
        "只改变提示展示时间，不改变积分或升级门槛。",
        ["levelNoticeMs"]
      ),
    ],
    transport: [
      group("请求失败后怎样等和重试", "初始重试间隔不能超过最大间隔。", [
        "transport.requestTimeoutMs",
        "transport.retryBaseMs",
        "transport.retryMaxMs",
      ]),
      group(
        "怎样发现异步结果与断开的连接",
        "检查与心跳只影响连接体验，后台生成仍按自己的任务时限执行。",
        [
          "transport.observerPollMs",
          "transport.observerHeartbeatMs",
          "transport.clientPollMs",
        ],
        true
      ),
    ],
  },
  prompts: {
    chat: [
      group("始终生效的安全约束", "此处是纯指令，不包含模板变量。", [
        "chat.safetyClause",
      ]),
      group(
        "一次回复怎样拼装",
        "主模板必须保留全部必要变量，变量提供的内容不会被再次递归展开。",
        ["chat.system"]
      ),
      group(
        "本轮使用什么语言和长度",
        "语言与长度规则会作为变量内容拼入主模板。",
        [
          "chat.languageRule",
          "chat.defaultLanguage",
          "chat.lengthRule",
          "chat.turnLanguage",
        ]
      ),
    ],
    behavior: [
      group(
        "角色选择决定哪些表达指令",
        "表达、详略、主动性分别选取一段，并不把所有选项同时发送。",
        ["chat.expression", "chat.verbosity", "chat.initiative"]
      ),
      group(
        "当前情绪怎样改变语气",
        "语气、原因和情绪强度来自角色当前状态与相处设置。",
        ["chat.tone", "chat.cause", "chat.emotionIntensity"]
      ),
      group(
        "关系成长怎样改变相处",
        "先按角色的关系节奏选择一组，再按达到的最高等级门槛选一段。",
        ["chat.relationshipStages"]
      ),
    ],
    context: [
      group(
        "先确定一次请求的总预算",
        "各部分会在整体字符预算内组合和裁剪，不是各自都能额外占满总量。",
        ["context.total"]
      ),
      group(
        "给平台、历史和补充消息分配空间",
        "角色资料与记忆等还受各自预算约束，调整后请核对完整发布校验。",
        ["context.platform", "context.history", "context.followups"]
      ),
    ],
  },
  site: {
    links: [
      group("用户找你帮忙时去哪里", "这是支持入口，不是模型请求地址。", [
        "links.support",
      ]),
      group(
        "用户配置第三方服务时去哪里",
        "这些公开链接只提供导航，不会配置服务密钥。",
        [
          "links.openrouter",
          "links.openai",
          "links.fal",
          "links.elevenlabs",
          "links.fishaudio",
        ]
      ),
    ],
  },
};

export function visibleFieldGroup(
  section: SettingsSection,
  field: string,
  config: ProductConfig
) {
  if (section === "models") {
    if (field === "chat.deepseekModel")
      return config.models.chat.provider === "deepseek";
    if (/image\.fal/.test(field)) return config.models.image.provider === "fal";
    if (field === "image.comfyuiBaseUrl")
      return config.models.image.provider === "comfyui";
  }
  return true;
}
