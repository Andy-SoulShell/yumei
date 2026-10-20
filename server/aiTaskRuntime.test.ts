import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiTaskRuns } from "../drizzle/schema";
import { runMeteredAiTask, type AiTaskContext } from "./aiTaskRuntime";
import { getDb } from "./database";
import { createTestGirlfriend, createTestUser } from "./testFixtures";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import { setMemoryEnabled } from "./memory";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function context(
  kind: AiTaskContext["kind"] = "memory_extract"
): Promise<AiTaskContext> {
  const userId = await createTestUser();
  return {
    userId,
    kind,
    provider: "openrouter",
    model: "test-model",
    isByok: true,
    promptVersion: "test/1",
  };
}

describe("internal AI attempt budget and known provider usage", () => {
  it.each(["memory_extract", "memory_index"] as const)(
    "retains received usage when %s validation fails",
    async kind => {
      const ctx = await context(kind);
      await expect(
        runMeteredAiTask(ctx, async (_signal, reportUsage) => {
          reportUsage({ prompt_tokens: 31, completion_tokens: 7, cost: 0 });
          throw new Error("invalid provider result; secret-text");
        })
      ).rejects.toThrow("invalid provider result");
      const [run] = await (await getDb())!
        .select()
        .from(aiTaskRuns)
        .where(eq(aiTaskRuns.userId, ctx.userId));
      expect(run.outcome).toBe("failed");
      expect(run.usage).toEqual({
        inputTokens: 31,
        outputTokens: 7,
        costUsd: 0,
      });
      expect(JSON.stringify(run)).not.toContain("secret-text");
    }
  );
  it("atomically limits concurrent attempts and keeps failed attempts charged", async () => {
    vi.stubEnv("AI_DAILY_TASK_LIMIT", "1");
    const ctx = await context();
    const work = vi.fn(async () => {
      throw new Error("upstream failed");
    });
    const result = await Promise.allSettled([
      runMeteredAiTask(ctx, work),
      runMeteredAiTask(ctx, work),
    ]);
    expect(result.every(item => item.status === "rejected")).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    await expect(runMeteredAiTask(ctx, work)).rejects.toThrow("daily budget");
    expect(work).toHaveBeenCalledTimes(1);
  });
  it("does not turn total-only text generation usage into known input tokens", async () => {
    const ctx = await context();
    await runMeteredAiTask(ctx, async () => ({
      value: true,
      usage: { total_tokens: 40, completion_tokens: 10 },
    }));
    const [run] = await (await getDb())!
      .select()
      .from(aiTaskRuns)
      .where(eq(aiTaskRuns.userId, ctx.userId));
    expect(run.usage).toEqual({
      inputTokens: null,
      outputTokens: 10,
      costUsd: null,
    });
  });
  it("aborts an unresponsive task and leaves a failed, unknown-cost attempt", async () => {
    vi.stubEnv("AI_TASK_TIMEOUT_MS", "100");
    const ctx = await context();
    let signal: AbortSignal | undefined;
    await expect(
      runMeteredAiTask(ctx, async value => {
        signal = value;
        return new Promise<never>(() => {});
      })
    ).rejects.toThrow("timed out");
    expect(signal?.aborted).toBe(true);
    const [run] = await (await getDb())!
      .select()
      .from(aiTaskRuns)
      .where(eq(aiTaskRuns.userId, ctx.userId));
    expect(run).toMatchObject({ outcome: "failed", usage: { costUsd: null } });
  });
  it.each(["memory_index", "summary"] as const)(
    "does not start or charge a prepared %s attempt after pause changed its epoch",
    async kind => {
      const ctx = await context(kind);
      const gf = await createTestGirlfriend({
        userId: ctx.userId,
        name: "test",
        personality: "test",
        appearance: "test",
        referenceImageKey: "task-guard",
        referenceImageUrl: "/files/task-guard",
      });
      await setMemoryEnabled(ctx.userId, gf.id, false);
      const work = vi.fn(async () => ({ value: true }));
      await expect(
        runMeteredAiTask(
          { ...ctx, girlfriendId: gf.id, memoryEpoch: gf.memoryEpoch },
          work
        )
      ).rejects.toThrow("no longer active");
      expect(work).not.toHaveBeenCalled();
      expect(
        await (await getDb())!
          .select()
          .from(aiTaskRuns)
          .where(eq(aiTaskRuns.userId, ctx.userId))
      ).toHaveLength(0);
    }
  );
  it("keeps a role's attempt receipt after deleting that role", async () => {
    vi.stubEnv("AI_DAILY_TASK_LIMIT", "1");
    const ctx = await context();
    const gf = await createTestGirlfriend({
      userId: ctx.userId,
      name: "test",
      personality: "test",
      appearance: "test",
      referenceImageKey: "task-test",
      referenceImageUrl: "/files/task-test",
    });
    await runMeteredAiTask(
      { ...ctx, girlfriendId: gf.id, memoryEpoch: gf.memoryEpoch },
      async () => ({
        value: true,
      })
    );
    await permanentDeleteGirlfriend(gf.id, ctx.userId);
    const [run] = await (await getDb())!
      .select()
      .from(aiTaskRuns)
      .where(eq(aiTaskRuns.userId, ctx.userId));
    expect(run.girlfriendId).toBeNull();
    await expect(
      runMeteredAiTask(ctx, async () => ({ value: true }))
    ).rejects.toThrow("daily budget");
  });
});
