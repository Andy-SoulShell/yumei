import type { ProductConfig } from "../shared/productConfig";
import { getPublishedProductConfig } from "./repositories/productConfig";
/** 内部外部调用的预算、超时与脱敏计量。失败的真实调用仍占用预算。 */
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  aiTaskRuns,
  companionPreferences,
  girlfriends,
} from "../drizzle/schema";
import { getDb, withUserTransaction } from "./database";
import { knownUsage } from "./generationTelemetry";
import { log } from "./_core/log";

export function runtimeInteger(
  name: string,
  fallback: number,
  min: number,
  max: number
) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`Invalid runtime limit: ${name}`);
  return value;
}

export async function memoryFeatureEnabled(configuration?: ProductConfig) {
  return (configuration ?? (await getPublishedProductConfig())).memory.enabled;
}

export async function getCompanionPreferences(userId: string) {
  const db = (await getDb())!;
  const [row] = await db
    .select()
    .from(companionPreferences)
    .where(eq(companionPreferences.userId, userId));
  return (
    row ?? {
      userId,
      ...(await getPublishedProductConfig()).proactive.defaults,
      revision: 0,
    }
  );
}

export type AiTaskContext = {
  userId: string;
  girlfriendId?: number;
  memoryEpoch?: number;
  kind: typeof aiTaskRuns.$inferInsert.kind;
  provider: string;
  model: string;
  isByok: boolean;
  promptVersion: string;
};

type ProviderUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  cost?: unknown;
};

/** 在调用前原子占用每日尝试次数；不持有数据库事务等待外部响应。 */
export async function runMeteredAiTask<T>(
  context: AiTaskContext,
  work: (
    signal: AbortSignal,
    reportUsage: (usage: ProviderUsage | undefined) => void
  ) => Promise<{
    value: T;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
      cost?: unknown;
    };
  }>
): Promise<T> {
  const limit = runtimeInteger("AI_DAILY_TASK_LIMIT", 200, 1, 10_000);
  const timeoutMs = runtimeInteger("AI_TASK_TIMEOUT_MS", 30_000, 100, 120_000);
  const start = Date.now();
  const id = crypto.randomUUID();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  await withUserTransaction(context.userId, async tx => {
    if (
      context.girlfriendId !== undefined &&
      (context.kind.startsWith("memory_") || context.kind === "summary")
    ) {
      const [role] = await tx
        .select({
          epoch: girlfriends.memoryEpoch,
          enabled: girlfriends.memoryEnabled,
        })
        .from(girlfriends)
        .where(
          and(
            eq(girlfriends.id, context.girlfriendId),
            eq(girlfriends.userId, context.userId),
            isNull(girlfriends.deletedAt)
          )
        )
        .for("update");
      if (
        !(await memoryFeatureEnabled()) ||
        !role?.enabled ||
        context.memoryEpoch === undefined ||
        role.epoch !== context.memoryEpoch
      )
        throw new Error("Memory task context is no longer active");
    }
    const [count] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(aiTaskRuns)
      .where(
        and(
          eq(aiTaskRuns.userId, context.userId),
          gte(aiTaskRuns.createdAt, since)
        )
      );
    if (Number(count.count) >= limit)
      throw new Error("AI task daily budget reached");
    const { memoryEpoch: _memoryEpoch, ...metadata } = context;
    await tx
      .insert(aiTaskRuns)
      .values({ id, ...metadata, createdAt: new Date() });
  });
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: "succeeded" | "failed" = "failed";
  let usage: NonNullable<typeof aiTaskRuns.$inferSelect.usage> = {
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
  };
  const reportUsage = (raw: ProviderUsage | undefined) => {
    if (!raw) return;
    usage = {
      inputTokens:
        knownUsage(
          raw.prompt_tokens ??
            (context.kind === "memory_index" || context.kind === "memory_query"
              ? raw.total_tokens
              : undefined)
        ) ?? usage.inputTokens,
      outputTokens: knownUsage(raw.completion_tokens) ?? usage.outputTokens,
      costUsd: knownUsage(raw.cost) ?? usage.costUsd,
    };
  };
  try {
    const result = await Promise.race([
      work(controller.signal, reportUsage),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("AI task timed out"));
        }, timeoutMs);
      }),
    ]);
    outcome = "succeeded";
    reportUsage(result.usage);
    return result.value;
  } finally {
    clearTimeout(timer);
    controller.abort();
    try {
      const db = (await getDb())!;
      await db
        .update(aiTaskRuns)
        .set({
          outcome,
          usage,
          durationMs: Math.min(2_147_483_647, Date.now() - start),
        })
        .where(
          and(eq(aiTaskRuns.id, id), eq(aiTaskRuns.userId, context.userId))
        );
    } catch {
      log.warn("[ai-task] telemetry write failed", {
        taskId: id,
        kind: context.kind,
        outcome,
      });
    }
  }
}
