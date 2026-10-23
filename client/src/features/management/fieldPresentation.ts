/** 表单展示单位不改变存储单位；边界始终来自共享契约。 */
import type { FormSchema } from "./ConfigForm";

export type ValueUnit = { label: string; factor: number };
const timeUnits: ValueUnit[] = [
  { label: "毫秒", factor: 1 },
  { label: "秒", factor: 1000 },
  { label: "分钟", factor: 60000 },
  { label: "小时", factor: 3600000 },
  { label: "天", factor: 86400000 },
];
const sizeUnits: ValueUnit[] = [
  { label: "B", factor: 1 },
  { label: "KiB", factor: 1024 },
  { label: "MiB", factor: 1048576 },
];
const unit = (label: string, factor = 1): ValueUnit[] => [{ label, factor }];
export function valueUnits(path: string, currency?: string): ValueUnit[] {
  const key = path.split(".").at(-1)!;
  if (/Ms$/.test(key) || path === "intimacy.rules.voice_message.bonusThreshold")
    return timeUnits;
  if (/Bytes$/.test(key)) return sizeUnits;
  if (path.startsWith("billing.economy.")) {
    if (key.endsWith("Cents")) return unit("美分");
    if (key === "creatorShareBps") return unit("基点");
    if (key === "creatorHoldDays") return unit("天");
    if (key === "coinsPerUsd")
      return unit("历史迁移参数；新收益按订单实付金额结算");
    return unit("金币");
  }
  if (/Seconds$/.test(key)) return unit("秒");
  if (/Minutes$/.test(key)) return unit("分钟");
  if (/Days$/.test(key) || /^proactive\.frequencyDays\./.test(path))
    return unit("天");
  if (/Hour$/.test(key)) return unit("时");
  if (/quiet(Start|End)$/.test(key)) return unit("本地时间");
  if (key === "amount") return unit(currency || "货币单位");
  if (key === "hue") return unit("°");
  if (key === "sampleRate") return unit("Hz");
  if (/^(frameMultiple|frameRemainder|minFrames)$/.test(key)) return unit("帧");
  if (key === "age") return unit("岁");
  if (key === "sortOrder") return unit("序号");
  if (/^billing\.rateLimits\./.test(path)) return unit("次 / 分钟");
  if (/Messages$/.test(key)) return unit("条 / 天");
  if (key === "dailySelfies") return unit("张 / 天");
  if (key === "monthlySelfies") return unit("张 / 月");
  if (key === "maxGirlfriends") return unit("个角色");
  if (key === "temperature") return unit("系数");
  if (
    /browserRate|defaultSpeed|pitch|affinityMultiplier/.test(key) ||
    /^experience\.playback\.speeds\./.test(path)
  )
    return unit("倍");
  if (
    /^(topP|volume|duplicateThreshold|correctionThreshold|freshnessFloor)$/.test(
      key
    )
  )
    return unit("%", 0.01);
  if (
    /^emotion\./.test(path) ||
    /Points$/.test(key) ||
    key === "dailyPointsLimit"
  )
    return unit("分");
  if (key === "dailyLimit" || key === "dailyTaskLimit") return unit("次 / 天");
  if (key === "minLevel" || key === "level") return unit("级");
  if (/maxTokens$/.test(key)) return unit("token");
  if (path === "intimacy.rules.daily_first.bonusThreshold")
    return unit("连续天数");
  if (path === "intimacy.rules.long_conversation.bonusThreshold")
    return unit("轮对话");
  if (path === "intimacy.rules.text_message.bonusThreshold")
    return unit("字符");
  if (/bonusThreshold$/.test(key)) return unit("阈值");
  if (
    /^(weight|initialWeightMin|initialWeightMax|reinforcement|affinityMax|pinnedBonus)$/.test(
      key
    )
  )
    return unit("权重点");
  if (/Concurrency$/.test(key)) return unit("个任务");
  if (key === "everyRounds") return unit("轮对话");
  if (/^(sourceMessageLimit|burstMessages)$/.test(key)) return unit("条消息");
  if (/^(capacity|recallCount|factLimit|maxResults)$/.test(key))
    return unit("条记忆");
  if (
    (/^characters\.limits\./.test(path) && key !== "exampleCount") ||
    /^characters\.promptBudgets\.|^prompts\.context\./.test(path) ||
    /Chars$|Length$/.test(key)
  )
    return unit("字符");
  if (key === "maxAttempts") return unit("次");
  if (/Exponent$/.test(key)) return unit("次幂");
  if (path === "proactive.unreadBackoff.base") return unit("倍");
  if (
    /^(batchSize|mediaBatchSize|sampleSize|fishPageSize|exampleCount|maxTopics|pageSize|homeCharacterLimit|recentCharacters|notifications|conversations|messages|search)$/.test(
      key
    )
  )
    return unit(key === "exampleCount" ? "组对话" : "项");
  return [];
}
export function defaultUnit(path: string, value: number, units: ValueUnit[]) {
  if (/companionTrashRetentionMs|pastDueGraceMs$/.test(path))
    return units.at(-1)!;
  if (
    /Ms$/.test(path) ||
    path === "intimacy.rules.voice_message.bonusThreshold"
  )
    return (
      units
        .slice(1)
        .reverse()
        .find(item => value >= item.factor && value % item.factor === 0) ??
      units[value > 0 && value < 1000 ? 0 : 1]
    );
  if (/Bytes$/.test(path))
    return (
      [...units]
        .reverse()
        .find(item => value > 0 && value % item.factor === 0) ?? units[0]
    );
  return units[0] ?? { label: "数值", factor: 1 };
}
/** 十进制按整数存储单位精确换算，不把真实的小数或指数输入四舍五入成有效值。 */
export function storedNumber(value: string, factor: number, integer: boolean) {
  if (!value.trim()) return NaN;
  const result = factor === 0.01 ? Number(value) / 100 : Number(value) * factor;
  if (!integer || !Number.isFinite(result) || !Number.isInteger(factor))
    return result;
  const match = value.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match || !(match[2] || match[3])) return NaN;
  const exponent = Number(match[4] ?? 0),
    digits = match[2] + (match[3] ?? "");
  if (digits.length > 400 || Math.abs(exponent) > 400)
    return Number.isInteger(result) ? NaN : result;
  const power = (match[3]?.length ?? 0) - exponent;
  let numerator = BigInt(digits) * BigInt(factor);
  if (match[1] === "-") numerator = -numerator;
  if (power > 0) {
    const divisor = BigInt("1" + "0".repeat(power));
    if (numerator % divisor !== BigInt(0))
      return Number.isInteger(result) ? NaN : result;
    return Number(numerator / divisor);
  }
  return Number(numerator * BigInt("1" + "0".repeat(-power)));
}
export const displayedNumber = (value: number, factor: number) =>
  Number.isFinite(value)
    ? String(Number((value / factor).toPrecision(15)))
    : "";
