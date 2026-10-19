/** 上传前持久登记回收期限，业务提交后发布引用，覆盖失败和进程中断。 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { mediaDeletions } from "../drizzle/schema";
import { getDb, type DbTransaction } from "./database";
import { storagePut } from "./storage";

/** 普通上传预留十分钟；临时播放音频可指定保留时长。 */
export async function putStagedMedia(
  userId: string,
  key: string,
  data: Buffer,
  mimeType: string,
  retentionMs = 10 * 60_000
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(mediaDeletions)
    .values({ key, userId, availableAt: new Date(Date.now() + retentionMs) });
  return storagePut(key, data, mimeType);
}

/** 在用户业务事务内发布媒体；清理器已认领的对象不能重新成为有效引用。 */
export async function publishMedia(
  tx: DbTransaction,
  userId: string,
  keys: (string | null | undefined)[]
) {
  for (const key of Array.from(
    new Set(keys.filter((key): key is string => !!key))
  )) {
    const [task] = await tx
      .select()
      .from(mediaDeletions)
      .where(eq(mediaDeletions.key, key))
      .for("update");
    if (task?.deleting)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Media upload has expired; please upload again",
      });
    if (task && task.userId === userId)
      await tx.delete(mediaDeletions).where(eq(mediaDeletions.key, key));
  }
}
