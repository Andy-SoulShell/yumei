/** 首页最近角色按真实消息排序，隔离用户、过滤回收站并限制十个。 */
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { girlfriends } from "../drizzle/schema";
import { getDb } from "./database";
import { createTestGirlfriend } from "./testFixtures";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import { getRecentUserGirlfriends } from "./repositories/companions";
import { appRouter } from "./routers";

const profile = {
  name: "Test",
  personality: "Test",
  appearance: "Test",
  referenceImageKey: "test-ref",
  referenceImageUrl: "https://example.test/ref",
};
async function chat(userId: string, girlfriendId: number, date: string) {
  const conversation = await createConversation({ userId, girlfriendId });
  await createMessage({
    conversationId: conversation.id,
    role: "user",
    content: "你好",
    createdAt: new Date(date),
  });
}
it("orders each owned role once by its latest message across conversations, with unchatted roles last", async () => {
  const userId = `recent-${crypto.randomUUID()}`;
  const first = await createTestGirlfriend({
    ...profile,
    userId,
    name: "最近聊天",
  });
  const second = await createTestGirlfriend({
    ...profile,
    userId,
    name: "之前聊天",
  });
  const untouched = await createTestGirlfriend({
    ...profile,
    userId,
    name: "从未聊天",
  });
  const removed = await createTestGirlfriend({
    ...profile,
    userId,
    name: "已删除",
  });
  const foreign = await createTestGirlfriend({
    ...profile,
    userId: `foreign-${crypto.randomUUID()}`,
  });
  await chat(userId, first.id, "2026-01-20T00:00:00Z");
  await chat(userId, second.id, "2026-01-19T00:00:00Z");
  await chat(userId, first.id, "2026-01-18T00:00:00Z");
  await chat(userId, removed.id, "2026-01-22T00:00:00Z");
  await chat(foreign.userId, foreign.id, "2026-01-23T00:00:00Z");
  // 新建空会话、修改角色资料都不应改变聊天顺序。
  await createConversation({ userId, girlfriendId: second.id });
  const db = (await getDb())!;
  await db
    .update(girlfriends)
    .set({ updatedAt: new Date() })
    .where(eq(girlfriends.id, second.id));
  await db
    .update(girlfriends)
    .set({ deletedAt: new Date() })
    .where(eq(girlfriends.id, removed.id));
  const caller = appRouter.createCaller({
    user: { id: userId },
    req: {},
    res: {},
  } as any);
  const roles = await caller.girlfriend.recent();
  expect(roles.map(role => role.id)).toEqual([
    first.id,
    second.id,
    untouched.id,
  ]);
  expect(roles[0].lastChattedAt).toEqual(new Date("2026-01-20T00:00:00Z"));
  expect(roles[2].lastChattedAt).toBeNull();
  expect(roles[0]).not.toHaveProperty("personality");
});
it("returns at most ten unique roles with a stable order for tied timestamps", async () => {
  const userId = `recent-limit-${crypto.randomUUID()}`;
  const ids: number[] = [];
  for (let i = 0; i < 12; i++) {
    const role = await createTestGirlfriend({ ...profile, userId });
    ids.push(role.id);
    await chat(userId, role.id, "2026-01-20T00:00:00Z");
  }
  const roles = await getRecentUserGirlfriends(userId);
  expect(roles).toHaveLength(10);
  expect(roles.map(role => role.id)).toEqual(ids.reverse().slice(0, 10));
});
it("rejects anonymous access to recent characters", async () => {
  const caller = appRouter.createCaller({
    user: null,
    req: {},
    res: {},
  } as any);
  await expect(caller.girlfriend.recent()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});
