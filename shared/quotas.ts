/** 持久化用量计量名称；运行规则来自业务配置 API。 */
export type { Tier, TierLimits, RateLimitedAction } from "./productConfig";

/** 数据库中的用量计量名称；每日与每月周期由计量函数决定。 */
export const METERS = {
  chat: "chat",
  selfie: "selfie",
  /** 当日经验总量的计量名称；实际夜间额外加分目前在后续数据层计算。 */
  intimacyPoints: (girlfriendId: number) => `intimacy:${girlfriendId}:points`,
  /** 按行为类型统计当日经验获取次数的计量名称。 */
  intimacyReason: (girlfriendId: number, reason: string) =>
    `intimacy:${girlfriendId}:${reason}`,
} as const;
