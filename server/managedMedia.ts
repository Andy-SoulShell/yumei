/** 上传前持久登记回收期限，业务提交后发布引用，覆盖失败和进程中断。 */
import { getPublishedProductConfig } from "./repositories/productConfig";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { mediaDeletions } from "../drizzle/schema";
import { getDb, withUserTransaction, type DbTransaction } from "./database";
import { storagePut } from "./storage";

/** 普通上传按发布规则预留回收时间；临时播放音频可指定保留时长。 */
export async function putStagedMedia(
  userId: string,
  key: string,
  data: Buffer,
  mimeType: string,
  retentionMs?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const retention =
    retentionMs ??
    (await getPublishedProductConfig()).runtime.maintenance.stagedRetentionMs;
  // 先登记再上传；注销后不能启动新上传，进行中的上传在完成后再次确认归属。
  const register = (tx: DbTransaction | typeof db) =>
    tx
      .insert(mediaDeletions)
      .values({ key, userId, availableAt: new Date(Date.now() + retention) });
  if (key.startsWith("official-")) await register(db);
  else await withUserTransaction(userId, register);
  const result = await storagePut(key, data, mimeType);
  try {
    if (!key.startsWith("official-"))
      await withUserTransaction(userId, async () => {});
  } catch (error) {
    const { queueMediaDeletion } = await import("./mediaCleanup");
    await queueMediaDeletion(userId, [key]);
    throw error;
  }
  return result;
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
