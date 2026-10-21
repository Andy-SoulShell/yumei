/** 通过实际管理员路由检查聚合统计、未知用量和数据最小化。 */
import { describe, expect, it } from "vitest";
import { aiTaskRuns, generationRequests } from "../drizzle/schema";
import { getDb } from "./database";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";

describe("generation operations", () => {
  it("requires administrator access before reading aggregate usage", async () => {
    const caller = appRouter.createCaller({
      user: { id: "ordinary", role: "user" },
      req: {},
      res: {},
    } as never);
    await expect(caller.operations.generationQuality()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.operations.taskQuality()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("reports bounded internal task aggregates without identifiers or confusing unknown cost with zero", async () => {
    const userId = await createTestUser();
    const version = `tasks-${crypto.randomUUID()}`;
    await (await getDb())!.insert(aiTaskRuns).values([
      {
        id: crypto.randomUUID(),
        userId,
        kind: "memory_query",
        provider: "test",
        model: "test",
        isByok: true,
        promptVersion: version,
        outcome: "succeeded",
        durationMs: 20,
        usage: { inputTokens: 4, outputTokens: 0, costUsd: 0 },
      },
      {
        id: crypto.randomUUID(),
        userId,
        kind: "memory_query",
        provider: "test",
        model: "test",
        isByok: true,
        promptVersion: version,
        outcome: "failed",
        durationMs: 30,
      },
    ]);
    const caller = appRouter.createCaller({
      user: { id: userId, role: "admin" },
      administrator: { id: "management" },
      req: {},
      res: {},
    } as never);
    const result = await caller.operations.taskQuality({ days: 1 });
    expect(
      result.groups.find(item => item.promptVersion === version)
    ).toMatchObject({
      attempts: 2,
      succeeded: 1,
      failed: 1,
      knownInputTokens: 4,
      unknownInputAttempts: 1,
      knownCostUsd: 0,
      unknownCostAttempts: 1,
      durationSamples: 2,
      totalDurationMs: 50,
    });
    expect(result.sampledAttempts).toBeLessThanOrEqual(1000);
    expect(JSON.stringify(result)).not.toContain(userId);
    expect(JSON.stringify(result)).not.toMatch(/sourceMessage|apiKey|content/);
  });
  it("separates provider success from business failure and known zero from unknown", async () => {
    const userId = await createTestUser();
    const db = (await getDb())!;
    const promptVersion = `qa-${crypto.randomUUID()}`;
    const telemetry = {
      promptVersion,
      provider: "test",
      model: "test",
      isByok: false,
      inputTokens: 100,
      outputTokens: 10,
      costUsd: 0,
      durationMs: 100,
      outcome: "succeeded" as const,
    };
    await db.insert(generationRequests).values([
      {
        id: crypto.randomUUID(),
        userId,
        conversationId: -1,
        kind: "chat",
        status: "succeeded",
        expiresAt: new Date(),
        telemetry,
      },
      {
        id: crypto.randomUUID(),
        userId,
        conversationId: -1,
        kind: "chat",
        status: "failed",
        expiresAt: new Date(),
        telemetry: {
          ...telemetry,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          durationMs: 200,
        },
      },
    ]);
    const caller = appRouter.createCaller({
      user: { id: userId, role: "admin" },
      administrator: { id: "management" },
      req: {},
      res: {},
    } as never);
    const report = await caller.operations.generationQuality({ days: 1 });
    const group = report.groups.find(
      item => item.promptVersion === promptVersion
    )!;
    expect(group).toMatchObject({
      requests: 2,
      businessSucceeded: 1,
      providerSucceeded: 2,
      knownInputTokens: 100,
      unknownInputRequests: 1,
      knownOutputTokens: 10,
      unknownOutputRequests: 1,
      knownCostUsd: 0,
      unknownCostRequests: 1,
      medianDurationMs: 100,
      p95DurationMs: 200,
    });
    expect(report.sampledRequests).toBeLessThanOrEqual(1000);
    expect(JSON.stringify(report)).not.toContain(userId);
    expect(JSON.stringify(report)).not.toMatch(
      /chatInput|apiKey|assistantMessage/
    );
  });
});
