/** 验证上传补偿、头像替换、临时音频期限和慢存储不占用用户事务锁。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { mediaDeletions } from "../drizzle/schema";
import { createTestGirlfriend, createTestUser } from "./testFixtures";
import { putStagedMedia, publishMedia } from "./managedMedia";
import { flushMediaDeletions, isMediaPendingDeletion } from "./mediaCleanup";
import { getDb, updateGirlfriend, withUserTransaction } from "./db";
import * as storage from "./storage";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as whisper from "./_core/openaiWhisper";
import * as data from "./db";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const profile = {
  name: "Test",
  personality: "Test",
  appearance: "Test",
  referenceImageKey: "test-ref",
  referenceImageUrl: "https://example.test/ref",
};
describe("managed media lifecycle", () => {
  it("reclaims a reference when role creation fails and validates avatar ownership before uploading", async () => {
    vi.stubEnv("BILLING_PROVIDER", "none");
    const userId = await createTestUser();
    const foreign = await createTestGirlfriend({
      ...profile,
      userId: await createTestUser(),
    });
    const caller = appRouter.createCaller({
      user: { id: userId },
      req: {},
      res: {},
    } as TrpcContext);
    const upload = vi.spyOn(storage, "storagePut");
    await expect(
      caller.girlfriend.uploadAvatar({
        girlfriendId: foreign.id,
        imageBase64: "dGVzdA==",
        mimeType: "image/png",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(upload).not.toHaveBeenCalled();
    vi.spyOn(data, "createGirlfriend").mockRejectedValue(
      new Error("create failed")
    );
    await expect(
      caller.girlfriend.create({
        name: "Test",
        personality: "Test",
        appearance: "Test",
        referenceImageBase64: "dGVzdA==",
        referenceImageMimeType: "image/png",
      })
    ).rejects.toThrow("create failed");
    const key = upload.mock.calls[0][0];
    await expect(storage.storageRead(key)).rejects.toThrow();
  });
  it("retains temporary playback until expiry and reclaims abandoned uploads", async () => {
    const userId = await createTestUser();
    const key = `test/ttl-${crypto.randomUUID()}.mp3`;
    await putStagedMedia(
      userId,
      key,
      Buffer.from("audio"),
      "audio/mpeg",
      86_400_000
    );
    await flushMediaDeletions(userId);
    expect((await storage.storageRead(key)).toString()).toBe("audio");
    expect(await isMediaPendingDeletion(key)).toBe(false);
    const db = (await getDb())!;
    await db
      .update(mediaDeletions)
      .set({ availableAt: new Date("2020-01-01") })
      .where(eq(mediaDeletions.key, key));
    expect(await isMediaPendingDeletion(key)).toBe(true);
    await flushMediaDeletions(userId);
    await expect(storage.storageRead(key)).rejects.toThrow();
  });
  it("releases the previous avatar and retains the newly published reference", async () => {
    const userId = await createTestUser();
    const old = await putStagedMedia(
      userId,
      `test/old-${crypto.randomUUID()}.png`,
      Buffer.from("old"),
      "image/png"
    );
    const gf = await createTestGirlfriend({
      ...profile,
      userId,
      avatarKey: old.key,
      avatarUrl: old.url,
    });
    const fresh = await putStagedMedia(
      userId,
      `test/new-${crypto.randomUUID()}.png`,
      Buffer.from("new"),
      "image/png"
    );
    await updateGirlfriend(gf.id, userId, {
      avatarKey: fresh.key,
      avatarUrl: fresh.url,
    });
    await flushMediaDeletions(userId);
    await expect(storage.storageRead(old.key)).rejects.toThrow();
    expect((await storage.storageRead(fresh.key)).toString()).toBe("new");
  });
  it("does not retain the user lock during slow storage and rejects publishing a claimed object", async () => {
    const userId = await createTestUser();
    const gf = await createTestGirlfriend({ ...profile, userId });
    const key = `test/slow-${crypto.randomUUID()}.png`;
    await putStagedMedia(userId, key, Buffer.from("old"), "image/png", 0);
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>(resolve => (release = resolve));
    const started = new Promise<void>(resolve => (entered = resolve));
    const remove = vi
      .spyOn(storage, "storageDelete")
      .mockImplementation(async () => {
        entered();
        await blocked;
      });
    const cleaning = flushMediaDeletions(userId);
    await started;
    try {
      await updateGirlfriend(gf.id, userId, { name: "Changed while deleting" });
      await expect(
        withUserTransaction(userId, tx => publishMedia(tx, userId, [key]))
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      release();
      await cleaning;
      remove.mockRestore();
    }
  });
  it("passes audio bytes directly to transcription and never uploads original recordings", async () => {
    vi.stubEnv("BILLING_PROVIDER", "none");
    vi.stubEnv("OPERATOR_OPENAI_KEY", "sk-fake-transcription-test");
    const userId = await createTestUser();
    const caller = appRouter.createCaller({
      user: { id: userId, birthDate: new Date("1990-01-01") },
      req: {},
      res: {},
    } as TrpcContext);
    const upload = vi.spyOn(storage, "storagePut");
    const transcribe = vi
      .spyOn(whisper, "transcribeWithOpenAI")
      .mockResolvedValue({
        text: "你好",
        duration: 3,
        language: "zh",
      } as whisper.TranscriptionResponse);
    const result = await caller.voice.transcribe({
      audioBase64: Buffer.from("test-audio").toString("base64"),
      mimeType: "audio/webm",
    });
    expect(result.transcriptionId).toBeTruthy();
    expect(transcribe.mock.calls[0][0].audio.data).toEqual(
      Buffer.from("test-audio")
    );
    expect(upload).not.toHaveBeenCalled();
    vi.stubEnv("OPERATOR_OPENAI_KEY", "");
    await expect(
      caller.voice.transcribe({ audioBase64: "dGVzdA==" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(upload).not.toHaveBeenCalled();
  });
});
