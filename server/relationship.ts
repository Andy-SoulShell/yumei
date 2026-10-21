/** 从服务端成功写入的消息和资料变更结算心情与亲密度，所有写入复用业务事务。 */
import { and, eq, isNull } from "drizzle-orm";
import {
  girlfriendMoods,
  girlfriends,
  usageMeters,
  type Girlfriend,
  type Message,
} from "../drizzle/schema";
import { getLevelByPoints, isNightTime } from "../shared/intimacy";
import type { RewardAction } from "../shared/productConfig";
import { getPublishedProductConfig } from "./repositories/productConfig";
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

/** 事件上下文只包含可验证的事实，不接收客户端传入的奖励数值。 */
export type RewardContext = {
  textLength?: number;
  durationMs?: number;
  profileEnhanced?: boolean;
  completedRounds?: number;
};
const rewardedNight = new WeakMap<DbTransaction, Set<number>>();

/** 按同一发布快照结算事件、每日首次和夜间奖励，日上限不足时整个奖励组均不消费。 */
export async function awardIntimacy(
  tx: DbTransaction,
  girlfriendId: number,
  userId: string,
  reason: RewardAction,
  context: RewardContext = {}
) {
  const policy = await getPublishedProductConfig(tx);
  const rules = policy.intimacy;
  const now = new Date();
  const gf = await recordInteraction(tx, girlfriendId, userId, now);
  gf.intimacyLevel = getLevelByPoints(gf.intimacyPoints, rules.levels).level;
  const period = todayUTC();
  const primary = rules.rules[reason];
  if (
    !primary.enabled ||
    (reason === "text_message" &&
      (context.textLength ?? 0) < rules.minimumTextLength) ||
    (reason === "long_conversation" &&
      context.completedRounds !== primary.bonusThreshold! + 1) ||
    (reason === "night_chat" && !isNightTime(now, rules.night))
  )
    return skippedPoints(gf, "该事件当前不奖励经验");
  const load = async (action: RewardAction) => {
    const [row] = await tx
      .select()
      .from(usageMeters)
      .where(
        and(
          eq(usageMeters.userId, userId),
          eq(usageMeters.period, period),
          eq(usageMeters.meter, METERS.intimacyReason(girlfriendId, action))
        )
      );
    return row;
  };
  const available = (
    action: RewardAction,
    previous: typeof usageMeters.$inferSelect | undefined
  ) => {
    const rule = rules.rules[action];
    return (
      rule.enabled &&
      (rule.dailyLimit === null || (previous?.count ?? 0) < rule.dailyLimit) &&
      !(
        previous?.count &&
        rule.cooldownMinutes &&
        now.getTime() - previous.updatedAt.getTime() <
          rule.cooldownMinutes * 60000
      )
    );
  };
  const calculate = (action: RewardAction, previousCount: number) => {
    const rule = rules.rules[action];
    const bonus =
      action === "text_message"
        ? (context.textLength ?? 0) > rule.bonusThreshold!
        : action === "voice_message"
          ? (context.durationMs ?? 0) > rule.bonusThreshold!
          : action === "selfie"
            ? previousCount === 0
            : action === "daily_first"
              ? gf.consecutiveDays >= rule.bonusThreshold!
              : action === "edit_profile"
                ? !!context.profileEnhanced
                : action === "long_conversation"
                  ? (context.completedRounds ?? 0) > rule.bonusThreshold!
                  : false;
    return rule.basePoints + (bonus ? rule.bonusPoints : 0);
  };
  const previous = await load(reason);
  if (!available(reason, previous))
    return skippedPoints(gf, "该行为处于冷却中或今日奖励次数已达上限");
  const rewards: { action: RewardAction; points: number }[] = [
    { action: reason, points: calculate(reason, previous?.count ?? 0) },
  ];
  if (reason !== "daily_first" && reason !== "night_chat") {
    const first = await load("daily_first");
    if (available("daily_first", first))
      rewards.push({
        action: "daily_first",
        points: calculate("daily_first", first?.count ?? 0),
      });
    const nightSet = rewardedNight.get(tx);
    if (
      isNightTime(now, rules.night) &&
      !nightSet?.has(girlfriendId) &&
      available("night_chat", await load("night_chat"))
    )
      rewards.push({
        action: "night_chat",
        points: calculate("night_chat", 0),
      });
  }
  const active = rewards.filter(reward => reward.points > 0);
  const totalPoints = active.reduce((sum, reward) => sum + reward.points, 0);
  if (!totalPoints) return skippedPoints(gf, "当前奖励为零");
  const admitted = await tryConsumeMeterInTransaction(
    tx,
    userId,
    METERS.intimacyPoints(girlfriendId),
    rules.dailyPointsLimit,
    period,
    totalPoints
  );
  if (!admitted.allowed) return skippedPoints(gf, "今日经验值总量已达上限");
  for (const reward of active) {
    const result = await tryConsumeMeterInTransaction(
      tx,
      userId,
      METERS.intimacyReason(girlfriendId, reward.action),
      rules.rules[reward.action].dailyLimit ?? Number.MAX_SAFE_INTEGER,
      period
    );
    if (!result.allowed)
      throw new Error(
        "Intimacy reason admission changed inside user transaction"
      );
  }
  if (active.some(reward => reward.action === "night_chat")) {
    const set = rewardedNight.get(tx) ?? new Set<number>();
    set.add(girlfriendId);
    rewardedNight.set(tx, set);
  }
  const points = gf.intimacyPoints + totalPoints;
  const level = getLevelByPoints(points, rules.levels).level;
  await tx
    .update(girlfriends)
    .set({ intimacyPoints: points, intimacyLevel: level })
    .where(eq(girlfriends.id, gf.id));
  return {
    intimacyLevel: level,
    intimacyPoints: points,
    previousLevel: gf.intimacyLevel,
    leveledUp: level > gf.intimacyLevel,
    consecutiveDays: gf.consecutiveDays,
    pointsAdded: totalPoints,
    skipped: false,
    skipReason: null,
    rewards: active,
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
  const policy = await getPublishedProductConfig(tx);
  let moodScore = currentMood?.moodScore ?? policy.emotion.baseline;
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
      ? evolveCompanionEmotion(
          currentMood?.emotionState,
          message.content,
          policy.emotion,
          now
        )
      : (currentMood?.emotionState ?? null);
  moodScore = Math.round(emotionState?.score ?? moodScore);
  const mood =
    emotionState?.tone === "hurt"
      ? ("sad" as const)
      : emotionState?.tone === "concerned"
        ? ("neutral" as const)
        : moodScore >= policy.emotion.thresholds.excited
          ? ("excited" as const)
          : moodScore >= policy.emotion.thresholds.happy
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
  if (message.role === "user") {
    await awardIntimacy(tx, girlfriendId, userId, "text_message", {
      textLength: message.content.trim().length,
    });
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
  const policy = await getPublishedProductConfig(tx);
  const level = getLevelByPoints(
    gf.intimacyPoints,
    policy.intimacy.levels
  ).level;
  return {
    intimacyLevel: level,
    intimacyPoints: gf.intimacyPoints,
    leveledUp: level > previousLevel,
  };
}
