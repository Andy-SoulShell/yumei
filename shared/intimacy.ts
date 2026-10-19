/**
 * 亲密度等级系统常量和工具函数
 * 共享模块，前后端通用
 */

// ========== 等级定义 ==========

export interface IntimacyLevel {
  level: number;
  name: string;
  requiredPoints: number;
  petName: string; // 称呼
  emoji: string;
  color: string; // Tailwind 颜色类
  description: string;
  unlocks: string[]; // 解锁内容
}

export const INTIMACY_LEVELS: IntimacyLevel[] = [
  {
    level: 1,
    name: "初识",
    requiredPoints: 0,
    petName: "你",
    emoji: "🤝",
    color: "text-gray-400",
    description: "刚刚认识，礼貌但有距离感",
    unlocks: ["基础聊天功能"],
  },
  {
    level: 2,
    name: "熟悉",
    requiredPoints: 50,
    petName: "你",
    emoji: "😊",
    color: "text-blue-400",
    description: "开始熟悉，主动分享日常",
    unlocks: ["解锁「撒娇」自拍姿势"],
  },
  {
    level: 3,
    name: "朋友",
    requiredPoints: 150,
    petName: "亲爱的",
    emoji: "😄",
    color: "text-green-400",
    description: "成为朋友，会开玩笑和调侃",
    unlocks: ["解锁「亲密」自拍姿势"],
  },
  {
    level: 4,
    name: "好友",
    requiredPoints: 300,
    petName: "宝贝",
    emoji: "💛",
    color: "text-yellow-400",
    description: "亲密好友，记住更多细节",
    unlocks: ["解锁聊天背景自定义"],
  },
  {
    level: 5,
    name: "暧昧",
    requiredPoints: 500,
    petName: "宝宝",
    emoji: "💕",
    color: "text-pink-400",
    description: "暧昧期，偶尔暗示喜欢你",
    unlocks: ["解锁「诱惑」自拍姿势"],
  },
  {
    level: 6,
    name: "恋人",
    requiredPoints: 800,
    petName: "老公",
    emoji: "❤️",
    color: "text-red-400",
    description: "正式恋人，直接表达爱意",
    unlocks: ["解锁专属语音包"],
  },
  {
    level: 7,
    name: "热恋",
    requiredPoints: 1200,
    petName: "亲爱的老公",
    emoji: "🔥",
    color: "text-orange-400",
    description: "热恋期，主动说想你",
    unlocks: ["解锁「情侣装」自拍"],
  },
  {
    level: 8,
    name: "深爱",
    requiredPoints: 1800,
    petName: "♡",
    emoji: "💖",
    color: "text-rose-400",
    description: "深深相爱，会吃醋会撒娇",
    unlocks: ["解锁纪念日提醒", "自定义昵称"],
  },
  {
    level: 9,
    name: "挚爱",
    requiredPoints: 2500,
    petName: "♡",
    emoji: "💎",
    color: "text-purple-400",
    description: "挚爱之人，无话不谈",
    unlocks: ["解锁「私密」自拍姿势"],
  },
  {
    level: 10,
    name: "灵魂伴侣",
    requiredPoints: 3500,
    petName: "♡",
    emoji: "👑",
    color: "text-amber-400",
    description: "灵魂伴侣，完全理解你",
    unlocks: ["解锁专属结局动画", "最高亲密度成就"],
  },
];

// ========== 经验值规则 ==========

export interface PointsRule {
  type: string;
  basePoints: number;
  bonusCondition?: string;
  bonusPoints?: number;
  cooldownMinutes?: number; // 冷却时间（分钟）
  dailyLimit?: number; // 每日上限
}

export const POINTS_RULES: Record<string, PointsRule> = {
  text_message: {
    type: "text_message",
    basePoints: 2,
    bonusCondition: "消息长度 > 50 字",
    bonusPoints: 3,
    cooldownMinutes: 1,
    dailyLimit: 100,
  },
  voice_message: {
    type: "voice_message",
    basePoints: 5,
    bonusCondition: "时长 > 30 秒",
    bonusPoints: 3,
    cooldownMinutes: 2,
    dailyLimit: 50,
  },
  selfie: {
    type: "selfie",
    basePoints: 10,
    bonusCondition: "每日首次",
    bonusPoints: 5,
    cooldownMinutes: 5,
    dailyLimit: 30,
  },
  daily_first: {
    type: "daily_first",
    basePoints: 10,
    bonusCondition: "连续登录 7 天",
    bonusPoints: 20,
    dailyLimit: 1,
  },
  edit_profile: {
    type: "edit_profile",
    basePoints: 5,
    bonusCondition: "上传头像/更新性格",
    bonusPoints: 5,
    dailyLimit: 5,
  },
  long_conversation: {
    type: "long_conversation",
    basePoints: 5,
    bonusCondition: "单次对话 > 10 轮",
    bonusPoints: 5,
    dailyLimit: 20,
  },
  night_chat: {
    type: "night_chat",
    basePoints: 3,
    bonusCondition: "22:00-02:00 互动",
    bonusPoints: 0,
    dailyLimit: 10,
  },
};

