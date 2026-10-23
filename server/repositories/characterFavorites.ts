/** 私有角色收藏：显式设置状态可安全重试，不使用会被重复请求翻转的 toggle。 */
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { characterFavorites } from "../../drizzle/schema";
import { getDb, withUserTransaction } from "../database";
import { getPublishedDiscovery } from "./discovery";

export async function listCharacterFavorites(userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select({ id: characterFavorites.presetId })
    .from(characterFavorites)
    .where(eq(characterFavorites.userId, userId));
  return rows.map(row => row.id);
}

export async function setCharacterFavorite(
  userId: string,
  id: string,
  active: boolean
) {
  const discovery = await getPublishedDiscovery();
  if (
    active &&
    !discovery.characters.some(item => item.id === id && item.listed)
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Character unavailable",
    });
  return withUserTransaction(userId, async tx => {
    if (active)
      await tx
        .insert(characterFavorites)
        .values({ userId, presetId: id })
        .onDuplicateKeyUpdate({ set: { presetId: id } });
    else
      await tx
        .delete(characterFavorites)
        .where(
          and(
            eq(characterFavorites.userId, userId),
            eq(characterFavorites.presetId, id)
          )
        );
    const rows = await tx
      .select({ id: characterFavorites.presetId })
      .from(characterFavorites)
      .where(eq(characterFavorites.userId, userId));
    return rows.map(row => row.id);
  });
}
