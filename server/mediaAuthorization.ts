/** 官方运营素材公开；用户头像、角色参考图、相册、聊天和语音仅限所属账号。 */
import { and, eq, or } from "drizzle-orm";
import {
  users,
  girlfriends,
  selfies,
  messages,
  conversations,
  mediaDeletions,
} from "../drizzle/schema";
import { getDb } from "./database";
export async function canReadMedia(key: string, userId?: string) {
  if (key.startsWith("official-")) return true;
  if (!userId) return false;
  const db = await getDb();
  if (!db) return false;
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!owner) return false;
  const checks = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.image, `/files/${key}`)))
      .limit(1),
    db
      .select({ id: girlfriends.id })
      .from(girlfriends)
      .where(
        and(
          eq(girlfriends.userId, userId),
          or(
            eq(girlfriends.referenceImageKey, key),
            eq(girlfriends.avatarKey, key)
          )
        )
      )
      .limit(1),
    db
      .select({ id: selfies.id })
      .from(selfies)
      .where(and(eq(selfies.userId, userId), eq(selfies.imageKey, key)))
      .limit(1),
    db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.userId, userId), eq(messages.imageKey, key)))
      .limit(1),
    db
      .select({ key: mediaDeletions.key })
      .from(mediaDeletions)
      .where(
        and(eq(mediaDeletions.userId, userId), eq(mediaDeletions.key, key))
      )
      .limit(1),
  ]);
  return checks.some(rows => rows.length > 0);
}
