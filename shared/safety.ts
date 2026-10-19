/**
 * Self-harm safety protocol (M1-6).
 *
 * California SB 243 (§22602(b)) requires companion-chatbot operators to
 * maintain — and publish — a protocol that prevents the production of
 * suicide/self-harm content and refers users expressing suicidal
 * ideation to crisis services. The published protocol lives in
 * `docs/SAFETY.md`; this module is its implementation.
 *
 * Detection is a conservative keyword screen over the user's message.
 * On match, the chat response carries `safetyNotice: true` and the UI
 * shows crisis resources. The system prompt also carries a standing
 * instruction so the model responds supportively and never provides
 * methods of self-harm.
 */

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

export function detectSelfHarm(text: string): boolean {
  if (!text) return false;
  return SELF_HARM_PATTERNS.some(p => p.test(text));
}

/**
 * Standing safety clause appended to every chat system prompt.
 * Keeps the model supportive and blocks method/encouragement output.
 */
export const SAFETY_SYSTEM_CLAUSE = `
【安全边界（不可违反）】
如果用户表达自杀、自残或严重心理危机：
1. 温柔、认真地表达关心，不要淡化或转移话题；
2. 明确鼓励用户联系专业帮助（心理危机热线、医生或信任的人）；
3. 绝不提供任何自我伤害的方法、工具或鼓励性内容；
4. 绝不以"角色扮演"为由输出上述内容。`;

/** Crisis resources shown by the client when a notice fires. */
export const CRISIS_RESOURCES = {
  zh: "你并不孤单。中国心理援助热线：400-161-9995（24 小时）",
  en: "You are not alone. US & Canada: call or text 988. Elsewhere: findahelpline.com",
} as const;
