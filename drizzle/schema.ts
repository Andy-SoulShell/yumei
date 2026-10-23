/** MySQL 表结构与派生的读写类型。表间关系目前主要由业务代码维护，生成迁移只依赖实际字段定义。 */

import {
  date,
  json,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  mediumtext,
  timestamp,
  uniqueIndex,
  varchar,
  boolean,
  index,
} from "drizzle-orm/mysql-core";
import type { UiLanguage } from "../shared/preferences";
import type { NotificationMessage } from "../shared/notifications";
import type { CompanionBehavior } from "../shared/companionBehavior";
import type { CompanionEmotion } from "../shared/companionEmotion";
import type { ProductConfig } from "../shared/productConfig";
import { TTS_PROVIDERS } from "../shared/ttsProviders";

/** 三类业务规则的草稿和统一发布快照，前后端共用同一发布数据。 */
export const productConfiguration = mysqlTable("productConfiguration", {
  id: varchar("id", { length: 32 }).primaryKey(),
  draft: json("draft").$type<ProductConfig>().notNull(),
  published: json("published").$type<ProductConfig>().notNull(),
  revision: int("revision").default(1).notNull(),
  publishedRevision: int("publishedRevision").default(1).notNull(),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  updatedBy: varchar("updatedBy", { length: 255 }),
});
import type {
  OfficialCharacter,
  Homepage,
  DiscoverySnapshot,
} from "../shared/discovery";

