/** photos 领域的数据访问与事务边界。 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  mediaDeletions,
  selfies,
  type InsertSelfie,
  type Selfie,
} from "../../drizzle/schema";
import { getDb, withUserTransaction } from "../database";
import { getActiveGirlfriend } from "./companions";

// 自拍。

/** 保存生成图片的相册元数据；文件写入和用户归属由调用方处理。 */
export async function createSelfie(data: InsertSelfie): Promise<Selfie> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(selfies).values(data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(selfies)
    .where(eq(selfies.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

/** 按创建时间倒序读取用户的相册记录。 */
export async function getUserSelfies(userId: string): Promise<Selfie[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(selfies)
    .where(eq(selfies.userId, userId))
    .orderBy(desc(selfies.createdAt));
}

/** 仅返回当前用户拥有且未删除的角色相册，拒绝读取其他账号的记录。 */
export async function getGirlfriendSelfies(
  girlfriendId: number,
  userId: string
): Promise<Selfie[]> {
  const db = await getDb();
  if (!db) return [];

  const role = await getActiveGirlfriend(userId, girlfriendId);
  if (!role)
    throw new TRPCError({ code: "NOT_FOUND", message: "Companion not found" });

  return db
    .select()
    .from(selfies)
    .where(
      and(eq(selfies.girlfriendId, girlfriendId), eq(selfies.userId, userId))
    )
    .orderBy(desc(selfies.createdAt));
}

/** 按用户归属删除自拍记录，并回收不再被角色、会话或相册引用的媒体。 */
export async function deleteSelfie(id: number, userId: string): Promise<void> {
  await withUserTransaction(userId, async tx => {
    const [photo] = await tx
      .select()
      .from(selfies)
      .where(and(eq(selfies.id, id), eq(selfies.userId, userId)))
      .for("update");
    if (!photo) return;
    await tx.delete(selfies).where(eq(selfies.id, id));
    await tx
      .insert(mediaDeletions)
      .values({ key: photo.imageKey, userId })
      .onDuplicateKeyUpdate({ set: { key: photo.imageKey } });
  });
  const { flushMediaDeletions } = await import("../mediaCleanup");
  await flushMediaDeletions(userId);
}
