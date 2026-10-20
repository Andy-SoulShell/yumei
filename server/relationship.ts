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
import { evolveCompanionEmotion } from "../shared/companionEmotion";
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

/** 短消息和奖励受限时仍保留真实互动，已有经验不因离线减少。 */
async function recordInteraction(
  tx: DbTransaction,
  girlfriendId: number,
  userId: string,
  now: Date
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
  const period = now.toISOString().slice(0, 10);
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
  const changes = {
    lastInteractionAt: now,
    consecutiveDays,
  };
  await tx.update(girlfriends).set(changes).where(eq(girlfriends.id, gf.id));
  return { ...gf, ...changes };
}

/** 在调用方持有的用户事务锁内结算互动与奖励；额度不足只跳过奖励。 */
export async function awardIntimacy(
  tx: DbTransaction,
  girlfriendId: number,
  userId: string,
  points: number,
  reason: string
) {
  const rule = POINTS_RULES[reason];
  if (!rule || !Number.isSafeInteger(points) || points <= 0)
    throw new Error("Invalid intimacy points");
  const now = new Date();
  const gf = await recordInteraction(tx, girlfriendId, userId, now);
  const period = todayUTC();
  const meter = METERS.intimacyReason(girlfriendId, reason);
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
    METERS.intimacyPoints(girlfriendId),
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
  const intimacyPoints = gf.intimacyPoints + totalPoints;
  const intimacyLevel = getLevelByPoints(intimacyPoints).level;
  await tx
    .update(girlfriends)
    .set({
      intimacyPoints,
      intimacyLevel,
    })
    .where(eq(girlfriends.id, gf.id));
  return {
    intimacyLevel,
    intimacyPoints,
    previousLevel: gf.intimacyLevel,
    leveledUp: intimacyLevel > gf.intimacyLevel,
    consecutiveDays: gf.consecutiveDays,
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

  // 助手消息只计数，不解释助手自己的话或触发情绪恢复。
  const emotionState =
    message.role === "user"
      ? evolveCompanionEmotion(currentMood?.emotionState, message.content, now)
      : (currentMood?.emotionState ?? null);
  moodScore = Math.round(emotionState?.score ?? moodScore);
  const mood =
    emotionState?.tone === "hurt"
      ? ("sad" as const)
      : emotionState?.tone === "concerned"
        ? ("neutral" as const)
        : moodScore >= 90
          ? ("excited" as const)
          : moodScore >= 70
            ? ("happy" as const)
            : ("content" as const);
  const data = {
    userId,
    girlfriendId,
    mood,
    moodScore,
    emotionState,
    lastChatAt:
      message.role === "user" ? now : (currentMood?.lastChatAt ?? null),
    totalMessages,
    todayMessages,
    lastMoodUpdate:
      message.role === "user" ? now : (currentMood?.lastMoodUpdate ?? now),
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
  } else if (message.role === "user") {
    await recordInteraction(tx, girlfriendId, userId, now);
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