/** 官方角色草稿，归档后保留稳定 ID，用户角色的来源关联不会丢失。 */
export const officialCharacters = mysqlTable("officialCharacters", {
  id: varchar("id", { length: 100 }).primaryKey(),
  data: json("data").$type<OfficialCharacter>().notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 首页草稿与原子发布快照；revision 用于防止多位管理员覆盖修改。 */
export const discoveryContent = mysqlTable("discoveryContent", {
  id: varchar("id", { length: 32 }).primaryKey(),
  draft: json("draft").$type<Homepage>().notNull(),
  published: json("published").$type<DiscoverySnapshot>(),
  revision: int("revision").default(1).notNull(),
  publishedRevision: int("publishedRevision").default(1).notNull(),
  publishedAt: timestamp("publishedAt"),
  updatedBy: varchar("updatedBy", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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

/** 用户私有的音色参考录音与原文，不通过公开媒体路由发布。 */
export const omnivoiceVoices = mysqlTable(
  "omnivoiceVoices",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    referenceAudio: mediumtext("referenceAudio").notNull(),
    referenceText: text("referenceText").notNull(),
    durationMs: int("durationMs").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ byUser: index("idx_omnivoice_voices_user").on(table.userId) })
);

/** 账号级界面语言、配色与显示模式；独立于模型和 AI 回复偏好。 */
export const userPreferences = mysqlTable("userPreferences", {
  userId: varchar("userId", { length: 255 }).primaryKey(),
  language: varchar("language", { length: 35 })
    .$type<UiLanguage>()
    .default("system")
    .notNull(),
  theme: varchar("theme", { length: 100 }).notNull(),
  colorMode: mysqlEnum("colorMode", ["system", "light", "dark"])
    .default("system")
    .notNull(),
});

/** 陪伴服务共享的时区与显式主动联系偏好，默认不主动联系。 */
export const companionPreferences = mysqlTable("companionPreferences", {
  userId: varchar("userId", { length: 255 }).primaryKey(),
  timeZone: varchar("timeZone", { length: 64 }).default("UTC").notNull(),
  proactiveEnabled: boolean("proactiveEnabled").default(false).notNull(),
  proactiveMode: mysqlEnum("proactiveMode", ["events", "daily"])
    .default("events")
    .notNull(),
  quietStart: int("quietStart").default(1320).notNull(),
  quietEnd: int("quietEnd").default(480).notNull(),
  frequencyDays: int("frequencyDays").default(1).notNull(),
  hidePrivatePreview: boolean("hidePrivatePreview").default(true).notNull(),
  revision: int("revision").default(0).notNull(),
});

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

/** Better-Auth 账号关联结构，credential 记录保存密码哈希。 */
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
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 邮箱链接登录与密码重置使用的短期验证记录和过期时间。 */
export const verifications = mysqlTable("verifications", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 320 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** 角色资料、参考图、激活状态与亲密度数据，deletedAt 表示回收站状态。 */
export const girlfriends = mysqlTable(
  "girlfriends",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    officialPresetId: varchar("officialPresetId", { length: 100 }),
    personality: text("personality").notNull(), // 性格描述，用于 LLM 系统提示词
    appearance: text("appearance").notNull(), // 外貌描述，用于图片生成
    interests: text("interests"), // 兴趣爱好
    referenceImageUrl: text("referenceImageUrl").notNull(), // 通过文件路由访问的参考图 URL
    referenceImageKey: varchar("referenceImageKey", { length: 500 }).notNull(), // 存储文件 key
    customPrompt: text("customPrompt"), // 个体定制提示词，追加在全局提示词之后
    behavior: json("behavior").$type<CompanionBehavior>(),
    omnivoiceVoiceId: varchar("omnivoiceVoiceId", { length: 64 }).references(
      () => omnivoiceVoices.id,
      { onDelete: "set null" }
    ),
    memoryEnabled: boolean("memoryEnabled").default(true).notNull(),
    memoryEpoch: int("memoryEpoch").default(0).notNull(),
    memoryForgottenThroughId: int("memoryForgottenThroughId")
      .default(0)
      .notNull(),
    avatarUrl: text("avatarUrl"), // 头像图片 URL
    avatarKey: varchar("avatarKey", { length: 500 }), // 头像存储文件 key
    intimacyLevel: int("intimacyLevel").default(1).notNull(), // 亲密度等级 1-10
    intimacyPoints: int("intimacyPoints").default(0).notNull(), // 亲密度经验值
    lastInteractionAt: timestamp("lastInteractionAt"), // 最后互动时间
    consecutiveDays: int("consecutiveDays").default(0).notNull(), // 连续互动天数
    isActive: boolean("isActive").default(true).notNull(), // 是否为当前激活的女友
    deletedAt: timestamp("deletedAt"), // 软删除时间，null 表示未删除，有值表示已删除（7天后可永久清除）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    byOfficialPreset: index("idx_girlfriends_official_preset").on(
      table.userId,
      table.officialPresetId
    ),
    byUserAndDeleted: index("idx_girlfriends_user_deleted").on(
      table.userId,
      table.deletedAt
    ),
  })
);

/** 从 girlfriends 表结构推导的数据库读取记录。 */
export type Girlfriend = typeof girlfriends.$inferSelect;
/** 从 girlfriends 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertGirlfriend = typeof girlfriends.$inferInsert;

/** 用户与角色的一次会话，消息通过 conversationId 关联。 */
export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    girlfriendId: int("girlfriendId").notNull(),
    title: varchar("title", { length: 200 }), // 对话标题（可选）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    byUserAndRole: index("idx_conversations_user_role").on(
      table.userId,
      table.girlfriendId
    ),
  })
);

/** 从 conversations 表结构推导的数据库读取记录。 */
export type Conversation = typeof conversations.$inferSelect;
/** 从 conversations 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertConversation = typeof conversations.$inferInsert;

/** 会话中的用户或助手消息，也可关联图片消息与存储键。 */
export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(), // 文本消息内容
    imageUrl: text("imageUrl"), // 如果是图片消息，存储图片 URL
    imageKey: varchar("imageKey", { length: 500 }), // 图片或视频的存储 key，统一参与媒体引用和删除清理
    /** 生成请求及结果状态，null 表示历史或非生成消息。 */
    generationRequestId: varchar("generationRequestId", { length: 36 }),
    generationStatus: mysqlEnum("generationStatus", [
      "pending",
      "succeeded",
      "failed",
      "stopped",
    ]),
    /** 与消息正文同时持久化的展示片段，序号和 ID 在刷新后保持稳定。 */
    segments:
      json("segments").$type<
        { id: string; sequence: number; content: string }[]
      >(),
    selfieMode: mysqlEnum("selfieMode", ["mirror", "direct"]), // 自拍模式（如果是自拍）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    byConversation: index("idx_messages_conversation_id").on(
      table.conversationId,
      table.id
    ),
    byImageKey: index("idx_messages_image_key").on(table.imageKey),
  })
);

