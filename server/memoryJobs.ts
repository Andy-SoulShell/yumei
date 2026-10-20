/** 使用有期限的数据库租约执行记忆任务，提取结果与任务确认原子提交。 */
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { memoryExtractionJobs, messages } from "../drizzle/schema";
import { EXTRACTION_EVERY_N_MESSAGES } from "../shared/memory";
import { resolveChatProvider } from "./_core/chatProvider";
import { log, providerErrorSummary } from "./_core/log";
import { getDb, withUserTransaction } from "./database";
import {
  callExtractionModel,
  enforceMemoryCapacity,
  storeExtractedMemoriesInTransaction,
} from "./memory";

/** 多实例可同时调用；过期租约会被重新认领，连续五次失败保留为待排查任务。 */
export async function runMemoryExtractionJobs(userId?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const jobs = await db
    .select()
    .from(memoryExtractionJobs)
    .where(
      and(
        eq(memoryExtractionJobs.status, "pending"),
        userId ? eq(memoryExtractionJobs.userId, userId) : undefined,
        lte(memoryExtractionJobs.nextRunAt, new Date()),
        or(
          isNull(memoryExtractionJobs.leaseUntil),
          lte(memoryExtractionJobs.leaseUntil, new Date())
        )
      )
    )
    .orderBy(memoryExtractionJobs.nextRunAt)
    .limit(10);
  for (const job of jobs) {
    const token = crypto.randomUUID();
    try {
      const claimed = await withUserTransaction(job.userId, async tx => {
        const [current] = await tx
          .select()
          .from(memoryExtractionJobs)
          .where(eq(memoryExtractionJobs.id, job.id))
          .for("update");
        if (
          !current ||
          current.status !== "pending" ||
          current.nextRunAt.getTime() > Date.now() ||
          (current.leaseUntil && current.leaseUntil.getTime() > Date.now())
        )
          return false;
        await tx
          .update(memoryExtractionJobs)
          .set({ leaseToken: token, leaseUntil: new Date(Date.now() + 60_000) })
          .where(eq(memoryExtractionJobs.id, job.id));
        return true;
      });
      if (!claimed) continue;
      const provider = await resolveChatProvider(job.userId);
      if (!provider.apiKey) throw new Error("Chat provider unavailable");
      const window = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, job.conversationId),
            lte(messages.id, job.lastMessageId),
            eq(messages.role, "user"),
            sql`COALESCE(${messages.generationStatus}, 'succeeded') = 'succeeded'`,
            isNull(messages.imageUrl)
          )
        )
        .orderBy(desc(messages.id))
        .limit(EXTRACTION_EVERY_N_MESSAGES);
      const candidates = await callExtractionModel(provider, window.reverse());
      await withUserTransaction(job.userId, async tx => {
        const [current] = await tx
          .select()
          .from(memoryExtractionJobs)
          .where(eq(memoryExtractionJobs.id, job.id))
          .for("update");
        if (!current || current.leaseToken !== token) return;
        await storeExtractedMemoriesInTransaction(
          tx,
          job.userId,
          job.girlfriendId,
          candidates
        );
        await enforceMemoryCapacity(
          job.userId,
          job.girlfriendId,
          job.intimacyLevel,
          tx
        );
        await tx
          .delete(memoryExtractionJobs)
          .where(eq(memoryExtractionJobs.id, job.id));
      });
    } catch (error) {
      await db
        .update(memoryExtractionJobs)
        .set({
          attempts: sql`${memoryExtractionJobs.attempts}+1`,
          status: job.attempts >= 4 ? "failed" : "pending",
          leaseToken: null,
          leaseUntil: null,
          nextRunAt: new Date(
            Date.now() + Math.min(3_600_000, 30_000 * 2 ** job.attempts)
          ),
        })
        .where(
          and(
            eq(memoryExtractionJobs.id, job.id),
            eq(memoryExtractionJobs.leaseToken, token)
          )
        );
      log.error("[memory] extraction will retry", {
        jobId: job.id,
        ...providerErrorSummary(error),
      });
    }
  }
}
