/** users 领域的数据访问与事务边界。 */
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { accounts, mediaDeletions, users } from "../../drizzle/schema";
import { getDb, withUserTransaction } from "../database";
import { publishMedia } from "../managedMedia";

// 用户资料。

// Better-Auth 管理注册与登录，应用角色由数据库维护。

/** 按认证系统的用户标识读取应用用户资料，未找到时返回 undefined。 */
export async function getUserById(id: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** 在用户锁内保存姓名和头像，并将旧头像与资料变更一同交给清理队列。 */
export async function updateUserProfile(
  userId: string,
  name: string,
  avatarKey?: string | null
) {
  return withUserTransaction(userId, async tx => {
    const [current] = await tx.select().from(users).where(eq(users.id, userId));
    const image =
      avatarKey === undefined
        ? current.image
        : avatarKey === null
          ? null
          : `/files/${avatarKey}`;
    await publishMedia(tx, userId, [avatarKey]);
    const updatedAt = new Date();
    await tx
      .update(users)
      .set({ name, image, updatedAt })
      .where(eq(users.id, userId));
    // 本功能只回收自己创建的存储文件，外部头像地址没有删除权限。
    if (
      current.image !== image &&
      current.image?.startsWith("/files/user-avatar-")
    ) {
      const key = current.image.slice("/files/".length);
      await tx
        .insert(mediaDeletions)
        .values({ key, userId, availableAt: new Date() })
        .onDuplicateKeyUpdate({ set: { availableAt: new Date() } });
    }
    return { ...current, name, image, updatedAt };
  });
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

/** 仅返回是否已设置密码，不向客户端暴露密码哈希或其他认证资料。 */
export async function hasCredentialPassword(userId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.providerId, "credential"),
        isNotNull(accounts.password),
        ne(accounts.password, "")
      )
    )
    .limit(1);
  return result.length > 0;
}