/** 从 messages 表结构推导的数据库读取记录。 */
export type Message = typeof messages.$inferSelect;
/** 从 messages 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertMessage = typeof messages.$inferInsert;

/** 生成照片的相册元数据，实际媒体文件由存储驱动管理。 */
export const selfies = mysqlTable(
  "selfies",
  {
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
  },
  table => ({
    byUserAndRole: index("idx_selfies_user_role").on(
      table.userId,
      table.girlfriendId
    ),
    byImageKey: index("idx_selfies_image_key").on(table.imageKey),
  })
);

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
  ttsProvider: mysqlEnum("ttsProvider", TTS_PROVIDERS)
    .default("browser")
    .notNull(),
  elevenlabsVoiceId: varchar("elevenlabsVoiceId", { length: 200 }),
  elevenlabsVoiceName: varchar("elevenlabsVoiceName", { length: 200 }),
  fishAudioModelId: varchar("fishAudioModelId", { length: 200 }),
  fishAudioModelName: varchar("fishAudioModelName", { length: 200 }),
  omnivoiceVoiceId: varchar("omnivoiceVoiceId", { length: 200 }),
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
export const girlfriendMoods = mysqlTable(
  "girlfriendMoods",
  {
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
    emotionState: json("emotionState").$type<CompanionEmotion>(),
    lastChatAt: timestamp("lastChatAt"),
    totalMessages: int("totalMessages").default(0).notNull(),
    todayMessages: int("todayMessages").default(0).notNull(),
    lastMoodUpdate: timestamp("lastMoodUpdate").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    byUserAndRole: uniqueIndex("uniq_moods_user_role").on(
      table.userId,
      table.girlfriendId
    ),
  })
);

/** 从 girlfriendMoods 表结构推导的数据库读取记录。 */
export type GirlfriendMood = typeof girlfriendMoods.$inferSelect;
/** 从 girlfriendMoods 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertGirlfriendMood = typeof girlfriendMoods.$inferInsert;

/** 角色发给用户的站内通知，包含类型、正文与已读状态。 */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    contactId: varchar("contactId", { length: 36 }).unique(),
    userId: varchar("userId", { length: 255 }).notNull(),
    girlfriendId: int("girlfriendId").notNull(),
    title: json("title").$type<NotificationMessage>().notNull(),
    content: json("content").$type<NotificationMessage>().notNull(),
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
  },
  table => ({
    byUserAndCreated: index("idx_notifications_user_created").on(
      table.userId,
      table.createdAt
    ),
    byUserAndRole: index("idx_notifications_user_role").on(
      table.userId,
      table.girlfriendId
    ),
  })
);

/** 从 notifications 表结构推导的数据库读取记录。 */
export type Notification = typeof notifications.$inferSelect;
/** 从 notifications 表结构推导的新增记录输入，允许省略由数据库填充的字段。 */
export type InsertNotification = typeof notifications.$inferInsert;

/** 主动联系持久任务，站内消息和任务在同一用户事务内创建。 */
export const proactiveContacts = mysqlTable(
  "proactiveContacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    girlfriendId: int("girlfriendId").notNull(),
    localDay: varchar("localDay", { length: 10 }).notNull(),
    reason: mysqlEnum("reason", [
      "event_upcoming",
      "event_today",
      "event_followup",
      "daily",
    ]).notNull(),
    memoryId: int("memoryId"),
    memoryVersion: int("memoryVersion"),
    memorySourceMessageId: int("memorySourceMessageId"),
    eventDay: varchar("eventDay", { length: 10 }),
    memoryEpoch: int("memoryEpoch").notNull(),
    preferencesRevision: int("preferencesRevision").notNull(),
    notificationId: int("notificationId").notNull(),
    status: mysqlEnum("status", ["pending", "delivering", "sent", "cancelled"])
      .default("pending")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    leaseToken: varchar("leaseToken", { length: 36 }),
    leaseUntil: timestamp("leaseUntil", { fsp: 3 }),
    nextRunAt: timestamp("nextRunAt", { fsp: 3 }).defaultNow().notNull(),
    expiresAt: timestamp("expiresAt", { fsp: 3 }).notNull(),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
  },
  table => ({
    perUserDay: uniqueIndex("uniq_proactive_user_day").on(
      table.userId,
      table.localDay
    ),
    byNext: index("idx_proactive_next").on(table.status, table.nextRunAt),
  })
);

