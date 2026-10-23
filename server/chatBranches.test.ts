import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { conversations, messages, users } from "../drizzle/schema";
import { getDb } from "./database";
import { createTestGirlfriend, createTestUser } from "./testFixtures";
import { createConversation } from "./repositories/conversations";
import { branchChat } from "./chatBranches";
import * as providers from "./_core/chatProvider";
const db = async () => (await getDb())!;
beforeEach(() =>
  vi.spyOn(providers, "resolveChatProvider").mockResolvedValue({
    name: "openrouter",
    baseUrl: "https://example.test",
    model: "test",
    apiKey: "",
    isByok: false,
  })
);
afterEach(() => vi.restoreAllMocks());
async function seed() {
  const id = await createTestUser();
  const role = await createTestGirlfriend({
    userId: id,
    name: "Mia",
    personality: "warm",
    appearance: "adult",
    referenceImageUrl: "/ref",
    referenceImageKey: "ref",
  });
  const conversation = await createConversation({
    userId: id,
    girlfriendId: role.id,
  });
  await (await db()).insert(messages).values([
    { conversationId: conversation.id, role: "assistant", content: "Hello" },
    { conversationId: conversation.id, role: "user", content: "Tea please" },
    {
      conversationId: conversation.id,
      role: "assistant",
      content: "Tea is ready",
    },
  ]);
  const history = await (
    await db()
  )
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id));
  const [user] = await (
    await db()
  )
    .select()
    .from(users)
    .where(eq(users.id, id));
  return { user, conversation, history };
}
it("edits in an idempotent branch without modifying original messages or losing a failed submission draft", async () => {
  const { user, conversation, history } = await seed();
  const input = {
    conversationId: conversation.id,
    messageId: history.find(row => row.role === "user")!.id,
    clientRequestId: crypto.randomUUID(),
    content: "Coffee please",
  };
  const [a, b] = await Promise.all([
    branchChat(user, input),
    branchChat(user, input),
  ]);
  expect(a.id).toBe(b.id);
  expect(a).toMatchObject({ accepted: false, draft: "Coffee please" });
  expect(
    await (
      await db()
    )
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
  ).toEqual(history);
  const copies = await (
    await db()
  )
    .select()
    .from(messages)
    .where(eq(messages.conversationId, a.id));
  expect(copies.map(row => row.content)).not.toContain("Tea is ready");
  await expect(
    branchChat(user, { ...input, content: "Changed again" })
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("regenerates from the relevant user turn and rejects another account's source conversation", async () => {
  const { user, conversation, history } = await seed();
  const input = {
    conversationId: conversation.id,
    messageId: history.at(-1)!.id,
    clientRequestId: crypto.randomUUID(),
  };
  const result = await branchChat(user, input);
  expect(result.draft).toBe("Tea please");
  const otherId = await createTestUser();
  const [other] = await (
    await db()
  )
    .select()
    .from(users)
    .where(eq(users.id, otherId));
  await expect(
    branchChat(other, { ...input, clientRequestId: crypto.randomUUID() })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (
      await (
        await db()
      )
        .select()
        .from(conversations)
        .where(eq(conversations.id, result.id))
    )[0].branchSourceId
  ).toBe(conversation.id);
});