export function numericError(value: number, s: FormSchema): string | undefined {
  if (!Number.isFinite(value)) return "请填写有效数值";
  if (s.type === "integer" && !Number.isInteger(value))
    return "必须精确到完整的存储单位，不能填写小数";
  if (
    (s.minimum !== undefined && value < s.minimum) ||
    (s.exclusiveMinimum !== undefined && value <= s.exclusiveMinimum)
  )
    return "低于允许范围，请参考下方范围";
  if (
    (s.maximum !== undefined && value > s.maximum) ||
    (s.exclusiveMaximum !== undefined && value >= s.exclusiveMaximum)
  )
    return "高于允许范围，请参考下方范围";
  if (
    s.multipleOf &&
    Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-8
  )
    return "不符合调整步长，请参考下方说明";
}
export function numericRange(s: FormSchema, u: ValueUnit, units: ValueUnit[]) {
  const format = (value: number) => {
    const shown = value / u.factor;
    const alternative =
      shown !== 0 && Math.abs(shown) < 0.001
        ? [...units].reverse().find(item => Math.abs(value / item.factor) >= 1)
        : undefined;
    const chosen = alternative ?? u;
    return `${displayedNumber(value, chosen.factor)} ${chosen.label}`;
  };
  const lower = s.minimum ?? s.exclusiveMinimum;
  const upper = s.maximum ?? s.exclusiveMaximum;
  return [
    lower === undefined
      ? ""
      : `${s.exclusiveMinimum !== undefined ? "大于" : "最少"} ${format(lower)}`,
    upper === undefined
      ? ""
      : `${s.exclusiveMaximum !== undefined ? "小于" : "最多"} ${format(upper)}`,
    s.multipleOf
      ? `每次 ${format(s.multipleOf)}`
      : s.type === "integer"
        ? `精确到 1 ${units[0]?.label ?? u.label}`
        : "支持小数",
  ]
    .filter(Boolean)
    .join(" · ");
}
export function nullableLabel(path: string) {
  if (/billing\.plans\.\d+\.limits\.|dailyLimit$/.test(path)) return "不限量";
  if (/checkoutUrl|lemonVariantId/.test(path)) return "未关联支付";
  if (/temperature|topP/.test(path)) return "使用模型默认值";
  if (/bonusThreshold/.test(path)) return "不使用额外奖励阈值";
  if (/comfyuiBaseUrl$/.test(path)) return "未配置 ComfyUI 服务";
  if (/BaseUrl$/.test(path)) return "使用默认服务地址";
  if (/(?:[Mm]odel|openrouter|deepseek)$/.test(path)) return "使用服务默认模型";
  return "未设置";
}
export function fieldHint(path: string): string | undefined {
  if (path === "proactive.defaults.proactiveEnabled")
    return "保持关闭；主动联系只能由用户在自己的偏好中明确开启。";
  if (path.startsWith("prompts.")) {
    const fixed: Record<string, string[]> = {
      "prompts.chat.system": [
        "characterData",
        "expression",
        "verbosity",
        "initiative",
        "relationship",
        "tone",
        "cause",
        "emotionIntensity",
        "styleData",
        "preferencesData",
        "languageRule",
        "lengthRule",
        "memoryState",
      ],
      "prompts.chat.languageRule": ["language"],
      "prompts.chat.lengthRule": ["length"],
      "prompts.chat.turnLanguage": ["language"],
      "prompts.image.reference": ["scene"],
      "prompts.image.text": ["scene", "appearance"],
      "prompts.image.couple": ["scene"],
      "prompts.extraction": ["maxLength"],
      "prompts.memoryContext": ["records"],
    };
    if (fixed[path])
      return `必须保留且只能使用这些变量：${fixed[path].map(name => `{{${name}}}`).join("、")}`;
    if (!/^prompts\.(quickTemplates|context)\./.test(path))
      return "纯文本指令，不使用模板变量；保存前会验证必需内容。";
  }
  if (path.startsWith("proactive.templates."))
    return /private(Title|Preview)/.test(path)
      ? "隐私文案不能包含角色、记忆或事件变量。"
      : "可使用 {{name}}、{{memory}}、{{eventDay}}；其他变量会阻止保存。";
  if (/timeZone$/.test(path))
    return "使用 IANA 时区，例如 Asia/Shanghai；时段均按此时区解释。";
  if (/quiet(Start|End)$/.test(path))
    return "00:00–23:59，精确到分钟；起止相同表示关闭免打扰，支持跨午夜。";
  if (/^billing\.rateLimits\./.test(path))
    return "每个用户每分钟的请求上限；0 表示禁止该类请求。";
  if (
    /billing\.plans\.\d+\.limits\.(dailyMessages|dailySelfies|monthlySelfies|maxGirlfriends)$/.test(
      path
    )
  )
    return /Selfies$/.test(path)
      ? "0 表示不提供图片额度；按日与按月互斥，不限量不使用周期额度。"
      : "0 表示不提供此项额度；选择不限量时不限制使用数量。";
  if (path === "billing.pastDueGraceMs") return "0 表示不提供欠费宽限。";
  if (/^intimacy\.rules\..+\.bonusThreshold$/.test(path))
    return "额外奖励按实际规则触发；语音按时长、文字按字符数、连续登录按天、长对话按轮数判断。";
  if (/topP$/.test(path))
    return "采样概率，必须大于 0%；留空选项表示使用模型默认值。";
  if (/currency$/.test(path))
    return "ISO 4217 货币代码；金额按所选币种计价，不自动换汇。";
  if (/lemonVariantId$/.test(path))
    return "仅填写数字；长 ID 按文本保留，避免精度丢失。";
  if (/companionTrashRetentionMs$/.test(path))
    return "仅支持整天；到期后回收站中的角色会被清理。";
  if (/defaultLanguage$/.test(path) && path.startsWith("experience."))
    return "朗读语言代码，例如 zh-CN、en-US、ja-JP。";
  if (/minimumRecordingSeconds$/.test(path))
    return "不能大于上传规则中的最长录音时长。";
}
export function textKind(
  path: string
): "url" | "timezone" | "currency" | "text" {
  if (/timeZone$/.test(path)) return "timezone";
  if (/currency$/.test(path)) return "currency";
  if (
    (/Url$/.test(path) && !/imageUrl$/.test(path)) ||
    /^site\.links\./.test(path)
  )
    return "url";
  return "text";
}
export function textError(value: string, s: FormSchema, path: string) {
  if (s.minLength !== undefined && value.trim().length < s.minLength)
    return `至少填写 ${s.minLength} 个字符`;
  if (s.maxLength !== undefined && value.length > s.maxLength)
    return `最多填写 ${s.maxLength} 个字符`;
  if (s.pattern && !new RegExp(s.pattern).test(value))
    return "格式不正确，请检查填写内容";
  if (textKind(path) === "url") {
    try {
      const url = new URL(value);
      if (
        url.username ||
        url.password ||
        !(
          path.startsWith("models.") ? ["https:", "http:"] : ["https:"]
        ).includes(url.protocol)
      )
        return "请填写无账号密码的有效地址；公开链接使用 HTTPS";
    } catch {
      return "请填写完整的有效地址";
    }
  }
  if (textKind(path) === "timezone") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
    } catch {
      return "请选择或填写有效的 IANA 时区";
    }
  }
}
