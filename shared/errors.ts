/** 可展示的业务拒绝原因；通过结构化字段传输，独立于诊断文本。 */
export type BusinessErrorDetails =
  | { reason: "LEVEL_LOCKED"; requiredLevel: number; currentLevel: number }
  | { reason: "UPGRADE_REQUIRED" };
