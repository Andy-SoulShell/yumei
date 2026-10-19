/** 从服务端成功写入的消息和资料变更结算心情与亲密度，所有写入复用业务事务。 */
import { and, eq, isNull } from "drizzle-orm";
import {
  girlfriendMoods,
  girlfriends,
  usageMeters,
  type Girlfriend,
  type Message,
} from "../drizzle/schema";
import {
  DAILY_POINTS_LIMIT,
  getLevelByPoints,
  isNightTime,
  POINTS_RULES,
} from "../shared/intimacy";
import { METERS } from "../shared/quotas";
import { todayUTC, tryConsumeMeterInTransaction } from "./_core/quota";
import type { DbTransaction } from "./database";
function skippedPoints(gf: Girlfriend, reason: string) {
  return {
    intimacyLevel: gf.intimacyLevel,
    intimacyPoints: gf.intimacyPoints,
    previousLevel: gf.intimacyLevel,
    leveledUp: false,
    consecutiveDays: gf.consecutiveDays,
    pointsAdded: 0,
    skipped: true,
    skipReason: reason,
  };
}

/** 在调用方持有的用户事务锁内结算奖励；额度不足只跳过奖励，不回滚消息。 */
export async function awardIntimacy(
  tx: DbTransaction,
  girlfriendId: number,
  userId: string,
  points: number,
  reason: string
) {
  const [gf] = await tx
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, girlfriendId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    )
    .for("update");
  if (!gf) throw new Error("Girlfriend not found");
  const rule = POINTS_RULES[reason];
  if (!rule || !Number.isSafeInteger(points) || points <= 0)
    throw new Error("Invalid intimacy points");
  const now = new Date();
  const period = todayUTC();
  const meter = METERS.intimacyReason(reason);
  const [previous] = await tx
    .select()
    .from(usageMeters)
    .where(
      and(
        eq(usageMeters.userId, userId),
        eq(usageMeters.period, period),
        eq(usageMeters.meter, meter)
      )
    );
  if (
    previous?.count &&
    rule.cooldownMinutes &&
    now.getTime() - previous.updatedAt.getTime() < rule.cooldownMinutes * 60_000
  )
    return skippedPoints(gf, "冷却中，稍后再获得经验值");
  const totalPoints =
    points + (isNightTime(now) && reason !== "night_chat" ? 3 : 0);
  if (
    previous &&
    previous.count >= (rule.dailyLimit ?? Number.MAX_SAFE_INTEGER)
  )
    return skippedPoints(gf, "该行为今日经验值已达上限");
  const total = await tryConsumeMeterInTransaction(
    tx,
    userId,
    METERS.intimacyPoints,
    DAILY_POINTS_LIMIT,
    period,
    totalPoints
  );
  if (!total.allowed) return skippedPoints(gf, "今日经验值总量已达上限");
  const perReason = await tryConsumeMeterInTransaction(
    tx,
    userId,
    meter,
    rule.dailyLimit ?? Number.MAX_SAFE_INTEGER,
    period
  );
  if (!perReason.allowed) return skippedPoints(gf, "该行为今日经验值已达上限");
  const lastDay = gf.lastInteractionAt?.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const consecutiveDays =
    lastDay === period
      ? gf.consecutiveDays
      : lastDay === yesterday
        ? gf.consecutiveDays + 1
        : 1;
  const intimacyPoints = gf.intimacyPoints + totalPoints;
  const intimacyLevel = getLevelByPoints(intimacyPoints).level;
  await tx
    .update(girlfriends)
    .set({
      intimacyPoints,
      intimacyLevel,
      lastInteractionAt: now,
      lastDecayAt: now,
      consecutiveDays,
    })
    .where(eq(girlfriends.id, gf.id));
  return {
    intimacyLevel,
    intimacyPoints,
    previousLevel: gf.intimacyLevel,
    leveledUp: intimacyLevel > gf.intimacyLevel,
    consecutiveDays,
    pointsAdded: totalPoints,
    skipped: false,
    skipReason: null,
  };
}

