/** intimacy 领域的数据访问与事务边界。 */
import { and, eq } from "drizzle-orm";
import { girlfriends } from "../../drizzle/schema";
import { calculateDecay, getLevelByPoints } from "../../shared/intimacy";
import { withUserTransaction } from "../database";

/** 读取并原子结算尚未处理的衰减天数，重复查询不会重复扣经验。 */
export async function getIntimacyInfo(girlfriendId: number, userId: string) {
  return withUserTransaction(userId, async tx => {
    const [gf] = await tx
      .select()
      .from(girlfriends)
      .where(
        and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
      )
      .for("update");
    if (!gf) throw new Error("Girlfriend not found");
    const result = calculateDecay(
      gf.intimacyPoints,
      gf.lastInteractionAt,
      gf.intimacyLevel,
      gf.lastDecayAt
    );
    const intimacyLevel = getLevelByPoints(result.points).level;
    await tx
      .update(girlfriends)
      .set({
        intimacyPoints: result.points,
        intimacyLevel,
        lastDecayAt: new Date(),
      })
      .where(eq(girlfriends.id, girlfriendId));
    return {
      intimacyLevel,
      intimacyPoints: result.points,
      lastInteractionAt: gf.lastInteractionAt,
      consecutiveDays: gf.consecutiveDays,
      decayed: result.decayed,
    };
  });
}
