/** intimacy 领域的数据访问与事务边界。 */
import { and, eq } from "drizzle-orm";
import { girlfriends } from "../../drizzle/schema";
import { getDb } from "../database";

/** 只读已获得的关系经验，离线和查询不会扣除经验。 */
export async function getIntimacyInfo(girlfriendId: number, userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [gf] = await db
    .select()
    .from(girlfriends)
    .where(
      and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
    );
  if (!gf) throw new Error("Girlfriend not found");
  return {
    intimacyLevel: gf.intimacyLevel,
    intimacyPoints: gf.intimacyPoints,
    lastInteractionAt: gf.lastInteractionAt,
    consecutiveDays: gf.consecutiveDays,
  };
}
