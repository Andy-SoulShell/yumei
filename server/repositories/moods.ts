/** moods 领域的数据访问与事务边界。 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { girlfriendMoods, type GirlfriendMood } from "../../drizzle/schema";
import { getDb } from "../database";
import { getActiveGirlfriend } from "./companions";

// 角色心情。

/** 按用户和角色编号读取心情记录。 */
export async function getGirlfriendMood(
  userId: string,
  girlfriendId: number
): Promise<GirlfriendMood | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!(await getActiveGirlfriend(userId, girlfriendId)))
    throw new TRPCError({ code: "NOT_FOUND", message: "Companion not found" });

  const result = await db
    .select()
    .from(girlfriendMoods)
    .where(
      and(
        eq(girlfriendMoods.userId, userId),
        eq(girlfriendMoods.girlfriendId, girlfriendId)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/** 读取当前用户的全部角色心情记录。 */
export async function getAllGirlfriendMoods(
  userId: string
): Promise<GirlfriendMood[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(girlfriendMoods)
    .where(eq(girlfriendMoods.userId, userId));
}
