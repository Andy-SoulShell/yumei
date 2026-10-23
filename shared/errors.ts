/** 可展示的业务拒绝原因；通过结构化字段传输，独立于诊断文本。 */
export type CommerceRejection =
  | "verifyEmail"
  | "checkoutUnavailable"
  | "referralInvalid"
  | "referralIneligible"
  | "referralLinked"
  | "handleTaken"
  | "profileRequired"
  | "sourceChanged"
  | "payoutMinimum"
  | "payoutPending"
  | "payoutUnavailable"
  | "reviewChanged"
  | "publicationUnavailable";
export type BusinessErrorDetails =
  | { reason: "COMMERCE_REJECTED"; code: CommerceRejection }
  | { reason: "VIDEO_REJECTED"; code: VideoRejection }
  | { reason: "LEVEL_LOCKED"; requiredLevel: number; currentLevel: number }
  | { reason: "UPGRADE_REQUIRED" }
  | { reason: "INSUFFICIENT_COINS"; required: number; balance: number }
  | {
      reason: "QUOTA_EXCEEDED";
      meter: string;
      period: "day" | "month";
      limit: number;
      resetAt: string;
    }
  | { reason: "RATE_LIMITED"; retryAt: string | null }
  | { reason: "CONCURRENCY_LIMIT" }
  | { reason: "FOLLOWUP_LIMIT" };

/** 视频界面错误的语义标识，不依赖服务端诊断文案。 */
export type VideoRejection =
  | "disabledError"
  | "inputError"
  | "busyError"
  | "referenceError"
  | "quotaError"
  | "unavailableError"
  | "submittedError"
  | "requestConflictError";
