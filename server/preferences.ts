/** 独立保存界面偏好，不触发模型、密钥或聊天偏好的刷新。 */
import { eq } from "drizzle-orm";
import { userPreferences } from "../drizzle/schema";
import {
  DEFAULT_PREFERENCES,
  type InterfacePreferences,
} from "../shared/preferences";
import { getDb } from "./db";

/** 仅查询当前登录用户的偏好；首次使用按系统语言和显示模式初始化。 */
export async function getInterfacePreferences(userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [stored] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return {
    ...DEFAULT_PREFERENCES,
    ...(stored ?? {}),
    userId,
    initialized: !!stored,
  };
}

/** 按用户主键原子新增或更新指定字段，保留其他设备最近保存的其他偏好。 */
export async function saveInterfacePreferences(
  userId: string,
  patch: Partial<InterfacePreferences>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(userPreferences)
    .values({ userId, ...DEFAULT_PREFERENCES, ...patch })
    .onDuplicateKeyUpdate({ set: patch });
  return getInterfacePreferences(userId);
}
