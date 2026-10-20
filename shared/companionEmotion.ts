/** 以有方向的用户表达更新情绪，保留惯性和原因，离线只恢复而不惩罚。 */

/** 允许持久化的原因标签，避免状态和日志保存用户原文。 */
export type EmotionReason =
  "steady" | "affection" | "support" | "conflict" | "repair";
/** 角色的短期情绪；与长期关系积分分开。 */
export type CompanionEmotion = {
  tone: "calm" | "warm" | "concerned" | "hurt";
  reason: EmotionReason;
  score: number;
  updatedAt: string;
  /** 最近一次有意义情绪事件的时间，普通闲聊不延长受伤状态。 */
  eventAt: string;
};

/** 判断直接表达与生活压力；引用、否定和告别不按攻击处理。 */
export function classifyCompanionEmotion(text: string): EmotionReason {
  // 转述和假设不是用户正在对角色表达的态度。
  const direct = text
    .replace(/[“「『"].*?[”」』"]/g, "")
    .split(/[。！？!?；;\n]/)
    .filter(
      clause =>
        !/(?:如果|假如|假设|(?:他|她|你|朋友|同事).{0,8}(?:说|說)|\bif\b|\byou said\b|\b(?:he|she|friend)\b.{0,12}\bsaid\b)/i.test(
          clause
        )
    )
    .join("。")
    .trim();
  if (
    /对不起|抱歉|刚才.{0,12}(?:说重了|不该)|\b(?:sorry|apologi[sz]e)\b/i.test(
      direct
    )
  )
    return "repair";
  if (
    /(?:不|没|沒有|没有|不是).{0,8}(?:讨厌你|閉嘴|闭嘴|怪你|你的错)|\b(?:don'?t|do not|never)\s+(?:hate|miss|love) you\b|\b(?:don'?t|do not) want.{0,20}shut up\b/i.test(
      direct
    )
  )
    return "steady";
  if (
    /讨厌你|你(?:真是|就是|是个).{0,4}(?:废物|蠢货|混蛋)|(?:^|你)(?:给我)?闭嘴|\b(?:hate you|shut up|you(?:'re| are) (?:stupid|useless))\b/i.test(
      direct
    )
  )
    return "conflict";
  if (
    /累|难过|難過|失眠|睡不着|压力|壓力|焦虑|焦慮|心烦|好烦|工作.{0,10}烦|生病|\b(?:tired|stressed|anxious|lonely|sad|can'?t sleep)\b|疲れ|つらい|힘들|피곤/i.test(
      direct
    )
  )
    return "support";
  if (
    /(?<!不)(?:喜欢你|喜歡你|爱你|愛你|想你)|谢谢你|謝謝你|\b(?:love you|miss you|thank you)\b|大好き|ありがとう|사랑해|고마워/i.test(
      direct
    ) &&
    !/不(?:再)?(?:爱|愛|喜欢|喜歡)|\b(?:don'?t|do not|no longer)\s+love\b/i.test(
      direct
    )
  )
    return "affection";
  return "steady";
}

/** 在给定时间平滑恢复，再根据一条用户消息推进；不读取或写入数据库。 */
export function evolveCompanionEmotion(
  previous: CompanionEmotion | null | undefined,
  userText: string,
  now = new Date()
): CompanionEmotion {
  const age = previous
    ? Math.max(0, now.getTime() - Date.parse(previous.updatedAt))
    : 0;
  const elapsed = Number.isFinite(age) ? age : 0;
  const score =
    70 + ((previous?.score ?? 70) - 70) * Math.exp(-elapsed / 43_200_000);
  const reason = classifyCompanionEmotion(userText);
  const delta = {
    steady: 0,
    affection: 4,
    support: 0,
    conflict: -6,
    repair: 5,
  }[reason];
  const nextScore = Math.max(35, Math.min(95, score + delta));
  const eventAge = previous
    ? now.getTime() - Date.parse(previous.eventAt ?? previous.updatedAt)
    : Infinity;
  const lingering =
    previous &&
    eventAge < 7_200_000 &&
    previous.tone === "hurt" &&
    nextScore < 70;
  return {
    tone:
      reason === "support"
        ? "concerned"
        : reason === "conflict" || lingering
          ? "hurt"
          : reason === "affection" || reason === "repair"
            ? "warm"
            : "calm",
    reason: reason === "steady" && lingering ? "conflict" : reason,
    score: nextScore,
    updatedAt: now.toISOString(),
    eventAt:
      reason !== "steady"
        ? now.toISOString()
        : (previous?.eventAt ?? previous?.updatedAt ?? now.toISOString()),
  };
}