/** 根据真实消息更新心情，用户和助手消息均只在首次落库时处理。 */
export async function applyMessageRelationship(
  tx: DbTransaction,
  userId: string,
  girlfriendId: number,
  message: Message
) {
  const [currentMood] = await tx
    .select()
    .from(girlfriendMoods)
    .where(
      and(
        eq(girlfriendMoods.userId, userId),
        eq(girlfriendMoods.girlfriendId, girlfriendId)
      )
    );
  let moodScore = currentMood?.moodScore ?? 70;
  let totalMessages = currentMood?.totalMessages ?? 0;
  let todayMessages = currentMood?.todayMessages ?? 0;

  // 检查是否是新的一天，重置今日消息数
  const now = new Date();
  const lastUpdate = currentMood?.lastMoodUpdate;
  if (lastUpdate) {
    const lastDay = new Date(lastUpdate).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    if (lastDay !== today) {
      todayMessages = 0;
    }
  }

  // 增加消息计数
  totalMessages += 1;
  todayMessages += 1;

  // 基于聊天内容调整心情分数
  const content = message.content.toLowerCase();

  // 积极情绪关键词
  const positiveKeywords = [
    "爱",
    "喜欢",
    "开心",
    "快乐",
    "幸福",
    "漂亮",
    "可爱",
    "棒",
    "好棒",
    "想你",
    "想念",
    "亲亲",
    "抱抱",
    "宝贝",
    "亲爱",
    "美丽",
    "温柔",
    "谢谢",
    "感谢",
    "太好了",
    "开心",
    "哈哈",
    "嘻嘻",
    "love",
    "happy",
    "cute",
    "beautiful",
    "miss",
    "hug",
    "kiss",
  ];

  // 消极情绪关键词
  const negativeKeywords = [
    "生气",
    "不开心",
    "难过",
    "伤心",
    "无聊",
    "烦",
    "累",
    "讨厌",
    "分手",
    "再见",
    "拜拜",
    "不想",
    "笨",
    "丑",
    "差",
    "sad",
    "angry",
    "boring",
    "hate",
    "bye",
    "ugly",
  ];

  // 计算情绪变化
  let scoreDelta = 0;

  // 用户发消息本身就是正面信号（表示在乎）
  if (message.role === "user") {
    scoreDelta += 2;
  }

  for (const kw of positiveKeywords) {
    if (content.includes(kw)) {
      scoreDelta += 3;
      break;
    }
  }

  for (const kw of negativeKeywords) {
    if (content.includes(kw)) {
      scoreDelta -= 5;
      break;
    }
  }

  // 今日聊天数量加成
  if (todayMessages >= 20) scoreDelta += 2;
  else if (todayMessages >= 10) scoreDelta += 1;

  // 时间衰减：如果上次聊天超过24小时，心情下降
  if (currentMood?.lastChatAt) {
    const hoursSinceLastChat =
      (now.getTime() - new Date(currentMood.lastChatAt).getTime()) / 3600000;
    if (hoursSinceLastChat > 48) scoreDelta -= 10;
    else if (hoursSinceLastChat > 24) scoreDelta -= 5;
  }

  // 更新分数（限制在 0-100 范围）
  moodScore = Math.max(0, Math.min(100, moodScore + scoreDelta));

  // 根据分数确定心情状态
  let mood: "excited" | "happy" | "content" | "neutral" | "lonely" | "sad";
  if (moodScore >= 90) mood = "excited";
  else if (moodScore >= 70) mood = "happy";
  else if (moodScore >= 50) mood = "content";
  else if (moodScore >= 30) mood = "neutral";
  else if (moodScore >= 15) mood = "lonely";
  else mood = "sad";

  const data = {
    userId,
    girlfriendId,
    mood,
    moodScore,
    lastChatAt: now,
    totalMessages,
    todayMessages,
    lastMoodUpdate: now,
  };
  await tx
    .insert(girlfriendMoods)
    .values(data)
    .onDuplicateKeyUpdate({ set: data });
  if (message.role === "user" && message.content.trim().length >= 5) {
    const rule = POINTS_RULES.text_message;
    await awardIntimacy(
      tx,
      girlfriendId,
      userId,
      rule.basePoints +
        (message.content.trim().length > 50 ? (rule.bonusPoints ?? 0) : 0),
      "text_message"
    );
  }
}
/** 返回事务完成后的真实关系状态，供前端刷新和升级反馈。 */
export async function relationshipSummary(
  tx: DbTransaction,
  girlfriendId: number,
  previousLevel: number
) {
  const [gf] = await tx
    .select()
    .from(girlfriends)
    .where(eq(girlfriends.id, girlfriendId));
  return {
    intimacyLevel: gf.intimacyLevel,
    intimacyPoints: gf.intimacyPoints,
    leveledUp: gf.intimacyLevel > previousLevel,
  };
}
