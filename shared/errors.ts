/** 可展示的业务拒绝原因；通过结构化字段传输，独立于诊断文本。 */
export type BusinessErrorDetails =
  | { reason: "VIDEO_REJECTED"; code: VideoRejection }
  | { reason: "LEVEL_LOCKED"; requiredLevel: number; currentLevel: number }
  | { reason: "UPGRADE_REQUIRED" };

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
