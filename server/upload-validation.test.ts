/** 通过真实上传路由验证损坏编码不会写文件、修改头像或调用付费服务。 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as imageProvider from "./_core/imageProvider";
import * as whisper from "./_core/openaiWhisper";
import { createConversation } from "./repositories/conversations";
import { appRouter } from "./routers";
import * as storage from "./storage";
import { createTestGirlfriend, createTestUser } from "./testFixtures";

const profile = {
  name: "Upload test",
  personality: "自然",
  appearance: "自然",
};
beforeEach(() => {
  vi.stubEnv("BILLING_PROVIDER", "none");
  vi.stubEnv("OPERATOR_OPENAI_KEY", "sk-upload-test-key");
  vi.spyOn(storage, "storagePut").mockImplementation(async key => ({
    key,
    url: `https://example.test/${key}`,
  }));
  vi.spyOn(imageProvider, "resolveImageProvider").mockResolvedValue({
    name: "fal",
    configured: true,
    isByok: false,
    apiKey: "fake-image-key",
  });
  vi.spyOn(imageProvider, "generateProviderImage").mockResolvedValue(
    Buffer.from("image")
  );
  vi.spyOn(whisper, "transcribeWithOpenAI").mockResolvedValue({
    text: "测试录音",
    duration: 3,
    language: "zh",
  } as whisper.TranscriptionResponse);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function seed() {
  const userId = await createTestUser();
  const gf = await createTestGirlfriend({
    ...profile,
    userId,
    referenceImageKey: "test-ref",
    referenceImageUrl: "https://example.test/ref",
  });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const caller = appRouter.createCaller({
    user: { id: userId, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as TrpcContext);
  return { userId, gf, conversation, caller };
}
it.each(["!!!!", "====", "dGVzdA==junk"])(
  "rejects malformed Base64 %s across all upload entry points",
  async value => {
    const a = await seed();
    const results = await Promise.allSettled([
      a.caller.girlfriend.create({
        ...profile,
        referenceImageBase64: value,
        referenceImageMimeType: "image/png",
      }),
      a.caller.girlfriend.uploadAvatar({
        girlfriendId: a.gf.id,
        imageBase64: value,
        mimeType: "image/png",
      }),
      a.caller.selfie.generateCouple({
        conversationId: a.conversation.id,
        userPhotoBase64: value,
        userPhotoMimeType: "image/png",
      }),
      a.caller.voice.transcribe({ audioBase64: value, mimeType: "audio/webm" }),
    ]);
    expect(results.map(result => result.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
      "rejected",
    ]);
    for (const result of results) {
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(storage.storagePut).not.toHaveBeenCalled();
    expect(imageProvider.generateProviderImage).not.toHaveBeenCalled();
    expect(whisper.transcribeWithOpenAI).not.toHaveBeenCalled();
  }
);
it("accepts an avatar at exactly the documented 10MB decoded limit", async () => {
  const a = await seed();
  const data = Buffer.alloc(10 * 1024 * 1024);
  const result = await a.caller.girlfriend.uploadAvatar({
    girlfriendId: a.gf.id,
    imageBase64: data.toString("base64"),
    mimeType: "image/png",
  });
  expect(result.avatarKey).toBeTruthy();
  const upload = vi.mocked(storage.storagePut).mock.calls.at(-1)!;
  expect(upload[0]).toBe(result.avatarKey);
  expect(upload[2]).toBe("image/png");
  const uploaded = upload[1];
  if (!Buffer.isBuffer(uploaded))
    throw new Error("Expected decoded upload bytes");
  expect(uploaded.length).toBe(data.length);
  expect(uploaded.equals(data)).toBe(true);
});
