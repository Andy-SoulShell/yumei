import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "../drizzle/schema";
import { getDb } from "./database";
import { createTestGirlfriend, createTestUser } from "./testFixtures";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import {
  deleteAccount,
  deleteConversation,
  deletionStatus,
  exportAccountData,
  requestAccountDeletion,
} from "./privacy";
import * as email from "./_core/email";
import * as storage from "./storage";
import { flushMediaDeletions } from "./mediaCleanup";
import { putStagedMedia } from "./managedMedia";
const db = async () => (await getDb())!;
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const userId = await createTestUser();
  const role = await createTestGirlfriend({
    userId,
    name: "My character",
    personality: "Kind",
    appearance: "Natural",
    referenceImageUrl: "https://example.test/reference",
    referenceImageKey: "shared-fixture-reference",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: role.id,
  });
  const message = await createMessage({
    conversationId: conversation.id,
    role: "user",
    content: "Private conversation",
  });
  return { userId, role, conversation, message };
}
async function confirmation(userId: string) {
  const database = await db();
  await database
    .update(s.users)
    .set({ emailVerified: true })
    .where(eq(s.users.id, userId));
  const send = vi.spyOn(email, "sendAccountDeletionEmail").mockResolvedValue();
  await requestAccountDeletion(userId, "zh-CN");
  const token = new URL(send.mock.calls.at(-1)![0].url).hash.split("=")[1];
  return { token, email: `${userId}@example.test` };
}
it("exports only the current user's content, excluding authentication secrets and encrypted keys", async () => {
  const a = await fixture(),
    b = await fixture();
  const database = await db();
  await database.insert(s.accounts).values({
    id: randomUUID(),
    userId: a.userId,
    accountId: a.userId,
    providerId: "credential",
    password: "password-hash-do-not-export",
  });
  await database.insert(s.userKeys).values({
    userId: a.userId,
    name: "openrouter",
    encryptedValue: "encrypted-secret-do-not-export",
  });
  const result = await exportAccountData(a.userId),
    text = JSON.stringify(result);
  expect(result.messages.map(m => m.id)).toEqual([a.message.id]);
  expect(text).not.toContain(b.userId);
  expect(text).not.toContain("do-not-export");
  expect(result.characters).toHaveLength(1);
});
it("denies another account's conversation and removes only the target source memories and messages", async () => {
  const a = await fixture(),
    b = await fixture();
  const other = await createConversation({
    userId: a.userId,
    girlfriendId: a.role.id,
  });
  const keep = await createMessage({
    conversationId: other.id,
    role: "user",
    content: "Keep my other conversation",
  });
  const database = await db();
  await database.insert(s.memories).values([
    {
      userId: a.userId,
      girlfriendId: a.role.id,
      content: "Delete this fact",
      sourceMessageId: a.message.id,
    },
    {
      userId: a.userId,
      girlfriendId: a.role.id,
      content: "Keep this fact",
      sourceMessageId: keep.id,
    },
  ]);
  await expect(
    deleteConversation(b.userId, a.conversation.id)
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await deleteConversation(a.userId, a.conversation.id);
  expect(
    await database
      .select()
      .from(s.messages)
      .where(eq(s.messages.conversationId, a.conversation.id))
  ).toHaveLength(0);
  expect(
    await database.select().from(s.messages).where(eq(s.messages.id, keep.id))
  ).toHaveLength(1);
  expect(
    (
      await database
        .select()
        .from(s.memories)
        .where(eq(s.memories.userId, a.userId))
    ).map(x => x.content)
  ).toEqual(["Keep this fact"]);
  expect(
    (
      await database
        .select()
        .from(s.girlfriends)
        .where(eq(s.girlfriends.id, a.role.id))
    )[0].memoryEpoch
  ).toBe(a.role.memoryEpoch + 1);
});
it("stores a hash, requires a verified email, throttles resends and never returns a deletion token", async () => {
  const id = await createTestUser();
  await expect(requestAccountDeletion(id, "zh-CN")).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const { token } = await confirmation(id);
  const [row] = await (
    await db()
  )
    .select()
    .from(s.verifications)
    .where(eq(s.verifications.identifier, `account-deletion:${id}`));
  expect(row.value).toBe(createHash("sha256").update(token).digest("hex"));
  await expect(requestAccountDeletion(id, "zh-CN")).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
});
it("invalid, expired and another account's token do not remove anything", async () => {
  const a = await fixture(),
    b = await fixture(),
    proof = await confirmation(a.userId);
  await expect(
    deleteAccount(b.userId, proof.token, `${b.userId}@example.test`)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    deleteAccount(a.userId, "f".repeat(48), proof.email)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await (
    await db()
  )
    .update(s.verifications)
    .set({ expiresAt: new Date("2000-01-01T00:00:00Z") })
    .where(eq(s.verifications.identifier, `account-deletion:${a.userId}`));
  await expect(
    deleteAccount(a.userId, proof.token, proof.email)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(
    await (await db()).select().from(s.users).where(eq(s.users.id, a.userId))
  ).toHaveLength(1);
});
it("rechecks auto-renewal at final confirmation even if a subscription is created after the email", async () => {
  const id = await createTestUser(),
    proof = await confirmation(id);
  const database = await db();
  await database.insert(s.subscriptions).values({
    userId: id,
    lsSubscriptionId: randomUUID(),
    plan: "plus",
    status: "paused",
  });
  await expect(
    deleteAccount(id, proof.token, proof.email)
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await database
    .update(s.subscriptions)
    .set({ status: "cancelled" })
    .where(eq(s.subscriptions.userId, id));
  await deleteAccount(id, proof.token, proof.email);
  expect(
    await database.select().from(s.users).where(eq(s.users.id, id))
  ).toHaveLength(0);
});
it("atomically removes account, trash, messages, credentials, outstanding login links and other devices while preserving another account", async () => {
  const a = await fixture(),
    b = await fixture(),
    proof = await confirmation(a.userId);
  const database = await db();
  await database
    .update(s.girlfriends)
    .set({ deletedAt: new Date() })
    .where(eq(s.girlfriends.id, a.role.id));
  await database.insert(s.sessions).values({
    id: randomUUID(),
    userId: a.userId,
    token: "private-session",
    expiresAt: new Date(Date.now() + 10000),
  });
  await database.insert(s.verifications).values({
    id: randomUUID(),
    identifier: "magic-" + randomUUID(),
    value: JSON.stringify({ email: proof.email }),
    expiresAt: new Date(Date.now() + 10000),
  });
  await database
    .insert(s.userKeys)
    .values({ userId: a.userId, name: "openrouter", encryptedValue: "secret" });
  const result = await deleteAccount(a.userId, proof.token, proof.email);
  for (const table of [s.girlfriends, s.conversations, s.sessions, s.userKeys])
    expect(
      await database.select().from(table).where(eq(table.userId, a.userId))
    ).toHaveLength(0);
  expect(
    await database
      .select()
      .from(s.messages)
      .where(eq(s.messages.id, a.message.id))
  ).toHaveLength(0);
  expect(
    await database.select().from(s.users).where(eq(s.users.id, b.userId))
  ).toHaveLength(1);
  expect(await deletionStatus(result.receipt)).toEqual({
    accountDeleted: true,
    mediaPending: false,
  });
  await expect(
    deleteAccount(a.userId, proof.token, proof.email)
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
it("continues media deletion after the user row is gone and reports pending cleanup without exposing identity", async () => {
  const id = await createTestUser(),
    proof = await confirmation(id),
    database = await db();
  const key = `account-${randomUUID()}.png`;
  await database
    .update(s.users)
    .set({ image: `/files/${key}` })
    .where(eq(s.users.id, id));
  const del = vi
    .spyOn(storage, "storageDelete")
    .mockRejectedValue(new Error("Storage temporarily unavailable"));
  const { receipt } = await deleteAccount(id, proof.token, proof.email);
  expect(await deletionStatus(receipt)).toEqual({
    accountDeleted: true,
    mediaPending: true,
  });
  del.mockResolvedValue();
  await database
    .update(s.mediaDeletions)
    .set({ availableAt: new Date("2000-01-01T00:00:00Z") })
    .where(eq(s.mediaDeletions.key, key));
  await flushMediaDeletions(id);
  expect(await deletionStatus(receipt)).toEqual({
    accountDeleted: true,
    mediaPending: false,
  });
});
it("does not let a slow upload leave an object behind after account deletion", async () => {
  const id = await createTestUser(),
    proof = await confirmation(id);
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>(r => (started = r)),
    blocked = new Promise<void>(r => (release = r));
  vi.spyOn(storage, "storagePut").mockImplementation(async key => {
    started();
    await blocked;
    return { key, url: `/files/${key}` };
  });
  const del = vi.spyOn(storage, "storageDelete").mockResolvedValue();
  const key = `slow-account-${randomUUID()}`;
  const upload = putStagedMedia(id, key, Buffer.from("private"), "image/png");
  const failure = expect(upload).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await ready;
  const { receipt } = await deleteAccount(id, proof.token, proof.email);
  expect((await deletionStatus(receipt)).mediaPending).toBe(true);
  release();
  await failure;
  expect(del).toHaveBeenCalledWith(key);
  expect((await deletionStatus(receipt)).mediaPending).toBe(false);
});
