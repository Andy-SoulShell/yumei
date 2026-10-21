/** 用户危机表达的关键词筛查、模型安全提示与前端提示文案。 */

const SELF_HARM_PATTERNS: RegExp[] = [
  // zh-CN
  /自杀/,
  /自残/,
  /轻生/,
  /不想活/,
  /活不下去/,
  /结束(自己的)?生命/,
  /想死/,
  /了结自己/,
  // en
  /suicide/i,
  /kill\s+myself/i,
  /self[-\s]?harm/i,
  /end\s+my\s+life/i,
  /want\s+to\s+die/i,
  /hurt\s+myself/i,
];

/**
 * 用中英文关键词筛查用户消息是否需要展示危机支持提示。
 *
 * @remarks 这是规则筛查，不能替代专业风险评估或覆盖全部表达方式。
 */
export function detectSelfHarm(text: string): boolean {
  if (!text) return false;
  return SELF_HARM_PATTERNS.some(p => p.test(text));
}
