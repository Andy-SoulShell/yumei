/** 通过真实事务验证视频幂等、归属、远端任务恢复和一次性额度补偿。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { eq } from "drizzle-orm";
import { generationRequests, messages, users } from "../drizzle/schema";
import { getDb } from "./database";
import { createTestGirlfriend } from "./testFixtures";
import {
  createConversation,
  getMessagePage,
} from "./repositories/conversations";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import { productFixture, stubProductConfig } from "./testProductConfig";
import { ComfyUIVideoClient, buildVideoWorkflow } from "./_core/comfyuiVideo";
import { getDailyMeter } from "./_core/quota";
import {
  acceptVideo,
  cancelVideo,
  getVideo,
  scanVideoTasks,
} from "./videoGeneration";
import * as storage from "./storage";
import {
  videoInputSchema,
  videoTiming,
  videoWorkflowSchema,
} from "../shared/video";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const mp4 = Buffer.from([
  0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115,
  111, 109,
]);
const file = { filename: "test.mp4", type: "output" };
async function seed() {
  const userId = `video-${crypto.randomUUID()}`;
  const role = await createTestGirlfriend({
    userId,
    name: "YUMEI",
    personality: "自然",
    appearance: "自然",
    referenceImageKey: "video-test-ref",
    referenceImageUrl: "/files/video-test-ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: role.id,
  });
  const [user] = await (await getDb())!
    .select()
    .from(users)
    .where(eq(users.id, userId));
  const input = {
    clientRequestId: crypto.randomUUID(),
    conversationId: conversation.id,
    mode: "text" as const,
    prompt: "微笑，缓缓转身，伴随环境声",
    durationSeconds: 5,
    referenceMessageId: null,
  };
  return { userId, role, user, conversation, input };
}
async function advance(userId: string, id: string) {
  await (await getDb())!
    .update(generationRequests)
    .set({ leaseUntil: null })
    .where(eq(generationRequests.id, id));
  await scanVideoTasks([userId]);
}
beforeEach(() => {
  stubProductConfig("models.video.enabled", true);
  stubProductConfig("models.video.comfyuiBaseUrl", "http://comfy.test:8188");
  stubProductConfig("billing.mode", "free");
  stubProductConfig("runtime.video.dailyLimit", 2);
  vi.spyOn(storage, "storageRead").mockResolvedValue(png);
  vi.spyOn(ComfyUIVideoClient.prototype, "upload").mockResolvedValue(
    "yumei-video/ref.png"
  );
  vi.spyOn(ComfyUIVideoClient.prototype, "submit").mockResolvedValue(
    "remote-video-id"
  );
  vi.spyOn(ComfyUIVideoClient.prototype, "recover").mockResolvedValue(
    undefined
  );
  vi.spyOn(ComfyUIVideoClient.prototype, "result").mockResolvedValue(null);
  vi.spyOn(ComfyUIVideoClient.prototype, "download").mockResolvedValue(mp4);
  vi.spyOn(ComfyUIVideoClient.prototype, "cancel").mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("video workflow adaptation", () => {
  it("adapts both supplied templates, aligns frames and preserves the audio graph without mutating the templates", () => {
    for (const mode of ["text", "reference"] as const) {
      const spec = productFixture.models.video.workflows[mode];
      const original = structuredClone(spec);
      const nodes = buildVideoWorkflow(spec, {
        prompt: "用户完整描述",
        durationSeconds: 5,
        reference: "uploaded.png",
        prefix: "yumei-video/test",
      });
      expect(nodes["105:104"].inputs).toMatchObject({
        prompt: "用户完整描述",
        length: 124,
      });
      expect(nodes["105:91"].inputs.audio).toEqual(["105:23", 0]);
      expect(nodes["92"].inputs).toMatchObject({
        format: "mp4",
        codec: "h264",
        filename_prefix: "yumei-video/test",
      });
      if (mode === "reference")
        expect(nodes["136"].inputs.image).toBe("uploaded.png");
      expect(spec).toEqual(original);
      expect(videoTiming(spec, 5).durationSeconds).toBeCloseTo(124 / 24);
    }
  });
  it("rejects missing bindings, invalid FPS, frame constraints and text mode with an image", () => {
    const spec = structuredClone(productFixture.models.video.workflows.text);
    spec.seed.input = "missing";
    expect(videoWorkflowSchema.safeParse(spec).success).toBe(false);
    spec.seed.input = "noise_seed";
    spec.nodes["105:91"].inputs.fps = 0;
    expect(videoWorkflowSchema.safeParse(spec).success).toBe(false);
    spec.nodes["105:91"].inputs.fps = 24;
    spec.frameRemainder = 17;
    expect(videoWorkflowSchema.safeParse(spec).success).toBe(false);
    expect(
      videoInputSchema.safeParse({
        clientRequestId: crypto.randomUUID(),
        conversationId: 1,
        mode: "text",
        referenceMessageId: 9,
        prompt: "test",
        durationSeconds: 5,
      }).success
    ).toBe(false);
  });
});

describe("durable video jobs", () => {
  it("deduplicates concurrent acceptance, binds the payload and reserves quota only once", async () => {
    const { user, input, userId } = await seed();
    const [a, b] = await Promise.all([
      acceptVideo(user, input),
      acceptVideo(user, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(await getDailyMeter(userId, "video")).toBe(1);
    const rows = await (await getDb())!
      .select()
      .from(messages)
      .where(eq(messages.generationRequestId, a.id));
    expect(rows).toHaveLength(1);
    await expect(
      acceptVideo(user, { ...input, prompt: "different" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      acceptVideo(user, { ...input, clientRequestId: crypto.randomUUID() })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
  it("finishes text and image modes, stores a playable file and settles only once", async () => {
    const { user, input, userId } = await seed();
    vi.mocked(ComfyUIVideoClient.prototype.result).mockResolvedValue(file);
    for (const mode of ["text", "reference"] as const) {
      const task = await acceptVideo(user, {
        ...input,
        mode,
        clientRequestId: crypto.randomUUID(),
      });
      await advance(userId, task.id);
      await advance(userId, task.id);
      await advance(userId, task.id);
      const result = await getVideo(userId, task.id);
      expect(result.status).toBe("succeeded");
      expect(result.videoUrl).toMatch(/^\/files\/video-.*\.mp4$/);
      expect(
        await storage.localFileRead(result.videoUrl!.slice("/files/".length))
      ).toEqual(mp4);
      const [message] = await (await getDb())!
        .select()
        .from(messages)
        .where(eq(messages.generationRequestId, task.id));
      expect(message.generationStatus).toBe("succeeded");
      expect(message.imageUrl).toBeNull();
      expect(message.imageKey).toBeTruthy();
      expect(
        (await getMessagePage(input.conversationId)).find(
          item => item.id === message.id
        )?.generationKind
      ).toBe("video");
    }
    expect(ComfyUIVideoClient.prototype.submit).toHaveBeenCalledTimes(2);
    expect(ComfyUIVideoClient.prototype.upload).toHaveBeenCalledTimes(1);
    expect(await getDailyMeter(userId, "video")).toBe(2);
    await expect(
      acceptVideo(user, { ...input, clientRequestId: crypto.randomUUID() })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
  it("recovers a lost submission response from persisted state without submitting again", async () => {
    const { user, input, userId } = await seed();
    vi.mocked(ComfyUIVideoClient.prototype.submit).mockRejectedValue(
      new AxiosError("lost", "ECONNRESET")
    );
    const task = await acceptVideo(user, input);
    await advance(userId, task.id);
    expect((await getVideo(userId, task.id)).phase).toBe("submitting");
    // 模拟进程退出留下的租约；恢复只依赖数据库中的输入和阶段。
    await (await getDb())!
      .update(generationRequests)
      .set({
        leaseToken: "dead-worker",
        leaseUntil: new Date("2020-01-01T00:00:00Z"),
      })
      .where(eq(generationRequests.id, task.id));
    vi.mocked(ComfyUIVideoClient.prototype.recover).mockResolvedValue(
      "recovered-id"
    );
    await scanVideoTasks([userId]);
    expect((await getVideo(userId, task.id)).phase).toBe("running");
    vi.mocked(ComfyUIVideoClient.prototype.result).mockResolvedValue(file);
    await advance(userId, task.id);
    expect((await getVideo(userId, task.id)).status).toBe("succeeded");
    expect(ComfyUIVideoClient.prototype.submit).toHaveBeenCalledTimes(1);
    expect(ComfyUIVideoClient.prototype.result).toHaveBeenCalledWith(
      "recovered-id"
    );
  });
  it("resumes a known remote task after an expired lease and retries storage without regenerating", async () => {
    const { user, input, userId } = await seed();
    const task = await acceptVideo(user, input);
    await advance(userId, task.id);
    vi.mocked(ComfyUIVideoClient.prototype.result).mockResolvedValue(file);
    vi.spyOn(storage, "storagePut").mockRejectedValueOnce(
      new Error("storage unavailable")
    );
    await advance(userId, task.id);
    expect((await getVideo(userId, task.id)).phase).toBe("saving");
    await (await getDb())!
      .update(generationRequests)
      .set({ leaseToken: "old", leaseUntil: new Date("2020-01-01T00:00:00Z") })
      .where(eq(generationRequests.id, task.id));
    await scanVideoTasks([userId]);
    expect((await getVideo(userId, task.id)).status).toBe("succeeded");
    expect(ComfyUIVideoClient.prototype.submit).toHaveBeenCalledTimes(1);
  });
  it("refunds remote failure, expiry and cancellation exactly once", async () => {
    const { user, input, userId } = await seed();
    for (const kind of ["failure", "expiry", "cancel"] as const) {
      const task = await acceptVideo(user, {
        ...input,
        clientRequestId: crypto.randomUUID(),
      });
      if (kind === "cancel") {
        await cancelVideo(userId, task.id);
        await cancelVideo(userId, task.id);
      } else {
        await advance(userId, task.id);
        if (kind === "failure")
          vi.mocked(ComfyUIVideoClient.prototype.result).mockRejectedValueOnce(
            new Error("remote failed")
          );
        else
          await (await getDb())!
            .update(generationRequests)
            .set({ expiresAt: new Date("2020-01-01T00:00:00Z") })
            .where(eq(generationRequests.id, task.id));
        await advance(userId, task.id);
      }
      await advance(userId, task.id);
      expect((await getVideo(userId, task.id)).status).toBe(
        kind === "cancel" ? "cancelled" : "failed"
      );
      expect(await getDailyMeter(userId, "video")).toBe(0);
    }
  });
  it("fails an unconfirmed submission after reconciliation without resubmitting", async () => {
    const { user, input, userId } = await seed();
    vi.mocked(ComfyUIVideoClient.prototype.submit).mockRejectedValue(
      new AxiosError("lost", "ECONNRESET")
    );
    const task = await acceptVideo(user, input);
    await advance(userId, task.id);
    const db = (await getDb())!;
    const [row] = await db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, task.id));
    await db
      .update(generationRequests)
      .set({ videoTask: { ...row.videoTask!, submittedAt: 0 } })
      .where(eq(generationRequests.id, task.id));
    await advance(userId, task.id);
    expect((await getVideo(userId, task.id)).status).toBe("failed");
    expect(ComfyUIVideoClient.prototype.submit).toHaveBeenCalledTimes(1);
    expect(await getDailyMeter(userId, "video")).toBe(0);
  });
  it("keeps the quota and concurrency reservation once a video has been submitted", async () => {
    const { user, input, userId } = await seed();
    const task = await acceptVideo(user, input);
    await advance(userId, task.id);
    await expect(cancelVideo(userId, task.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await getDailyMeter(userId, "video")).toBe(1);
    await expect(
      acceptVideo(user, { ...input, clientRequestId: crypto.randomUUID() })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
  it("rejects cross-user queries, cancellation and first-frame references before spending quota", async () => {
    const a = await seed();
    const b = await seed();
    const task = await acceptVideo(a.user, a.input);
    await expect(getVideo(b.userId, task.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(cancelVideo(b.userId, task.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const db = (await getDb())!;
    const [photo] = await db.insert(messages).values({
      conversationId: a.conversation.id,
      role: "assistant",
      content: "photo",
      imageUrl: "/files/secret.png",
      imageKey: "secret.png",
    });
    await expect(
      acceptVideo(b.user, {
        ...b.input,
        mode: "reference",
        referenceMessageId: Number(photo.insertId),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await getDailyMeter(b.userId, "video")).toBe(0);
    stubProductConfig("models.video.enabled", false);
    await expect(acceptVideo(b.user, b.input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("cleans a late file when its character and task are deleted during download", async () => {
    const { user, input, userId, role } = await seed();
    const task = await acceptVideo(user, input);
    await advance(userId, task.id);
    vi.mocked(ComfyUIVideoClient.prototype.result).mockResolvedValue(file);
    vi.mocked(ComfyUIVideoClient.prototype.download).mockImplementation(
      async () => {
        await permanentDeleteGirlfriend(role.id, userId);
        return mp4;
      }
    );
    await advance(userId, task.id);
    await expect(getVideo(userId, task.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      storage.localFileRead(`video-${userId}-${task.id}.mp4`)
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await getDailyMeter(userId, "video")).toBe(0);
  });
});
