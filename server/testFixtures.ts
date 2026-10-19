/** 集成测试专用用户和角色数据工厂，不对真实 Provider 发起请求。 */
import { users, type InsertGirlfriend } from "../drizzle/schema";
import { getDb } from "./database";
import { createGirlfriend } from "./repositories/companions";

/** 创建真实用户记录，便于测试与生产共用用户行锁和归属约束。 */
export async function createTestUser(id = `test-${crypto.randomUUID()}`) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL required");
  await db
    .insert(users)
    .values({
      id,
      email: `${id}@example.test`,
      birthDate: new Date("1990-01-01"),
    })
    .onDuplicateKeyUpdate({ set: { id } });
  return id;
}

/** 为旧功能测试创建有效所属用户后，调用真实角色创建逻辑。 */
export async function createTestGirlfriend(data: InsertGirlfriend) {
  await createTestUser(data.userId);
  return createGirlfriend(data);
}
