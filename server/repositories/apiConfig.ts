/** apiConfig 领域的数据访问与事务边界。 */
import { eq } from "drizzle-orm";
import {
  apiConfigs,
  type ApiConfig,
  type InsertApiConfig,
} from "../../drizzle/schema";
import { getDb, withUserTransaction } from "../database";

// API 偏好配置。

/**
 * 在用户事务内新增或局部更新模型、语音及提示词偏好。
 *
 * @remarks 不保存 API 密钥；首次并发保存各分区时保留其他已提交字段。
 */
export async function upsertApiConfig(
  data: InsertApiConfig
): Promise<ApiConfig> {
  return withUserTransaction(data.userId, async tx => {
    await tx
      .insert(apiConfigs)
      .values(data)
      .onDuplicateKeyUpdate({ set: { ...data, updatedAt: new Date() } });
    const [saved] = await tx
      .select()
      .from(apiConfigs)
      .where(eq(apiConfigs.userId, data.userId))
      .limit(1);
    return saved;
  });
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
