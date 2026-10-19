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

/**
 * Core user table backing auth flow.
 *
 * Phase 1b-ii.1 (issue #7 / ADR 0006) reshapes the auth path from
 * Manus OAuth to Better-Auth. The columns Better-Auth requires
 * (`emailVerified`, `image`) are added below; the legacy `openId` /
 * `loginMethod` columns are kept so historical data isn't lost (they
 * become unused on new logins). Better-Auth uses `id` as the canonical
 * user identifier going forward.
 *
 * `id` is `varchar(255)` so Better-Auth can manage all four auth tables
 * (`users` / `sessions` / `accounts` / `verifications`) under a single
 * id type. YUMEI's 0000_init migration creates this final schema directly.
 */
export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  // Legacy from the Manus OAuth path; left in place but no longer read.
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  loginMethod: varchar("loginMethod", { length: 64 }), // legacy
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // M1-6 age gate: set once via auth.confirmAge (validated 18+ server-
  // side). AI routes refuse to run while this is null.
  birthDate: date("birthDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Better-Auth session table. Sessions are looked up by `id` (the value
 * the client sends in its session cookie). One row per active session
 * per device. `expiresAt` is hard-deleted by Better-Auth's cleanup.
 */
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

export type Session = typeof sessions.$inferSelect;

/**
 * Better-Auth `accounts` table — links external identities (OAuth
 * providers, future passkey) to a user. Phase 1b-ii.1 only writes
 * rows for the `magic-link` provider; Phase 1b-ii.2 adds GitHub.
 */
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
  password: text("password"), // unused (we don't do password auth)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Better-Auth `verifications` table — short-lived single-use tokens
 * used by the magic-link plugin (and the email-verification, password-
 * reset etc. flows we haven't enabled).
 */
export const verifications = mysqlTable("verifications", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 320 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Girlfriend configuration table
 * Stores personality, appearance description, and reference images
 */
export const girlfriends = mysqlTable("girlfriends", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  personality: text("personality").notNull(), // 性格描述，用于 LLM 系统提示词
  appearance: text("appearance").notNull(), // 外貌描述，用于图片生成
  interests: text("interests"), // 兴趣爱好
  referenceImageUrl: text("referenceImageUrl").notNull(), // S3 上的参考图片 URL
  referenceImageKey: varchar("referenceImageKey", { length: 500 }).notNull(), // S3 文件 key
  customPrompt: text("customPrompt"), // 个体定制提示词，追加在全局提示词之后
  avatarUrl: text("avatarUrl"), // 头像图片 URL（S3）
  avatarKey: varchar("avatarKey", { length: 500 }), // 头像 S3 文件 key
  intimacyLevel: int("intimacyLevel").default(1).notNull(), // 亲密度等级 1-10
  intimacyPoints: int("intimacyPoints").default(0).notNull(), // 亲密度经验值
  lastInteractionAt: timestamp("lastInteractionAt"), // 最后互动时间
  consecutiveDays: int("consecutiveDays").default(0).notNull(), // 连续互动天数
  isActive: boolean("isActive").default(true).notNull(), // 是否为当前激活的女友
  deletedAt: timestamp("deletedAt"), // 软删除时间，null 表示未删除，有值表示已删除（7天后可永久清除）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Girlfriend = typeof girlfriends.$inferSelect;
export type InsertGirlfriend = typeof girlfriends.$inferInsert;

/**
 * Conversation sessions table
 * Each conversation is a separate chat session
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  girlfriendId: int("girlfriendId").notNull(),
  title: varchar("title", { length: 200 }), // 对话标题（可选）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Messages table
 * Stores all chat messages (user and AI)
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(), // 文本消息内容
  imageUrl: text("imageUrl"), // 如果是图片消息，存储图片 URL
  imageKey: varchar("imageKey", { length: 500 }), // S3 文件 key
  selfieMode: mysqlEnum("selfieMode", ["mirror", "direct"]), // 自拍模式（如果是自拍）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Selfies table
 * Stores all generated selfie images for gallery view
 */
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

export type Selfie = typeof selfies.$inferSelect;
export type InsertSelfie = typeof selfies.$inferInsert;

/**
 * API configurations table
 *
 * Stores per-user provider PREFERENCES (which model, which voice).
 * Per-user API KEYS used to live here as plaintext varchar columns —
 * see issue #2. Phase 1b-i (this commit) moved those to the encrypted
 * `userKeys` table. The only secret-shaped columns left are model /
 * voice IDs, which are not credentials.
 */
export const apiConfigs = mysqlTable("apiConfigs", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull().unique(),
  llmApiUrl: varchar("llmApiUrl", { length: 500 }), // LLM API URL (defaults to OpenRouter)
  llmModel: varchar("llmModel", { length: 200 }), // 用户选择的模型 ID（如 openai/gpt-4o）
  // TTS 语音配置
  ttsProvider: mysqlEnum("ttsProvider", ["browser", "elevenlabs", "fishaudio"])
    .default("browser")
    .notNull(),
  elevenlabsVoiceId: varchar("elevenlabsVoiceId", { length: 200 }),
  elevenlabsVoiceName: varchar("elevenlabsVoiceName", { length: 200 }),
  fishAudioModelId: varchar("fishAudioModelId", { length: 200 }),
  fishAudioModelName: varchar("fishAudioModelName", { length: 200 }),
  // 语音转写配置
  whisperProvider: mysqlEnum("whisperProvider", ["manus", "openai"])
    .default("manus")
    .notNull(),
  // 全局提示词配置
  globalPrompt: text("globalPrompt"),
  replyLanguage: varchar("replyLanguage", { length: 50 }).default("中文"),
  replyLengthLimit: varchar("replyLengthLimit", { length: 50 }).default(
    "50-100字"
  ),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiConfig = typeof apiConfigs.$inferSelect;
export type InsertApiConfig = typeof apiConfigs.$inferInsert;

/**
 * Encrypted per-user BYOK API keys (issue #2).
 *
 * One row per (user, provider). The `encryptedValue` column holds a
 * `pack`-formatted ciphertext from `server/_core/encryption.ts`
 * (AES-256-GCM under a server-derived data key). `lastFour` is the
 * trailing 4 plaintext chars, kept so the UI can render
 * "API key set ✓ (...XXXX)" without needing to decrypt.
 */
export const userKeys = mysqlTable(
  "userKeys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: varchar("userId", { length: 255 }).notNull(),
    // Logical key name; matches `KeyName` in server/_core/keyProvider/types.ts.
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

export type UserKey = typeof userKeys.$inferSelect;
export type InsertUserKey = typeof userKeys.$inferInsert;

/**
 * Girlfriend mood tracking table
 * Tracks mood changes based on chat content and frequency
 */
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
  moodScore: int("moodScore").default(70).notNull(), // 0-100, higher = happier
  lastChatAt: timestamp("lastChatAt"),
  totalMessages: int("totalMessages").default(0).notNull(),
  todayMessages: int("todayMessages").default(0).notNull(),
  lastMoodUpdate: timestamp("lastMoodUpdate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GirlfriendMood = typeof girlfriendMoods.$inferSelect;
export type InsertGirlfriendMood = typeof girlfriendMoods.$inferInsert;

/**
 * Notifications table
 * Stores push notifications from girlfriends (proactive messages)
 */
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

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Usage meters (M1-3 / issue #5, reused by subscription quotas in M3).
 *
 * One row per (user, period, meter). `period` is a UTC day (`YYYY-MM-DD`)
 * for daily free-tier caps; monthly billing meters will use `YYYY-MM`.
 * Increments are atomic (`INSERT ... ON DUPLICATE KEY UPDATE`), so the
 * caps hold under concurrent requests.
 */
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

export type UsageMeter = typeof usageMeters.$inferSelect;
export type InsertUsageMeter = typeof usageMeters.$inferInsert;

/**
 * Long-term memories (M2). One row per extracted fact/preference/event/
 * relationship note about the user, scoped to a companion. Selection and
 * scoring live in shared/memory.ts + server/memory.ts. `pinned` rows are
 * user-curated: never auto-evicted, scoring bonus at recall time.
 */
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
    weight: int("weight").default(50).notNull(), // 0-100 importance
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

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;

/**
 * Subscriptions (M3 / ADR 0004): one row per user, driven entirely by
 * Lemon Squeezy webhooks. `status` mirrors LS subscription statuses;
 * "service until period end" on cancellation comes from honoring
 * `endsAt` rather than the status alone. Self-host deployments
 * (BILLING_PROVIDER=none) never write here.
 */
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

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Web Push subscriptions (M4-4). One row per browser endpoint; a user
 * can have several (phone + desktop). Endpoints are pruned when a push
 * delivery returns 404/410.
 */
export const pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  endpoint: varchar("endpoint", { length: 500 }).notNull().unique(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
