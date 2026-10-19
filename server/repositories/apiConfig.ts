/** apiConfig 领域的数据访问与事务边界。 */
import { eq } from "drizzle-orm";
import {
  apiConfigs,
  type ApiConfig,
  type InsertApiConfig,
} from "../../drizzle/schema";
import { getDb } from "../database";

// API 偏好配置。

/**
 * 读取后创建或更新用户的模型、语音及提示词偏好。
 *
 * @remarks 不保存 API 密钥；首次并发写入仍受 userId 唯一约束限制。
 */
export async function upsertApiConfig(
  data: InsertApiConfig
): Promise<ApiConfig> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(apiConfigs)
    .where(eq(apiConfigs.userId, data.userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(apiConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(apiConfigs.userId, data.userId));

    const updated = await db
      .select()
      .from(apiConfigs)
      .where(eq(apiConfigs.userId, data.userId))
      .limit(1);

    return updated[0]!;
  } else {
    const result = await db.insert(apiConfigs).values(data);
    const insertedId = Number(result[0].insertId);

    const inserted = await db
      .select()
      .from(apiConfigs)
      .where(eq(apiConfigs.id, insertedId))
      .limit(1);

    return inserted[0]!;
  }
}

/** 读取用户偏好，尚未保存时返回 undefined。 */
export async function getUserApiConfig(
  userId: string
): Promise<ApiConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(apiConfigs)
    .where(eq(apiConfigs.userId, userId))
    .limit(1);

  return result[0];
}