/** 每设备投递确认，端点和密钥只保存不可逆指纹，不复制凭据。 */
export const proactiveDeliveries = mysqlTable(
  "proactiveDeliveries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    contactId: varchar("contactId", { length: 36 }).notNull(),
    userId: varchar("userId", { length: 255 }).notNull(),
    subscriptionId: int("subscriptionId").notNull(),
    deviceHash: varchar("deviceHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed"])
      .default("pending")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    deliveredAt: timestamp("deliveredAt", { fsp: 3 }),
  },
  table => ({
    perDevice: uniqueIndex("uniq_proactive_device").on(
      table.contactId,
      table.subscriptionId,
      table.deviceHash
    ),
  })
);

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
    contentVersion: int("contentVersion").default(1).notNull(),
    factKey: varchar("factKey", { length: 64 }),
    sourceType: mysqlEnum("sourceType", ["user_message", "user_edit"])
      .default("user_message")
      .notNull(),
    sourceCreatedAt: timestamp("sourceCreatedAt", { fsp: 3 }),
    sourceTimeZone: varchar("sourceTimeZone", { length: 64 })
      .default("UTC")
      .notNull(),
    eventDay: varchar("eventDay", { length: 10 }),
    eventStatus: mysqlEnum("eventStatus", [
      "planned",
      "completed",
      "cancelled",
      "unknown",
    ])
      .default("unknown")
      .notNull(),
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

