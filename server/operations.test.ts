/** 通过实际管理员路由检查聚合统计、未知用量和数据最小化。 */
import { describe, expect, it } from "vitest";
import { generationRequests } from "../drizzle/schema";
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