// 每日经验值总上限
export const DAILY_POINTS_LIMIT = 200;

// 衰减规则
export const DECAY_START_DAYS = 7; // 超过 7 天未互动开始衰减
export const DECAY_POINTS_PER_DAY = 5; // 每天衰减 5 点

// ========== 工具函数 ==========

/**
 * 根据经验值获取对应等级
 */
export function getLevelByPoints(points: number): IntimacyLevel {
  let result = INTIMACY_LEVELS[0];
  for (const level of INTIMACY_LEVELS) {
    if (points >= level.requiredPoints) {
      result = level;
    } else {
      break;
    }
  }
  return result;
}

/**
 * 获取指定等级的信息
 */
export function getLevelInfo(level: number): IntimacyLevel {
  return INTIMACY_LEVELS[Math.min(Math.max(level - 1, 0), INTIMACY_LEVELS.length - 1)];
}

/**
 * 获取下一等级的信息（如果已满级返回 null）
 */
export function getNextLevel(currentLevel: number): IntimacyLevel | null {
  if (currentLevel >= 10) return null;
  return INTIMACY_LEVELS[currentLevel]; // level 是 1-indexed, array 是 0-indexed
}

/**
 * 计算距离下一级还需要多少经验值
 */
export function getPointsToNextLevel(currentPoints: number): number | null {
  const nextLevel = getNextLevel(getLevelByPoints(currentPoints).level);
  if (!nextLevel) return null;
  return nextLevel.requiredPoints - currentPoints;
}

/**
 * 计算当前等级的进度百分比（0-100）
 */
export function getLevelProgress(currentPoints: number): number {
  const currentLevel = getLevelByPoints(currentPoints);
  const nextLevel = getNextLevel(currentLevel.level);
  if (!nextLevel) return 100; // 满级

  const levelStart = currentLevel.requiredPoints;
  const levelEnd = nextLevel.requiredPoints;
  const progress = ((currentPoints - levelStart) / (levelEnd - levelStart)) * 100;
  return Math.min(Math.max(Math.round(progress), 0), 100);
}

/**
 * 判断是否为夜间时段（22:00-02:00）
 */
export function isNightTime(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 22 || hour < 2;
}

/**
 * 计算衰减后的经验值
 */
export function calculateDecay(
  currentPoints: number,
  lastInteractionAt: Date | null,
  currentLevel: number
): { points: number; decayed: number } {
  if (!lastInteractionAt) return { points: currentPoints, decayed: 0 };

  const now = new Date();
  const daysSinceLastInteraction = Math.floor(
    (now.getTime() - lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceLastInteraction <= DECAY_START_DAYS) {
    return { points: currentPoints, decayed: 0 };
  }

  const decayDays = daysSinceLastInteraction - DECAY_START_DAYS;
  const totalDecay = decayDays * DECAY_POINTS_PER_DAY;

  // 最多扣到当前等级起点
  const levelInfo = getLevelInfo(currentLevel);
  const minPoints = levelInfo.requiredPoints;
  const newPoints = Math.max(currentPoints - totalDecay, minPoints);
  const actualDecay = currentPoints - newPoints;

  return { points: newPoints, decayed: actualDecay };
}

/**
 * 获取等级对应的渐变色（用于进度条）
 */
export function getLevelGradient(level: number): string {
  const gradients: Record<number, string> = {
    1: "from-gray-400 to-gray-500",
    2: "from-blue-400 to-blue-500",
    3: "from-green-400 to-green-500",
    4: "from-yellow-400 to-yellow-500",
    5: "from-pink-400 to-pink-500",
    6: "from-red-400 to-red-500",
    7: "from-orange-400 to-orange-500",
    8: "from-rose-400 to-rose-500",
    9: "from-purple-400 to-purple-500",
    10: "from-amber-400 to-amber-500",
  };
  return gradients[level] || gradients[1];
}
