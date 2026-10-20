/** 通过真实结算验证心情并发、奖励来源、失败回滚及一次性语音凭据。 */
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  girlfriendMoods,
  girlfriends,
  usageMeters,
  voiceTranscriptions,
} from "../drizzle/schema";
import { METERS } from "../shared/quotas";
import type { TrpcContext } from "./_core/context";
import type { TranscriptionResponse } from "./_core/openaiWhisper";
import { getDb } from "./database";
import {
  completeImageGeneration,
  completeTextGeneration,
  reserveGeneration,
} from "./generations";
import { updateGirlfriend } from "./repositories/companions";
import {
  createConversation,
  getConversationMessages,
} from "./repositories/conversations";
import { getIntimacyInfo } from "./repositories/intimacy";
import { getGirlfriendMood } from "./repositories/moods";
import { appRouter } from "./routers";
import { createTestGirlfriend } from "./testFixtures";
import { saveTranscription } from "./transcriptions";

async function seed() {
  const userId = `relationship-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "Test",
    personality: "Test",
    appearance: "Test",
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const caller = appRouter.createCaller({
    user: { id: userId },
    req: {},
    res: {},
  } as TrpcContext);
  const send = async (
    content = "你好，我今天好开心",
    reply = "我也喜欢你",
    transcriptionId?: string
  ) => {
    const id = await reserveGeneration({
      userId,
      conversationId: conversation.id,
      kind: "chat",
      transcriptionId,
    });
    return completeTextGeneration(id, userId, content, reply);
  };
  return { userId, gf, conversation, caller, send };
}
afterEach(() => vi.useRealTimers());

describe("server-owned relationship settlement", () => {
  it.each(["short", "capped"])(
    "records committed %s messages as interaction without granting extra experience",
    async mode => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
      const a = await seed();
      const db = (await getDb())!;
      await db
        .update(girlfriends)
        .set({
          intimacyPoints: 1234,
          intimacyLevel: 7,
          consecutiveDays: 3,
          lastInteractionAt: new Date(),
        })
        .where(eq(girlfriends.id, a.gf.id));
      for (const day of [19, 20]) {
        vi.setSystemTime(new Date(`2026-10-${day}T12:00:00Z`));
        if (mode === "capped")
          await db.insert(usageMeters).values({
            userId: a.userId,
            period: `2026-10-${day}`,
            meter: METERS.intimacyPoints(a.gf.id),
            count: 200,
          });
        await a.send(
          mode === "short" ? "你好" : "这是一条已经达到奖励上限的消息"
        );
      }
      const state = await getIntimacyInfo(a.gf.id, a.userId);
      expect(state.intimacyPoints).toBe(1234);
      expect(state.lastInteractionAt).toEqual(new Date("2026-10-20T12:00:00Z"));
      expect(state.consecutiveDays).toBe(5);
    }
  );
  it.each(["你好", "很久不见，我回来了，今天想继续和你聊聊"])(
    "preserves earned experience after absence, regardless of prior reads: %s",
    async content => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
      const a = await seed();
      const b = await seed();
      const db = (await getDb())!;
      for (const target of [a, b])
        await db
          .update(girlfriends)
          .set({
            intimacyPoints: 1234,
            intimacyLevel: 7,
            lastInteractionAt: new Date("2026-10-09T12:00:00Z"),
          })
          .where(eq(girlfriends.id, target.gf.id));
      expect((await getIntimacyInfo(b.gf.id, b.userId)).intimacyPoints).toBe(
        1234
      );
      const first = await a.send(content);
      const second = await b.send(content);
      expect(first.relationship.intimacyPoints).toBe(
        content.length < 5 ? 1234 : 1236
      );
      expect(first.relationship).toEqual(second.relationship);
      expect((await getIntimacyInfo(a.gf.id, a.userId)).decayed).toBe(0);
    }
  );
  it("levels up through 50 committed text rounds without a minute-long pause and settles each request once", async () => {
    const a = await seed();
    let upgraded = false;
    for (let i = 0; i < 50; i++) {
      const saved = await a.send(
        `这是第${i + 1}轮有效的文字聊天`,
        "我在认真听"
      );
      upgraded ||= saved.relationship.leveledUp;
    }
    const info = await getIntimacyInfo(a.gf.id, a.userId);
    expect(info.intimacyPoints).toBeGreaterThanOrEqual(100);
    expect(info.intimacyLevel).toBeGreaterThan(1);
    expect(upgraded).toBe(true);
  });
  it("keeps cooldowns and daily point limits independent for companions on the same account", async () => {
    const a = await seed();
    const second = await createTestGirlfriend({
      userId: a.userId,
      name: "Second",
      personality: "自然",
      appearance: "自然",
      referenceImageKey: "test-ref-2",
      referenceImageUrl: "https://example.test/ref2",
    });
    const bConversation = await createConversation({
      userId: a.userId,
      girlfriendId: second.id,
    });
    await a.send();
    const id = await reserveGeneration({
      userId: a.userId,
      conversationId: bConversation.id,
      kind: "chat",
    });
    await completeTextGeneration(
      id,
      a.userId,
      "另一位角色也应该独立获得亲密度经验",
      "我也很高兴"
    );
    expect(
      (await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints
    ).toBeGreaterThan(0);
    expect(
      (await getIntimacyInfo(second.id, a.userId)).intimacyPoints
    ).toBeGreaterThan(0);
  });
  it("returns null for a fresh role and rejects missing or foreign roles", async () => {
    const a = await seed(),
      b = await seed();
    expect(await a.caller.mood.get({ girlfriendId: a.gf.id })).toBeNull();
    await expect(
      a.caller.mood.get({ girlfriendId: b.gf.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(a.caller.mood.get({ girlfriendId: -1 })).rejects.toMatchObject(
      { code: "NOT_FOUND" }
    );
  });
  it("settles every committed user and assistant message once under concurrency", async () => {
    const a = await seed();
    await Promise.all(Array.from({ length: 8 }, () => a.send()));
    const mood = await getGirlfriendMood(a.userId, a.gf.id);
    expect(mood?.totalMessages).toBe(16);
    expect(mood?.todayMessages).toBe(16);
    expect(mood?.moodScore).toBeGreaterThanOrEqual(70);
    const db = (await getDb())!;
    expect(
      await db
        .select()
        .from(girlfriendMoods)
        .where(
          and(
            eq(girlfriendMoods.userId, a.userId),
            eq(girlfriendMoods.girlfriendId, a.gf.id)
          )
        )
    ).toHaveLength(1);
    expect(
      (await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints
    ).toBeGreaterThan(0);
  });
  it("rolls back messages, mood and rewards if the assistant cannot be saved", async () => {
    const a = await seed();
    await expect(
      a.send("这是一条足够长的测试消息", "x".repeat(70_000))
    ).rejects.toThrow();
    expect(await getConversationMessages(a.conversation.id)).toEqual([]);
    expect(await getGirlfriendMood(a.userId, a.gf.id)).toBeNull();
    expect((await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints).toBe(0);
  });
  it("rejects client-forged reward and mood mutation endpoints", async () => {
    const a = await seed();
    await expect(
      (a.caller.girlfriend as any).addPoints({
        girlfriendId: a.gf.id,
        reason: "selfie",
      })
    ).rejects.toThrow();
    await expect(
      (a.caller.mood as any).update({
        girlfriendId: a.gf.id,
        messageContent: "fake",
        isUserMessage: true,
      })
    ).rejects.toThrow();
    expect((await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints).toBe(0);
  });
  it("awards a successful photo once and only rewards actual profile changes", async () => {
    const a = await seed();
    const id = await reserveGeneration({
      userId: a.userId,
      conversationId: a.conversation.id,
      kind: "selfie",
    });
    const image = {
      imageKey: "test-photo",
      imageUrl: "https://example.test/photo",
      prompt: "test",
      userContext: "test",
      mode: "direct" as const,
    };
    await completeImageGeneration(id, a.userId, image);
    const before = (await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints;
    expect(before).toBeGreaterThanOrEqual(10);
    await expect(
      completeImageGeneration(id, a.userId, image)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await updateGirlfriend(a.gf.id, a.userId, { personality: "Changed" });
    const after = (await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints;
    expect(after).toBeGreaterThan(before);
    await updateGirlfriend(a.gf.id, a.userId, { personality: "Changed" });
    expect((await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints).toBe(
      after
    );
  });
  it("uses server-issued transcription text and duration and rejects replay, expiry and cross-account use", async () => {
    const a = await seed(),
      b = await seed();
    const content = "这是一段真实转写的语音消息";
    const issue = () =>
      saveTranscription(a.userId, {
        text: content,
        duration: 35,
      } as TranscriptionResponse);
    const receipt = await issue();
    await expect(b.send(content, "reply", receipt)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(a.send("forged text", "reply", receipt)).rejects.toMatchObject(
      { code: "BAD_REQUEST" }
    );
    await a.send(content, "reply", receipt);
    const points = (await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints;
    expect(points).toBeGreaterThanOrEqual(10);
    await expect(a.send(content, "reply", receipt)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const expired = await issue();
    const db = (await getDb())!;
    await db
      .update(voiceTranscriptions)
      .set({ expiresAt: new Date("2020-01-01") })
      .where(eq(voiceTranscriptions.id, expired));
    await expect(a.send(content, "reply", expired)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect((await getIntimacyInfo(a.gf.id, a.userId)).intimacyPoints).toBe(
      points
    );
  });
});
