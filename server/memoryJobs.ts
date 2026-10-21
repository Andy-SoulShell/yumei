import { getPublishedProductConfig } from "./repositories/productConfig";
/** 使用有期限的数据库租约执行记忆任务，提取结果与任务确认原子提交。 */
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  conversations,
  girlfriends,
  memoryExtractionJobs,
  messages,
} from "../drizzle/schema";
import { resolveChatProvider } from "./_core/chatProvider";
import { log, providerErrorSummary } from "./_core/log";
import { getDb, withUserTransaction } from "./database";
import {
  callExtractionModel,
  enforceMemoryCapacity,
  storeExtractedMemoriesInTransaction,
} from "./memory";
import { memoryFeatureEnabled } from "./aiTaskRuntime";
import { refreshMemoryDerived, sameMemoryRouting } from "./memoryDerived";

/** 多实例可同时调用；过期租约重新认领，达到配置的失败上限时保留任务供排查。 */
export async function runMemoryExtractionJobs(userId?: string): Promise<void> {
  const policy = await getPublishedProductConfig();
  if (!policy.memory.enabled) return;
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
    .limit(policy.memory.jobs.batchSize);
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
        if (current.attempts >= policy.memory.jobs.maxAttempts) {
          await tx
            .update(memoryExtractionJobs)
            .set({ status: "failed", leaseToken: null, leaseUntil: null })
            .where(eq(memoryExtractionJobs.id, current.id));
          return false;
        }
        const [role] = await tx
          .select()
          .from(girlfriends)
          .where(
            and(
              eq(girlfriends.id, current.girlfriendId),
              eq(girlfriends.userId, current.userId),
              isNull(girlfriends.deletedAt)
            )
          )
          .for("update");
        const [conversation] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, current.conversationId),
              eq(conversations.userId, current.userId),
              eq(conversations.girlfriendId, current.girlfriendId)
            )
          );
        if (
          !role?.memoryEnabled ||
          role.memoryEpoch !== current.memoryEpoch ||
          current.lastMessageId <= role.memoryForgottenThroughId ||
          !conversation
        ) {
          await tx
            .delete(memoryExtractionJobs)
            .where(eq(memoryExtractionJobs.id, current.id));
          return false;
        }
        await tx
          .update(memoryExtractionJobs)
          .set({
            leaseToken: token,
            leaseUntil: new Date(
              Date.now() +
                Math.max(
                  policy.memory.jobs.leaseMinimumMs,
                  policy.runtime.ai.taskTimeoutMs +
                    policy.memory.jobs.leasePaddingMs
                )
            ),
          })
          .where(eq(memoryExtractionJobs.id, job.id));
        return true;
      });
      if (!claimed) continue;
      const provider = await resolveChatProvider(job.userId, policy);
      if (!provider.apiKey) throw new Error("Chat provider unavailable");
      const [role] = await db
        .select()
        .from(girlfriends)
        .where(
          and(
            eq(girlfriends.id, job.girlfriendId),
            eq(girlfriends.userId, job.userId)
          )
        );
      if (!role || !role.memoryEnabled || role.memoryEpoch !== job.memoryEpoch)
        continue;
      const window = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, job.conversationId),
            lte(messages.id, job.lastMessageId),
            sql`${messages.id} > ${role.memoryForgottenThroughId}`,
            eq(messages.role, "user"),
            sql`COALESCE(${messages.generationStatus}, 'succeeded') = 'succeeded'`,
            isNull(messages.imageUrl)
          )
        )
        .orderBy(desc(messages.id))
        .limit(policy.memory.extraction.sourceMessageLimit);
      const candidates = await callExtractionModel(
        provider,
        window.reverse(),
        {
          userId: job.userId,
          girlfriendId: job.girlfriendId,
          memoryEpoch: job.memoryEpoch,
        },
        policy
      );
      if (!(await sameMemoryRouting(job.userId, provider)))
        throw new Error("Memory routing changed");
      if ((await getPublishedProductConfig()).revision !== policy.revision)
        throw new Error("Memory configuration changed during extraction");
      let committed = false;
      await withUserTransaction(job.userId, async tx => {
        const [current] = await tx
          .select()
          .from(memoryExtractionJobs)
          .where(eq(memoryExtractionJobs.id, job.id))
          .for("update");
        if (
          !current ||
          current.leaseToken !== token ||
          !current.leaseUntil ||
          current.leaseUntil.getTime() <= Date.now()
        )
          return;
        const [companion] = await tx
          .select()
          .from(girlfriends)
          .where(
            and(
              eq(girlfriends.id, job.girlfriendId),
              eq(girlfriends.userId, job.userId)
            )
          )
          .for("update");
        if (
          companion?.memoryEnabled &&
          !companion.deletedAt &&
          companion.memoryEpoch === job.memoryEpoch &&
          (await memoryFeatureEnabled())
        ) {
          if ((await getPublishedProductConfig()).revision !== policy.revision)
            throw new Error("Memory configuration changed before settlement");
          await storeExtractedMemoriesInTransaction(
            tx,
            job.userId,
            job.girlfriendId,
            candidates,
            job.memoryEpoch,
            policy
          );
          committed = true;
          await enforceMemoryCapacity(
            job.userId,
            job.girlfriendId,
            companion.intimacyLevel,
            tx,
            policy
          );
        }
        await tx
          .delete(memoryExtractionJobs)
          .where(eq(memoryExtractionJobs.id, job.id));
      });
      if (committed)
        await refreshMemoryDerived(
          job.userId,
          job.girlfriendId,
          job.conversationId,
          job.lastMessageId,
          policy
        );
    } catch (error) {
      await db
        .update(memoryExtractionJobs)
        .set({
          attempts: sql`${memoryExtractionJobs.attempts}+1`,
          status:
            job.attempts >= policy.memory.jobs.maxAttempts - 1
              ? "failed"
              : "pending",
          leaseToken: null,
          leaseUntil: null,
          nextRunAt: new Date(
            Date.now() +
              Math.min(
                policy.memory.jobs.retryMaxMs,
                policy.memory.jobs.retryBaseMs * 2 ** job.attempts
              )
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
