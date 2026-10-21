/** 使用真实数据库与磁盘验证关联清理、共享引用和失败重试。 */
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conversations,
  girlfriendMoods,
  girlfriends,
  mediaDeletions,
  memories,
  messages,
  notifications,
  selfies,
} from "../drizzle/schema";
import { getDb } from "./database";
import { flushMediaDeletions, isMediaPendingDeletion } from "./mediaCleanup";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import {
  createConversation,
  createMessage,
} from "./repositories/conversations";
import { createSelfie, deleteSelfie } from "./repositories/photos";
import * as storage from "./storage";
import { createTestGirlfriend } from "./testFixtures";
import { putStagedMedia } from "./managedMedia";

const profile = { name: "YUMEI", personality: "自然", appearance: "自然" };
afterEach(() => vi.restoreAllMocks());

describe("media cleanup", () => {
  it("reclaims an abandoned official upload without requiring a management user record", async () => {
    const key = `official-abandoned-${crypto.randomUUID()}.png`;
    await putStagedMedia(
      "management",
      key,
      Buffer.from("unfinished upload"),
      "image/png"
    );
    const db = (await getDb())!;
    await db
      .update(mediaDeletions)
      .set({ availableAt: new Date(Date.now() - 60000) })
      .where(eq(mediaDeletions.key, key));
    await flushMediaDeletions("management");
    expect(
      await db.select().from(mediaDeletions).where(eq(mediaDeletions.key, key))
    ).toHaveLength(0);
    await expect(storage.storageRead(key)).rejects.toThrow();
  });
  it("deletes all role data and associated files", async () => {
    const userId = `delete-${crypto.randomUUID()}`;
    const reference = await storage.storagePut(`test/${userId}/ref.png`, "ref");
    const photo = await storage.storagePut(`test/${userId}/photo.png`, "photo");
    const avatar = await storage.storagePut(
      `test/${userId}/avatar.png`,
      "avatar"
    );
    const gf = await createTestGirlfriend({
      ...profile,
      userId,
      referenceImageKey: reference.key,
      referenceImageUrl: reference.url,
      avatarKey: avatar.key,
      avatarUrl: avatar.url,
    });
    const conversation = await createConversation({
      userId,
      girlfriendId: gf.id,
    });
    await createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: "photo",
      imageKey: photo.key,
      imageUrl: photo.url,
    });
    await createSelfie({
      userId,
      girlfriendId: gf.id,
      imageKey: photo.key,
      imageUrl: photo.url,
      prompt: "test",
      userContext: "test",
      mode: "direct",
    });
    const db = (await getDb())!;
    await db
      .insert(memories)
      .values({ userId, girlfriendId: gf.id, content: "用户喜欢猫" });
    await db.insert(notifications).values({
      userId,
      girlfriendId: gf.id,
      title: { key: "notifications:title.random", values: { name: "Test" } },
      content: { key: "notifications:heyAreYouFreeIDLoveTo" },
    });
    await db.insert(girlfriendMoods).values({ userId, girlfriendId: gf.id });
    await permanentDeleteGirlfriend(gf.id, userId);
    for (const table of [
      girlfriends,
      conversations,
      selfies,
      memories,
      notifications,
      girlfriendMoods,
    ]) {
      expect(
        await db
          .select({ userId: table.userId })
          .from(table)
          .where(eq(table.userId, userId))
      ).toHaveLength(0);
    }
    expect(
      await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
    ).toHaveLength(0);
    for (const key of [reference.key, photo.key, avatar.key])
      await expect(storage.storageRead(key)).rejects.toThrow();
    await expect(
      permanentDeleteGirlfriend(gf.id, userId)
    ).resolves.toBeUndefined();
  });

  it("keeps a shared file until its final role reference is deleted", async () => {
    const reference = await storage.storagePut(
      `test/shared-${crypto.randomUUID()}.png`,
      "shared"
    );
    const first = await createTestGirlfriend({
      ...profile,
      userId: `first-${crypto.randomUUID()}`,
      referenceImageKey: reference.key,
      referenceImageUrl: reference.url,
    });
    const second = await createTestGirlfriend({
      ...profile,
      userId: `second-${crypto.randomUUID()}`,
      referenceImageKey: reference.key,
      referenceImageUrl: reference.url,
    });
    await permanentDeleteGirlfriend(first.id, first.userId);
    expect((await storage.storageRead(reference.key)).toString()).toBe(
      "shared"
    );
    await permanentDeleteGirlfriend(second.id, second.userId);
    await expect(storage.storageRead(reference.key)).rejects.toThrow();
  });

  it("persists failed deletions, blocks further app reads, and retries successfully", async () => {
    const reference = await storage.storagePut(
      `test/retry-${crypto.randomUUID()}.png`,
      "private"
    );
    const gf = await createTestGirlfriend({
      ...profile,
      userId: `retry-${crypto.randomUUID()}`,
      referenceImageKey: reference.key,
      referenceImageUrl: reference.url,
    });
    const remove = vi
      .spyOn(storage, "storageDelete")
      .mockRejectedValueOnce(new Error("unavailable"));
    await permanentDeleteGirlfriend(gf.id, gf.userId);
    const db = (await getDb())!;
    const [job] = await db
      .select()
      .from(mediaDeletions)
      .where(eq(mediaDeletions.key, reference.key));
    expect(job.attempts).toBe(1);
    expect(await isMediaPendingDeletion(reference.key)).toBe(true);
    remove.mockRestore();
    await db
      .update(mediaDeletions)
      .set({ availableAt: new Date("2020-01-01") })
      .where(eq(mediaDeletions.key, reference.key));
    await flushMediaDeletions(gf.userId);
    expect(await isMediaPendingDeletion(reference.key)).toBe(false);
    await expect(storage.storageRead(reference.key)).rejects.toThrow();
  });

  it("reclaims a gallery-only image while retaining a chat-referenced image", async () => {
    const userId = `gallery-${crypto.randomUUID()}`;
    const gf = await createTestGirlfriend({
      ...profile,
      userId,
      referenceImageKey: "unused-reference",
      referenceImageUrl: "https://example.test/ref",
    });
    for (const linked of [false, true]) {
      const photo = await storage.storagePut(
        `test/${userId}/${linked}.png`,
        "photo"
      );
      const selfie = await createSelfie({
        userId,
        girlfriendId: gf.id,
        imageKey: photo.key,
        imageUrl: photo.url,
        prompt: "test",
        userContext: "test",
        mode: "direct",
      });
      if (linked) {
        const convo = await createConversation({ userId, girlfriendId: gf.id });
        await createMessage({
          conversationId: convo.id,
          role: "assistant",
          content: "photo",
          imageKey: photo.key,
        });
      }
      await deleteSelfie(selfie.id, userId);
      if (linked)
        expect((await storage.storageRead(photo.key)).toString()).toBe("photo");
      else await expect(storage.storageRead(photo.key)).rejects.toThrow();
    }
  });
});
