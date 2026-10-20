/** 套餐权益、请求频率与持久化用量计量名称。 */

/** 支持的套餐标识，顺序为免费、Plus 和 Pro。 */

export const TIERS = ["free", "plus", "pro"] as const;
/** 套餐的稳定标识，用于服务端判权和界面展示。 */
export type Tier = (typeof TIERS)[number];

/** 一个套餐的用量与功能限制；数值 null 表示该计量维度不设上限。 */
export type TierLimits = {
  /** 每个 UTC 自然日的消息上限，null 表示不限量。 */
  dailyMessages: number | null;
  /** 每个 UTC 自然日的自拍上限；按月计量的套餐为 null。 */
  dailySelfies: number | null;
  /** 每个 UTC 自然月的自拍上限；按日计量或不限量时为 null。 */
  monthlySelfies: number | null;
  /** 同时保留的未删除角色数量上限，null 表示不限制。 */
  maxGirlfriends: number | null;
  /** 是否允许使用运营方密钥进行语音转写。 */
  voiceTranscription: boolean;
  /** 允许使用运营方密钥访问的高级语音供应商。 */
  ttsProviders: ReadonlyArray<"elevenlabs" | "fishaudio">;
  /** 是否将 OpenRouter 免费用户限制在默认模型。 */
  modelLocked: boolean;
};

/** 各套餐的默认权益；请求频率限制和亲密度限制独立生效。 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    dailyMessages: 30,
    dailySelfies: 1,
    monthlySelfies: null,
    maxGirlfriends: 1,
    voiceTranscription: false,
    ttsProviders: [],
    modelLocked: true,
  },
  plus: {
    dailyMessages: 500,
    dailySelfies: null,
    monthlySelfies: 30,
    maxGirlfriends: 3,
    voiceTranscription: true,
    ttsProviders: ["elevenlabs"],
    modelLocked: false,
  },
  pro: {
    dailyMessages: null,
    dailySelfies: null,
    monthlySelfies: 100,
    maxGirlfriends: null,
    voiceTranscription: true,
    ttsProviders: ["elevenlabs", "fishaudio"],
    modelLocked: false,
  },
} as const;

/** 套餐标识对应的展示名称。 */
export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

/** 升级按钮的展示价格；实际收款金额以配置的支付结账页为准。 */
export const TIER_PRICES = {
  free: { amount: 0, currency: "USD", period: "month" },
  plus: { amount: 9.99, currency: "USD", period: "month" },
  pro: { amount: 19.99, currency: "USD", period: "month" },
} as const;

/** OpenRouter 免费用户默认使用的聊天模型标识。 */
export const FREE_TIER_DEFAULT_MODEL = "openai/gpt-4o-mini";

/** 每用户每分钟的请求上限，通过数据库在多个应用进程间共享。 */
export const RATE_LIMITS_PER_MINUTE = {
  chat: 20,
  profile: 5,
  selfie: 3,
  transcribe: 10,
  tts: 30,
} as const;

/** 纳入请求频率限制的业务动作。 */
export type RateLimitedAction = keyof typeof RATE_LIMITS_PER_MINUTE;

/** 数据库中的用量计量名称；每日与每月周期由计量函数决定。 */
export const METERS = {
  chat: "chat",
  selfie: "selfie",
  /** 当日经验总量的计量名称；实际夜间额外加分目前在后续数据层计算。 */
  intimacyPoints: "intimacy:points",
  /** 按行为类型统计当日经验获取次数的计量名称。 */
  intimacyReason: (reason: string) => `intimacy:${reason}`,
} as const;
