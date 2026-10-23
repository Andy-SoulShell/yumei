/** 真实 MySQL 事务回归：图片任务恢复、幂等结算、重试和删除竞争。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { eq } from "drizzle-orm";
import {
  generationRequests,
  messages,
  selfies,
  users,
} from "../drizzle/schema";
import { getDb } from "./database";
import { createTestGirlfriend } from "./testFixtures";
import {
  createConversation,
  getMessagePage,
} from "./repositories/conversations";
import { deleteConversation } from "./privacy";
import { getDailyMeter } from "./_core/quota";
import {
  ImageTaskProvider,
  ImageTaskOutputError,
} from "./_core/imageTaskProvider";
import {
  acceptImageTask,
  findImageTask,
  getImageTask,
  listImageTasks,
  retryImageTask,
  scanImageTasks,
} from "./imageTasks";
import { expireGenerations, failGeneration } from "./generations";
import { productFixture, stubProductConfig } from "./testProductConfig";
import * as storage from "./storage";
import { flushMediaDeletions } from "./mediaCleanup";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const output = { filename: "image.png", type: "output" };
async function seed() {
  const userId = `image-task-${crypto.randomUUID()}`;
  const role = await createTestGirlfriend({
    userId,
    name: "测试角色",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "official-test-image",
    referenceImageUrl: "/files/official-test-image",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: role.id,
  });
  const [user] = await (await getDb())!
    .select()
    .from(users)
    .where(eq(users.id, userId));
  return {
    user,
    userId,
    role,
    conversation,
    input: {
      clientRequestId: crypto.randomUUID(),
      conversationId: conversation.id,
      userContext: "海边散步",
      generationMode: "text" as const,
    },
  };
}
async function advance(userId: string, id: string) {
  await (await getDb())!
    .update(generationRequests)
    .set({ leaseUntil: null })
    .where(eq(generationRequests.id, id));
  await scanImageTasks([userId]);
}
async function row(id: string) {
  return (
    await (await getDb())!
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, id))
  )[0];
}
beforeEach(() => {
  stubProductConfig("models.image.provider", "comfyui");
  stubProductConfig("models.image.comfyuiBaseUrl", "http://comfy.test:8188");
  stubProductConfig("billing.mode", "free");
  stubProductConfig(
    "billing.plans",
    productFixture.billing.plans.map(plan => ({
      ...plan,
      limits: {
        ...plan.limits,
        dailySelfies: 3,
        monthlySelfies: null,
        couplePhoto: true,
      },
    }))
  );
  vi.spyOn(ImageTaskProvider.prototype, "prepare").mockResolvedValue([]);
  vi.spyOn(ImageTaskProvider.prototype, "submit").mockResolvedValue({
    remoteId: "remote-image",
  });
  vi.spyOn(ImageTaskProvider.prototype, "recover").mockResolvedValue(undefined);
  vi.spyOn(ImageTaskProvider.prototype, "result").mockResolvedValue({
    queued: false,
    output: null,
  });
  vi.spyOn(ImageTaskProvider.prototype, "download").mockResolvedValue({
    buffer: png,
    mimeType: "image/png",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("durable image tasks", () => {
  it("accepts parallel retries once, including after config/credits change; rejects changed input", async () => {
    const a = await seed();
    const tasks = await Promise.all(
      Array.from({ length: 4 }, () => acceptImageTask(a.user, a.input))
    );
    expect(new Set(tasks.map(task => task.id)).size).toBe(1);
    expect(tasks[0]).toMatchObject({ status: "queued", quota: "reserved" });
    expect(await getDailyMeter(a.userId, "selfie")).toBe(1);
    expect(await getMessagePage(a.conversation.id)).toHaveLength(1);
    stubProductConfig("models.image.comfyuiBaseUrl", null);
    expect((await acceptImageTask(a.user, a.input)).id).toBe(tasks[0].id);
    expect((await findImageTask(a.userId, a.input.clientRequestId))?.id).toBe(
      tasks[0].id
    );
    await expect(
      acceptImageTask(a.user, { ...a.input, userContext: "不同场景" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(ImageTaskProvider.prototype.submit).not.toHaveBeenCalled();
  });
  it("reads the same task after leaving; lists only owned active roles with stable pagination", async () => {
    const a = await seed();
    const b = await seed();
    const first = await acceptImageTask(a.user, a.input);
    const second = await acceptImageTask(a.user, {
      ...a.input,
      clientRequestId: crypto.randomUUID(),
    });
    await acceptImageTask(b.user, b.input);
    await expect(getImageTask(b.userId, first.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await findImageTask(b.userId, a.input.clientRequestId)).toBeNull();
    const page = await listImageTasks(a.userId, { limit: 1 });
    const next = await listImageTasks(a.userId, {
      limit: 1,
      cursor: page.nextCursor,
    });
    expect(
      new Set([...page.items, ...next.items].map(task => task.id))
    ).toEqual(new Set([first.id, second.id]));
    expect(page.items[0]).not.toHaveProperty("prompt");
    expect(page.items[0]).not.toHaveProperty("baseUrl");
    await deleteConversation(a.userId, a.conversation.id);
    expect((await listImageTasks(a.userId, {})).items).toHaveLength(0);
    expect(await getDailyMeter(a.userId, "selfie")).toBe(0);
  });
  it("moves from queued to generating to completed and updates the original message once", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input, {
      content: "给我一张自拍",
    });
    const before = await getMessagePage(a.conversation.id);
    expect(before).toHaveLength(2);
    await advance(a.userId, task.id);
    await advance(a.userId, task.id);
    expect(await getImageTask(a.userId, task.id)).toMatchObject({
      status: "generating",
      quota: "reserved",
    });
    vi.mocked(ImageTaskProvider.prototype.result).mockResolvedValue({
      queued: false,
      output,
    });
    await advance(a.userId, task.id);
    await advance(a.userId, task.id);
    expect(await getImageTask(a.userId, task.id)).toMatchObject({
      status: "completed",
      quota: "charged",
      messageId: task.messageId,
    });
    const after = await getMessagePage(a.conversation.id);
    expect(after).toHaveLength(2);
    expect(after.map(message => message.id)).toEqual(
      before.map(message => message.id)
    );
    expect(after[1]).toMatchObject({
      durableImage: true,
      generationStatus: "succeeded",
    });
    expect(await getDailyMeter(a.userId, "selfie")).toBe(1);
    expect(ImageTaskProvider.prototype.submit).toHaveBeenCalledOnce();
  });
  it("returns failed reservations exactly once and creates one retry even across parallel clicks", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input);
    await advance(a.userId, task.id);
    vi.mocked(ImageTaskProvider.prototype.result).mockRejectedValue(
      new ImageTaskOutputError("provider failure")
    );
    await advance(a.userId, task.id);
    await failGeneration(task.id, a.userId);
    expect(await getImageTask(a.userId, task.id)).toMatchObject({
      status: "failed",
      quota: "refunded",
      canRetry: true,
    });
    expect(await getDailyMeter(a.userId, "selfie")).toBe(0);
    const retries = await Promise.all(
      Array.from({ length: 4 }, () => retryImageTask(a.user, task.id))
    );
    expect(new Set(retries.map(item => item.id)).size).toBe(1);
    expect(retries[0].id).not.toBe(task.id);
    expect((await getImageTask(a.userId, task.id)).retryTaskId).toBe(
      retries[0].id
    );
    expect(await getDailyMeter(a.userId, "selfie")).toBe(1);
    expect(await getMessagePage(a.conversation.id)).toHaveLength(2);
  });
  it("recovers an ambiguous submission from the remote queue without submitting twice", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input);
    vi.mocked(ImageTaskProvider.prototype.submit).mockRejectedValue(
      new AxiosError("response lost")
    );
    await advance(a.userId, task.id);
    expect((await row(task.id)).imageTask?.phase).toBe("submitting");
    vi.mocked(ImageTaskProvider.prototype.recover).mockResolvedValue(
      "recovered-image"
    );
    await advance(a.userId, task.id);
    expect((await row(task.id)).imageTask).toMatchObject({
      phase: "running",
      remoteId: "recovered-image",
    });
    vi.mocked(ImageTaskProvider.prototype.result).mockResolvedValue({
      queued: false,
      output,
    });
    await advance(a.userId, task.id);
    expect((await getImageTask(a.userId, task.id)).status).toBe("completed");
    expect(ImageTaskProvider.prototype.submit).toHaveBeenCalledOnce();
  });
  it("never resubmits an unconfirmed task after a lost response or expired lease", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input);
    vi.mocked(ImageTaskProvider.prototype.submit).mockRejectedValue(
      new Error("invalid submit response")
    );
    await advance(a.userId, task.id);
    await advance(a.userId, task.id);
    await (await getDb())!
      .update(generationRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(generationRequests.id, task.id));
    await expireGenerations(a.userId);
    expect(await getImageTask(a.userId, task.id)).toMatchObject({
      status: "failed",
      quota: "refunded",
      canRetry: false,
      failure: "unconfirmed",
    });
    await expect(retryImageTask(a.user, task.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(ImageTaskProvider.prototype.submit).toHaveBeenCalledOnce();
    expect(await getDailyMeter(a.userId, "selfie")).toBe(0);
  });
  it("keeps polling the original task on transient provider failures and retries storage without a second model call", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input);
    await advance(a.userId, task.id);
    vi.mocked(ImageTaskProvider.prototype.result).mockRejectedValueOnce(
      new AxiosError("temporary")
    );
    await advance(a.userId, task.id);
    vi.mocked(ImageTaskProvider.prototype.result).mockResolvedValue({
      queued: false,
      output,
    });
    vi.spyOn(storage, "storagePut").mockRejectedValueOnce(
      new Error("disk unavailable")
    );
    await advance(a.userId, task.id);
    expect((await getImageTask(a.userId, task.id)).status).toBe("generating");
    await advance(a.userId, task.id);
    expect((await getImageTask(a.userId, task.id)).status).toBe("completed");
    expect(ImageTaskProvider.prototype.submit).toHaveBeenCalledOnce();
  });
  it("does not restore deleted conversations or save late images", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input);
    await advance(a.userId, task.id);
    vi.mocked(ImageTaskProvider.prototype.result).mockResolvedValue({
      queued: false,
      output,
    });
    vi.mocked(ImageTaskProvider.prototype.download).mockImplementationOnce(
      async () => {
        await deleteConversation(a.userId, a.conversation.id);
        return { buffer: png, mimeType: "image/png" };
      }
    );
    await advance(a.userId, task.id);
    expect(await row(task.id)).toBeUndefined();
    expect(
      await (await getDb())!
        .select()
        .from(selfies)
        .where(eq(selfies.userId, a.userId))
    ).toHaveLength(0);
    expect(
      await (await getDb())!
        .select()
        .from(messages)
        .where(eq(messages.conversationId, a.conversation.id))
    ).toHaveLength(0);
    expect(await getDailyMeter(a.userId, "selfie")).toBe(0);
    await expect(
      storage.storageRead(`image-${a.userId}-${task.id}.png`)
    ).rejects.toThrow();
  });
  it("retains failed couple references only for the retry window, and reuses them safely", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, {
      clientRequestId: a.input.clientRequestId,
      conversationId: a.conversation.id,
      userContext: "一起散步",
      userPhotoBase64: png.toString("base64"),
      userPhotoMimeType: "image/png",
    });
    await advance(a.userId, task.id);
    vi.mocked(ImageTaskProvider.prototype.result).mockRejectedValueOnce(
      new ImageTaskOutputError("failed")
    );
    await advance(a.userId, task.id);
    const source = await row(task.id);
    expect(source.imageTask?.retryUntil).toBeGreaterThan(Date.now());
    await flushMediaDeletions(a.userId);
    expect(await storage.storageRead(source.temporaryKey!)).toEqual(png);
    const retry = await retryImageTask(a.user, task.id);
    expect((await row(retry.id)).temporaryKey).toBe(source.temporaryKey);
    await advance(a.userId, retry.id);
    vi.mocked(ImageTaskProvider.prototype.result).mockResolvedValue({
      queued: false,
      output,
    });
    await advance(a.userId, retry.id);
    await flushMediaDeletions(a.userId);
    await expect(storage.storageRead(source.temporaryKey!)).rejects.toThrow();
    expect((await getImageTask(a.userId, retry.id)).status).toBe("completed");
  });
  it("reports unmetered requests without claiming a product credit refund", async () => {
    stubProductConfig("billing.mode", "none");
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input);
    await failGeneration(task.id, a.userId);
    expect(await getImageTask(a.userId, task.id)).toMatchObject({
      status: "failed",
      quota: "unmetered",
    });
    expect(await getDailyMeter(a.userId, "selfie")).toBe(0);
  });
  it("retries a timed out task by retrieving its existing remote image rather than generating again", async () => {
    const a = await seed();
    const task = await acceptImageTask(a.user, a.input);
    await advance(a.userId, task.id);
    await (await getDb())!
      .update(generationRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(generationRequests.id, task.id));
    await expireGenerations(a.userId);
    const retry = await retryImageTask(a.user, task.id);
    expect((await row(retry.id)).imageTask?.remoteId).toBe("remote-image");
    vi.mocked(ImageTaskProvider.prototype.result).mockResolvedValue({
      queued: false,
      output,
    });
    await advance(a.userId, retry.id);
    expect((await getImageTask(a.userId, retry.id)).status).toBe("completed");
    expect(ImageTaskProvider.prototype.submit).toHaveBeenCalledOnce();
    expect(await getDailyMeter(a.userId, "selfie")).toBe(1);
  });
});
