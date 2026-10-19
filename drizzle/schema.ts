/** MySQL 表结构与派生的读写类型。表间关系目前主要由业务代码维护，生成迁移只依赖实际字段定义。 */

import {
  date,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  boolean,
} from "drizzle-orm/mysql-core";

/** 用户资料、认证邮箱、应用角色与成年确认信息。 */
export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // auth.confirmAge 校验成年后写入；未确认时拒绝 AI 请求。
  birthDate: date("birthDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** 从 users 表结构推导的数据库读取记录。 */
export type User = typeof users.$inferSelect;
/** 从 users 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertUser = typeof users.$inferInsert;

/** Better-Auth 会话记录，客户端通过 token 而不是记录 id 关联会话。 */
export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  token: varchar("token", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 从 sessions 表结构推导的数据库读取记录。 */
export type Session = typeof sessions.$inferSelect;

/** Better-Auth 账号关联结构；当前未启用密码及社交登录。 */
export const accounts = mysqlTable("accounts", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  accountId: varchar("accountId", { length: 255 }).notNull(),
  providerId: varchar("providerId", { length: 64 }).notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"), // 当前邮箱链接登录不使用密码
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 邮箱链接登录使用的短期验证记录与过期时间。 */
export const verifications = mysqlTable("verifications", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 320 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 角色资料、参考图、激活状态与亲密度数据，deletedAt 表示回收站状态。 */
export const girlfriends = mysqlTable("girlfriends", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  personality: text("personality").notNull(), // 性格描述，用于 LLM 系统提示词
  appearance: text("appearance").notNull(), // 外貌描述，用于图片生成
  interests: text("interests"), // 兴趣爱好
  referenceImageUrl: text("referenceImageUrl").notNull(), // 通过文件路由访问的参考图 URL
  referenceImageKey: varchar("referenceImageKey", { length: 500 }).notNull(), // 存储文件 key
  customPrompt: text("customPrompt"), // 个体定制提示词，追加在全局提示词之后
  avatarUrl: text("avatarUrl"), // 头像图片 URL
  avatarKey: varchar("avatarKey", { length: 500 }), // 头像存储文件 key
  intimacyLevel: int("intimacyLevel").default(1).notNull(), // 亲密度等级 1-10
  intimacyPoints: int("intimacyPoints").default(0).notNull(), // 亲密度经验值
  /** 上次完成衰减结算的时间；空值表示尚未结算。 */
  lastDecayAt: timestamp("lastDecayAt"),
  lastInteractionAt: timestamp("lastInteractionAt"), // 最后互动时间
  consecutiveDays: int("consecutiveDays").default(0).notNull(), // 连续互动天数
  isActive: boolean("isActive").default(true).notNull(), // 是否为当前激活的女友
  deletedAt: timestamp("deletedAt"), // 软删除时间，null 表示未删除，有值表示已删除（7天后可永久清除）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 从 girlfriends 表结构推导的数据库读取记录。 */
export type Girlfriend = typeof girlfriends.$inferSelect;
/** 从 girlfriends 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertGirlfriend = typeof girlfriends.$inferInsert;

/** 用户与角色的一次会话，消息通过 conversationId 关联。 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  girlfriendId: int("girlfriendId").notNull(),
  title: varchar("title", { length: 200 }), // 对话标题（可选）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 从 conversations 表结构推导的数据库读取记录。 */
export type Conversation = typeof conversations.$inferSelect;
/** 从 conversations 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertConversation = typeof conversations.$inferInsert;

/** 会话中的用户或助手消息，也可关联图片消息与存储键。 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(), // 文本消息内容
  imageUrl: text("imageUrl"), // 如果是图片消息，存储图片 URL
  imageKey: varchar("imageKey", { length: 500 }), // 存储文件 key
  selfieMode: mysqlEnum("selfieMode", ["mirror", "direct"]), // 自拍模式（如果是自拍）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 从 messages 表结构推导的数据库读取记录。 */
export type Message = typeof messages.$inferSelect;
/** 从 messages 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertMessage = typeof messages.$inferInsert;

/** 生成照片的相册元数据，实际媒体文件由存储驱动管理。 */
export const selfies = mysqlTable("selfies", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  girlfriendId: int("girlfriendId").notNull(),
  messageId: int("messageId"), // 关联的消息 ID（可选）
  imageUrl: text("imageUrl").notNull(),
  imageKey: varchar("imageKey", { length: 500 }).notNull(),
  prompt: text("prompt").notNull(), // 用于生成的完整提示词
  userContext: text("userContext").notNull(), // 用户的上下文描述
  mode: mysqlEnum("mode", ["mirror", "direct"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 从 selfies 表结构推导的数据库读取记录。 */
export type Selfie = typeof selfies.$inferSelect;
/** 从 selfies 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertSelfie = typeof selfies.$inferInsert;

/** 用户模型、语音和提示词偏好；完整凭据保存在独立密钥表。 */
export const apiConfigs = mysqlTable("apiConfigs", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull().unique(),
  llmModel: varchar("llmModel", { length: 200 }), // 用户选择的模型 ID（如 openai/gpt-4o）
  // TTS 语音配置
  ttsProvider: mysqlEnum("ttsProvider", ["browser", "elevenlabs", "fishaudio"])
    .default("browser")
    .notNull(),
  elevenlabsVoiceId: varchar("elevenlabsVoiceId", { length: 200 }),
  elevenlabsVoiceName: varchar("elevenlabsVoiceName", { length: 200 }),
  fishAudioModelId: varchar("fishAudioModelId", { length: 200 }),
  fishAudioModelName: varchar("fishAudioModelName", { length: 200 }),
  // 全局提示词配置
  globalPrompt: text("globalPrompt"),
  replyLanguage: varchar("replyLanguage", { length: 50 }).default("中文"),
  replyLengthLimit: varchar("replyLengthLimit", { length: 50 }).default(
    "50-100字"
  ),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 从 apiConfigs 表结构推导的数据库读取记录。 */
export type ApiConfig = typeof apiConfigs.$inferSelect;
/** 从 apiConfigs 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertApiConfig = typeof apiConfigs.$inferInsert;

/** 按用户与 Provider 唯一保存的加密 BYOK 密钥及脱敏展示信息。 */
export const userKeys = mysqlTable(
  "userKeys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    // 逻辑密钥名，对应 KeyProvider 的 KeyName。
    name: varchar("name", { length: 64 }).notNull(),
    encryptedValue: text("encryptedValue").notNull(),
    lastFour: varchar("lastFour", { length: 8 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    uniqUserName: uniqueIndex("uniq_user_key_name").on(
      table.userId,
      table.name
    ),
  })
);

/** 从 userKeys 表结构推导的数据库读取记录。 */
export type UserKey = typeof userKeys.$inferSelect;
/** 从 userKeys 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertUserKey = typeof userKeys.$inferInsert;

/** 角色心情、最近聊天时间和消息计数，业务更新按用户与角色定位。 */
export const girlfriendMoods = mysqlTable("girlfriendMoods", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  girlfriendId: int("girlfriendId").notNull(),
  mood: mysqlEnum("mood", [
    "excited",
    "happy",
    "content",
    "neutral",
    "lonely",
    "sad",
  ])
    .default("happy")
    .notNull(),
  moodScore: int("moodScore").default(70).notNull(), // 范围 0～100，越高表示越开心
  lastChatAt: timestamp("lastChatAt"),
  totalMessages: int("totalMessages").default(0).notNull(),
  todayMessages: int("todayMessages").default(0).notNull(),
  lastMoodUpdate: timestamp("lastMoodUpdate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 从 girlfriendMoods 表结构推导的数据库读取记录。 */
export type GirlfriendMood = typeof girlfriendMoods.$inferSelect;
/** 从 girlfriendMoods 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertGirlfriendMood = typeof girlfriendMoods.$inferInsert;

/** 角色发给用户的站内通知，包含类型、正文与已读状态。 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  girlfriendId: int("girlfriendId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  type: mysqlEnum("type", [
    "miss_you",
    "good_morning",
    "good_night",
    "random",
    "mood",
  ])
    .default("random")
    .notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 从 notifications 表结构推导的数据库读取记录。 */
export type Notification = typeof notifications.$inferSelect;
/** 从 notifications 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertNotification = typeof notifications.$inferInsert;

/** 按用户、UTC 周期和计量名称唯一保存的消费计数。 */
export const usageMeters = mysqlTable(
  "usageMeters",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    period: varchar("period", { length: 10 }).notNull(),
    meter: varchar("meter", { length: 64 }).notNull(),
    count: int("count").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    uniqUserPeriodMeter: uniqueIndex("uniq_user_period_meter").on(
      table.userId,
      table.period,
      table.meter
    ),
  })
);

/** 从 usageMeters 表结构推导的数据库读取记录。 */
export type UsageMeter = typeof usageMeters.$inferSelect;
/** 从 usageMeters 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertUsageMeter = typeof usageMeters.$inferInsert;

/** 角色范围内的用户长期记忆，包含分类、重要性、置顶与召回时间。 */
export const memories = mysqlTable(
  "memories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    girlfriendId: int("girlfriendId").notNull(),
    category: mysqlEnum("category", [
      "fact",
      "preference",
      "event",
      "relationship",
    ])
      .default("fact")
      .notNull(),
    content: varchar("content", { length: 300 }).notNull(),
    weight: int("weight").default(50).notNull(), // 重要度范围 0～100
    pinned: boolean("pinned").default(false).notNull(),
    sourceMessageId: int("sourceMessageId"),
    lastRecalledAt: timestamp("lastRecalledAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    idxUserGirlfriend: uniqueIndex("uniq_memory_dedupe").on(
      table.girlfriendId,
      table.content
    ),
  })
);

/** 从 memories 表结构推导的数据库读取记录。 */
export type Memory = typeof memories.$inferSelect;
/** 从 memories 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertMemory = typeof memories.$inferInsert;

/** 每用户当前的外部订阅快照，由经验证的支付事件更新。 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull().unique(),
  provider: varchar("provider", { length: 32 })
    .default("lemonsqueezy")
    .notNull(),
  lsSubscriptionId: varchar("lsSubscriptionId", { length: 64 })
    .notNull()
    .unique(),
  lsCustomerId: varchar("lsCustomerId", { length: 64 }),
  plan: mysqlEnum("plan", ["plus", "pro"]).notNull(),
  status: mysqlEnum("status", [
    "on_trial",
    "active",
    "paused",
    "past_due",
    "unpaid",
    "cancelled",
    "expired",
  ]).notNull(),
  renewsAt: timestamp("renewsAt"),
  endsAt: timestamp("endsAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 从 subscriptions 表结构推导的数据库读取记录。 */
export type Subscription = typeof subscriptions.$inferSelect;
/** 从 subscriptions 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertSubscription = typeof subscriptions.$inferInsert;

/** 按浏览器端点唯一保存的 Web Push 订阅与投递密钥。 */
export const pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  endpoint: varchar("endpoint", { length: 500 }).notNull().unique(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 从 pushSubscriptions 表结构推导的数据库读取记录。 */
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
/** 从 pushSubscriptions 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
