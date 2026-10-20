/** 管理员读取聚合调用质量与用量，不返回用户、聊天正文或凭据。 */
import { gte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { generationRequests } from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../database";
import { knownUsage } from "../generationTelemetry";

export const operationsRouter = router({
  /** 按 UTC 时间窗口读取最多一千次最近调用样本，明确未知用量和采样边界。 */
  generationQuality: adminProcedure
    .input(
      z
        .object({ days: z.number().int().min(1).max(31).default(7) })
        .default({ days: 7 })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const since = new Date(Date.now() - input.days * 86_400_000);
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
        .limit(1000);
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
