/** 数据库连接、事务类型和用户事务锁。 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "../drizzle/schema";
import { createUtcMysqlPool } from "./_core/mysql";

/** 按 UTC 连接池类型创建业务数据库，保留正确的 Promise Pool 类型。 */
function createDatabase(uri: string) {
  return drizzle(createUtcMysqlPool(uri));
}

let _db: ReturnType<typeof createDatabase> | null = null;

/**
 * 按需创建并缓存 MySQL 连接实例，未设置连接时返回 null。
 *
 * @remarks 创建实例不等于连接已通过健康检查，连通性由启动探针验证。
 */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = createDatabase(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** 事务内的数据访问接口，用于将相关写入组成同一提交。 */
export type DbTransaction = Parameters<
  Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]
>[0];

/** 判断驱动或 Drizzle 包装后的错误是否为可重试的事务死锁或锁等待超时。 */
function retryableTransaction(error: unknown): boolean {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const item = current as { code?: string; cause?: unknown };
    if (
      item.code === "ER_LOCK_DEADLOCK" ||
      item.code === "ER_LOCK_WAIT_TIMEOUT"
    )
      return true;
    current = item.cause;
  }
  return false;
}

/**
 * 锁定用户后执行 READ COMMITTED 事务，锁冲突最多重试三次。
 *
 * @remarks 回调仅包含可回滚 SQL 或幂等副作用；默认资料工厂会缓存一次结果。
 */
export async function withUserTransaction<T>(
  userId: string,
  action: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(
        async tx => {
          const [user] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .for("update");
          if (!user)
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "User no longer exists",
            });
          return action(tx);
        },
        { isolationLevel: "read committed" }
      );
    } catch (error) {
      if (attempt >= 3 || !retryableTransaction(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
