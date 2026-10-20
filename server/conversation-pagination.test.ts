/** 验证会话与消息游标、用户内字面量搜索及摘要查询数量。 */
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { conversations } from "../drizzle/schema";
import { getDb } from "./database";
import {
  createConversation,
  createMessage,
  getConversationsWithLastMessage,
  getMessagePage,
  searchConversations,
} from "./repositories/conversations";
import { createTestGirlfriend } from "./testFixtures";

afterEach(() => vi.restoreAllMocks());
const profile = {
  name: "Test",
  personality: "Test",
  appearance: "Test",
  referenceImageKey: "test-ref",
  referenceImageUrl: "https://example.test/ref",
};
it("paginates tied activity timestamps without duplicates using one summary query per page", async () => {
  const userId = `pagination-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({ ...profile, userId });
  const ids: number[] = [];
  const db = (await getDb())!;
  for (let i = 0; i < 5; i++) {
    const conversation = await createConversation({
      userId,
      girlfriendId: gf.id,
      title: `page-${i}`,
    });
    ids.push(conversation.id);
    await createMessage({
      conversationId: conversation.id,
      role: "user",
      content: `message-${i}`,
    });
    await db
      .update(conversations)
      .set({ updatedAt: new Date("2026-01-01") })
      .where(eq(conversations.id, conversation.id));
  }
  const query = vi.spyOn(db, "select");
  const first = await getConversationsWithLastMessage(userId, { limit: 2 });
  expect(query).toHaveBeenCalledTimes(1);
  const second = await getConversationsWithLastMessage(userId, {
    limit: 2,
    cursor: { updatedAt: first[1].updatedAt, id: first[1].id },
  });
  const third = await getConversationsWithLastMessage(userId, {
    limit: 2,
    cursor: { updatedAt: second[1].updatedAt, id: second[1].id },
  });
  expect([...first, ...second, ...third].map(row => row.id)).toEqual(
    ids.reverse()
  );
  expect(first[0].lastMessage).toBe("message-4");
});

it("reads only the requested message page, in ascending order", async () => {
  const userId = `messages-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({ ...profile, userId });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  for (let i = 0; i < 7; i++)
    await createMessage({
      conversationId: conversation.id,
      role: "user",
      content: String(i),
    });
  const newest = await getMessagePage(conversation.id, undefined, 3);
  const older = await getMessagePage(conversation.id, newest[0].id, 3);
  const oldest = await getMessagePage(conversation.id, older[0].id, 3);
  expect([...oldest, ...older, ...newest].map(row => row.content)).toEqual([
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
  ]);
});

it("treats percent and underscore literally and returns only owned conversations across search pages", async () => {
  const userId = `search-page-${crypto.randomUUID()}`;
  const own = await createTestGirlfriend({ ...profile, userId });
  const foreign = await createTestGirlfriend({
    ...profile,
    userId: `other-${crypto.randomUUID()}`,
  });
  for (const gf of [own, own, foreign]) {
    const conversation = await createConversation({
      userId: gf.userId,
      girlfriendId: gf.id,
    });
    await createMessage({
      conversationId: conversation.id,
      role: "user",
      content: "literal %_ match",
    });
    await createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: "a second literal %_ match",
    });
  }
  const first = await searchConversations(userId, "%_", undefined, 1);
  const second = await searchConversations(
    userId,
    "%_",
    first[0].matchedMessageId,
    1
  );
  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(first[0].id).not.toBe(second[0].id);
  expect([...first, ...second].every(row => row.userId === userId)).toBe(true);
  expect(
    await searchConversations(userId, "%_", second[0].matchedMessageId, 1)
  ).toEqual([]);
});

it.each(["%", "_", "!"])(
  "filters conversation summaries with literal %s in names, titles and messages",
  async character => {
    const userId = `summary-search-${crypto.randomUUID()}`;
    const own = await createTestGirlfriend({ ...profile, userId });
    const named = await createTestGirlfriend({
      ...profile,
      userId,
      name: `Name ${character} match`,
    });
    const foreign = await createTestGirlfriend({
      ...profile,
      userId: `foreign-${crypto.randomUUID()}`,
      name: `Foreign ${character} match`,
    });
    const titleMatch = await createConversation({
      userId,
      girlfriendId: own.id,
      title: `Title ${character} match`,
    });
    const nameMatch = await createConversation({
      userId,
      girlfriendId: named.id,
      title: "No match",
    });
    const messageMatch = await createConversation({
      userId,
      girlfriendId: own.id,
      title: "No match",
    });
    await createMessage({
      conversationId: messageMatch.id,
      role: "user",
      content: `Message ${character} match`,
    });
    await createConversation({ userId, girlfriendId: own.id, title: "Other" });
    await createConversation({
      userId: foreign.userId,
      girlfriendId: foreign.id,
      title: `Foreign ${character} match`,
    });
    const results = await getConversationsWithLastMessage(userId, {
      search: character,
    });
    expect(results.map(row => row.id).sort()).toEqual(
      [titleMatch.id, nameMatch.id, messageMatch.id].sort()
    );
  }
);