/** 当前内容版本的派生语义向量；服务与模型不匹配时不可比较。 */
export const memoryEmbeddings = mysqlTable("memoryEmbeddings", {
  memoryId: int("memoryId").primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  girlfriendId: int("girlfriendId").notNull(),
  contentVersion: int("contentVersion").notNull(),
  memoryEpoch: int("memoryEpoch").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  model: varchar("model", { length: 200 }).notNull(),
  baseUrl: varchar("baseUrl", { length: 500 }).notNull(),
  isByok: boolean("isByok").notNull(),
  dimensions: int("dimensions").notNull(),
  vector: json("vector").$type<number[]>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 有来源的会话摘要，原话保留说话者，事实绑定当前记忆版本。 */
export const conversationSummaries = mysqlTable("conversationSummaries", {
  conversationId: int("conversationId").primaryKey(),
  /** 摘要所依据的发布配置，配置变更后旧摘要不再用于展示或召回。 */
  configurationRevision: int("configurationRevision").notNull(),
  userId: varchar("userId", { length: 255 }).notNull(),
  girlfriendId: int("girlfriendId").notNull(),
  memoryEpoch: int("memoryEpoch").notNull(),
  throughMessageId: int("throughMessageId").notNull(),
  content: text("content").notNull(),
  sources: json("sources")
    .$type<
      {
        memoryId: number;
        contentVersion: number;
        sourceMessageId: number | null;
      }[]
    >()
    .notNull(),
  topics: json("topics")
    .$type<
      {
        sourceMessageId: number;
        speaker: "user" | "assistant";
        quote: string;
        open: boolean;
      }[]
    >()
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 内部 AI 调用统计与预算凭证，不保存正文、向量或凭据。 */
export const aiTaskRuns = mysqlTable(
  "aiTaskRuns",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    girlfriendId: int("girlfriendId"),
    kind: mysqlEnum("kind", [
      "memory_extract",
      "memory_index",
      "memory_query",
      "summary",
      "tts",
      "transcription",
    ]).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    model: varchar("model", { length: 200 }).notNull(),
    isByok: boolean("isByok").notNull(),
    promptVersion: varchar("promptVersion", { length: 100 }).notNull(),
    outcome: mysqlEnum("outcome", ["pending", "succeeded", "failed"])
      .default("pending")
      .notNull(),
    durationMs: int("durationMs"),
    usage: json("usage").$type<{
      inputTokens: number | null;
      outputTokens: number | null;
      costUsd: number | null;
    }>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    byUserDay: index("idx_ai_task_user_day").on(table.userId, table.createdAt),
  })
);

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
  /** 已应用的 Provider 快照时间，用于拒绝乱序和相同版本事件。 */
  providerUpdatedAt: timestamp("providerUpdatedAt", { fsp: 3 }),
  /** 首次进入欠费状态的时间，后续通知不延长宽限期。 */
  pastDueSince: timestamp("pastDueSince", { fsp: 3 }),
  plan: varchar("plan", { length: 100 }).notNull(),
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

/** 支付 Webhook 的语义指纹收据，不保存客户原始支付数据。 */
export const billingEvents = mysqlTable("billingEvents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  subscriptionId: varchar("subscriptionId", { length: 64 }).notNull(),
  eventName: varchar("eventName", { length: 64 }).notNull(),
  occurredAt: timestamp("occurredAt", { fsp: 3 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 与业务删除同时写入的媒体清理任务，失败后可由后台重试。 */
export const mediaDeletions = mysqlTable(
  "mediaDeletions",
  {
    key: varchar("key", { length: 500 }).primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    attempts: int("attempts").default(0).notNull(),
    availableAt: timestamp("availableAt", { fsp: 3 }).defaultNow().notNull(),
    deleting: boolean("deleting").default(false).notNull(),
    leaseUntil: timestamp("leaseUntil", { fsp: 3 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    byUpdated: index("idx_media_cleanup_updated").on(table.updatedAt),
  })
);

/** 外部生成请求的额度预留与最终状态，失败或过期时按原周期补偿。 */
export const generationRequests = mysqlTable(
  "generationRequests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    conversationId: int("conversationId").notNull(),
    transcriptionId: varchar("transcriptionId", { length: 36 }),
    kind: mysqlEnum("kind", ["chat", "selfie", "couple", "video"]).notNull(),
    /** 视频输入、固定工作流及远端任务身份，供服务重启后恢复。 */
    videoTask: json("videoTask").$type<import("../shared/video").VideoTask>(),
    /** 图片输入快照与远端任务编号，用于刷新、重连及进程恢复。 */
    imageTask:
      json("imageTask").$type<import("../shared/imageTasks").ImageTask>(),
    contextEpoch: int("contextEpoch"),
    status: mysqlEnum("status", ["pending", "succeeded", "failed", "cancelled"])
      .default("pending")
      .notNull(),
    meterPeriod: varchar("meterPeriod", { length: 10 }),
    meterName: varchar("meterName", { length: 64 }),
    /** 客户端请求键唯一绑定当前用户及请求负载，不随重连改变。 */
    clientRequestId: varchar("clientRequestId", { length: 36 }),
    chatInput: text("chatInput"),
    /** 接受时固定非敏感路由，执行前复核服务及凭据来源，禁止后台静默换服务。 */
    chatRouting: json("chatRouting").$type<{
      provider: "openrouter" | "deepseek";
      model: string;
      isByok: boolean;
      baseUrl: string;
    }>(),
    userMessageId: int("userMessageId"),
    assistantMessageId: int("assistantMessageId"),
    turnStatus: mysqlEnum("turnStatus", [
      "queued",
      "running",
      "succeeded",
      "stopped",
      "failed",
    ]),
    cancelRequested: boolean("cancelRequested").default(false).notNull(),
    leaseToken: varchar("leaseToken", { length: 36 }),
    leaseUntil: timestamp("leaseUntil", { fsp: 3 }),
    safetyNotice: boolean("safetyNotice").default(false).notNull(),
    /** 每次持久片段或状态变更递增，用于忽略迟到的 SSE 快照。 */
    revision: int("revision").default(0).notNull(),
    turnRelationship: json("turnRelationship").$type<{
      leveledUp: boolean;
      intimacyLevel: number;
    }>(),
    /** 只保存调用统计；未知用量和成本保持 null，不保存提示词、正文或密钥。 */
    telemetry: json("telemetry").$type<{
      promptVersion: string;
      provider: string;
      model: string;
      isByok: boolean;
      durationMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
      costUsd: number | null;
      outcome: "succeeded" | "failed";
    }>(),
    /** 预先记录输出与临时输入位置，进程中断后仍可回收。 */
    outputKey: varchar("outputKey", { length: 500 }),
    temporaryKey: varchar("temporaryKey", { length: 500 }),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    byClientRequest: uniqueIndex("uniq_generation_user_client").on(
      table.userId,
      table.clientRequestId
    ),
    byTurnLease: index("idx_generation_turn_lease").on(
      table.turnStatus,
      table.leaseUntil
    ),
    byConversation: index("idx_generation_conversation").on(
      table.conversationId
    ),
    byStatusAndExpiry: index("idx_generation_expiry").on(
      table.status,
      table.expiresAt
    ),
  })
);

/** 服务端转写结果；只允许相同用户在成功保存对应文本消息时消费一次。 */
export const voiceTranscriptions = mysqlTable(
  "voiceTranscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    text: text("text").notNull(),
    durationMs: int("durationMs").notNull(),
    consumed: boolean("consumed").default(false).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  table => ({ byExpiry: index("idx_transcription_expiry").on(table.expiresAt) })
);

/** 多实例共享的请求滑动窗口；过期窗口由后台清理。 */
export const rateWindows = mysqlTable(
  "rateWindows",
  {
    userId: varchar("userId", { length: 255 }).notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    requests: json("requests").$type<number[]>().notNull(),
    updatedAt: timestamp("updatedAt", { fsp: 3 })
      .defaultNow()

      .notNull(),
  },
  table => ({
    userAction: uniqueIndex("uniq_rate_user_action").on(
      table.userId,
      table.action
    ),
    byUpdated: index("idx_rate_updated").on(table.updatedAt),
  })
);

/** 长期记忆提取的持久任务；模型凭据按执行时的账号配置解析，不写入任务。 */
export const memoryExtractionJobs = mysqlTable(
  "memoryExtractionJobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    girlfriendId: int("girlfriendId").notNull(),
    conversationId: int("conversationId").notNull(),
    lastMessageId: int("lastMessageId").notNull(),
    intimacyLevel: int("intimacyLevel").notNull(),
    memoryEpoch: int("memoryEpoch").default(0).notNull(),
    attempts: int("attempts").default(0).notNull(),
    status: mysqlEnum("status", ["pending", "failed"])
      .default("pending")
      .notNull(),
    leaseToken: varchar("leaseToken", { length: 36 }),
    leaseUntil: timestamp("leaseUntil", { fsp: 3 }),
    nextRunAt: timestamp("nextRunAt", { fsp: 3 }).defaultNow().notNull(),
  },
  table => ({
    byNext: index("idx_memory_job_next").on(table.status, table.nextRunAt),
    byRole: index("idx_memory_job_role").on(table.girlfriendId),
  })
);

/** 单密码管理会话独立于用户表；仅保存随机令牌摘要和密码签名。 */
export const managementSessions = mysqlTable("managementSessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  credentialFingerprint: varchar("credentialFingerprint", {
    length: 64,
  }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 站内售后工单，只对所属账号与独立管理会话开放。 */
export const supportTickets = mysqlTable(
  "supportTickets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: mysqlEnum("category", [
      "billing",
      "account",
      "technical",
    ]).notNull(),
    subject: varchar("subject", { length: 120 }).notNull(),
    orderReference: varchar("orderReference", { length: 200 }),
    status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { fsp: 3 })
      .defaultNow()
      .onUpdateNow()
      .notNull(),
  },
  table => ({
    byUser: index("idx_support_user_created").on(table.userId, table.createdAt),
    byStatus: index("idx_support_status_created").on(
      table.status,
      table.createdAt
    ),
  })
);
export const supportMessages = mysqlTable(
  "supportMessages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ticketId: varchar("ticketId", { length: 36 })
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    userId: varchar("userId", { length: 255 }).notNull(),
    author: mysqlEnum("author", ["user", "staff"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
  },
  table => ({
    byTicket: index("idx_support_message_ticket").on(
      table.ticketId,
      table.createdAt
    ),
  })
);
