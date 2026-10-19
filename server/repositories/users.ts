/** users 领域的数据访问与事务边界。 */
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../database";

// 用户资料。

// Better-Auth 管理注册与登录，应用角色由数据库维护。

/** 按认证系统的用户标识读取应用用户资料，未找到时返回 undefined。 */
export async function getUserById(id: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** 保存用户的出生日期；调用方负责校验日期和成年条件。 */
export async function setUserBirthDate(
  userId: string,
  birthDate: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ birthDate }).where(eq(users.id, userId));
}
