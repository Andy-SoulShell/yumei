import { getPublishedProductConfig } from "../repositories/productConfig";
/** 管理员读取聚合调用质量与用量，不返回用户、聊天正文或凭据。 */
import { gte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { aiTaskRuns, generationRequests } from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../database";
import { knownUsage } from "../generationTelemetry";

export const operationsRouter = router({
  /** 内部任务按类型/版本/服务分组，采样边界与未知成本明确返回。 */
  taskQuality: adminProcedure
    .input(
      z
        .object({ days: z.number().int().min(1).max(365).optional() })
        .default({})
    )
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rules = (await getPublishedProductConfig()).experience.operations;
      const days = input.days ?? rules.defaultDays;
      if (days > rules.maxDays)
        throw new Error(`统计窗口最多 ${rules.maxDays} 天`);
      const since = new Date(Date.now() - days * 86_400_000);
      const [total] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(aiTaskRuns)
        .where(gte(aiTaskRuns.createdAt, since));
      const rows = await db
        .select({
          kind: aiTaskRuns.kind,
          provider: aiTaskRuns.provider,
          model: aiTaskRuns.model,
          promptVersion: aiTaskRuns.promptVersion,
          outcome: aiTaskRuns.outcome,
          usage: aiTaskRuns.usage,
          durationMs: aiTaskRuns.durationMs,
        })
        .from(aiTaskRuns)
        .where(gte(aiTaskRuns.createdAt, since))
        .orderBy(desc(aiTaskRuns.createdAt), desc(aiTaskRuns.id))
        .limit(rules.sampleSize);
      const groups = new Map<
        string,
        {
          kind: string;
          provider: string;
          model: string;
          promptVersion: string;
          attempts: number;
          succeeded: number;
          failed: number;
          pending: number;
          knownInputTokens: number;
          knownOutputTokens: number;
          unknownInputAttempts: number;
          unknownOutputAttempts: number;
          knownCostUsd: number;
          unknownCostAttempts: number;
          durationSamples: number;
          totalDurationMs: number;
        }
      >();
      for (const row of rows) {
        const key = JSON.stringify([
          row.kind,
          row.provider,
          row.model,
          row.promptVersion,
        ]);
        let group = groups.get(key);
        if (!group) {
          group = {
            kind: row.kind,
            provider: row.provider,
            model: row.model,
            promptVersion: row.promptVersion,
            attempts: 0,
            succeeded: 0,
            failed: 0,
            pending: 0,
            knownInputTokens: 0,
            knownOutputTokens: 0,
            unknownInputAttempts: 0,
            unknownOutputAttempts: 0,
            knownCostUsd: 0,
            unknownCostAttempts: 0,
            durationSamples: 0,
            totalDurationMs: 0,
          };
          groups.set(key, group);
        }
        group.attempts++;
        group[row.outcome]++;
        const inputTokens = knownUsage(row.usage?.inputTokens),
          outputTokens = knownUsage(row.usage?.outputTokens),
          cost = knownUsage(row.usage?.costUsd),
          duration = knownUsage(row.durationMs);
        if (inputTokens === null) group.unknownInputAttempts++;
        else group.knownInputTokens += inputTokens;
        if (outputTokens === null) group.unknownOutputAttempts++;
        else group.knownOutputTokens += outputTokens;
        if (cost === null) group.unknownCostAttempts++;
        else group.knownCostUsd += cost;
        if (duration !== null) {
          group.durationSamples++;
          group.totalDurationMs += duration;
        }
      }
      return {
        since,
        totalAttempts: Number(total.count),
        sampledAttempts: rows.length,
        truncated: Number(total.count) > rows.length,
        groups: Array.from(groups.values()),
      };
    }),
  /** 按 UTC 时间窗口读取最多一千次最近调用样本，明确未知用量和采样边界。 */
  generationQuality: adminProcedure
    .input(
      z
        .object({ days: z.number().int().min(1).max(365).optional() })
        .default({})
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const rules = (await getPublishedProductConfig()).experience.operations;
      const days = input.days ?? rules.defaultDays;
      if (days > rules.maxDays)
        throw new Error(`统计窗口最多 ${rules.maxDays} 天`);
      const since = new Date(Date.now() - days * 86_400_000);
      const [total] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(generationRequests)
        .where(gte(generationRequests.createdAt, since));
      const rows = await db
        .select({
          status: generationRequests.status,
          telemetry: generationRequests.telemetry,
        })
        .from(generationRequests)
        .where(gte(generationRequests.createdAt, since))
        .orderBy(
          desc(generationRequests.createdAt),
          desc(generationRequests.id)
        )
        .limit(rules.sampleSize);
      const groups = new Map<
        string,
        {
          promptVersion: string;
          provider: string;
          model: string;
          requests: number;
          businessSucceeded: number;
          providerSucceeded: number;
          knownInputTokens: number;
          unknownInputRequests: number;
          knownOutputTokens: number;
          unknownOutputRequests: number;
          knownCostUsd: number;
          unknownCostRequests: number;
          durationMs: number[];
        }
      >();
      for (const row of rows) {
        const t = row.telemetry;
        const promptVersion = t?.promptVersion ?? "unknown",
          provider = t?.provider ?? "unknown",
          model = t?.model ?? "unknown";
        const key = JSON.stringify([promptVersion, provider, model]);
        let group = groups.get(key);
        if (!group) {
          group = {
            promptVersion,
            provider,
            model,
            requests: 0,
            businessSucceeded: 0,
            providerSucceeded: 0,
            knownInputTokens: 0,
            unknownInputRequests: 0,
            knownOutputTokens: 0,
            unknownOutputRequests: 0,
            knownCostUsd: 0,
            unknownCostRequests: 0,
            durationMs: [],
          };
          groups.set(key, group);
        }
        group.requests++;
        if (row.status === "succeeded") group.businessSucceeded++;
        if (t?.outcome === "succeeded") group.providerSucceeded++;
        const input = knownUsage(t?.inputTokens),
          output = knownUsage(t?.outputTokens),
          cost = knownUsage(t?.costUsd),
          duration = knownUsage(t?.durationMs);
        if (input === null) group.unknownInputRequests++;
        else group.knownInputTokens += input;
        if (output === null) group.unknownOutputRequests++;
        else group.knownOutputTokens += output;
        if (cost === null) group.unknownCostRequests++;
        else group.knownCostUsd += cost;
        if (duration !== null) group.durationMs.push(duration);
      }
      return {
        since,
        totalRequests: Number(total.count),
        sampledRequests: rows.length,
        truncated: Number(total.count) > rows.length,
        groups: Array.from(groups.values()).map(({ durationMs, ...group }) => {
          durationMs.sort((a, b) => a - b);
          return {
            ...group,
            durationSamples: durationMs.length,
            medianDurationMs: durationMs.length
              ? durationMs[Math.ceil(durationMs.length * 0.5) - 1]
              : null,
            p95DurationMs: durationMs.length
              ? durationMs[Math.ceil(durationMs.length * 0.95) - 1]
              : null,
          };
        }),
      };
    }),
});
