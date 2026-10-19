/** 覆盖图片生成的工作流适配与业务约束。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import * as db from "./db";
import * as storage from "./storage";
import * as providers from "./_core/imageProvider";
import { ComfyUIClient } from "./_core/comfyui";
import { keyProvider } from "./_core/keyProvider";
import { appRouter } from "./routers";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
let sequence = 0;
const caller = () =>
  appRouter.createCaller({
    user: { id: `comfy-test-${sequence++}`, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as any);

beforeEach(() => {
  vi.stubEnv("IMAGE_PROVIDER", "comfyui");
  vi.stubEnv("COMFYUI_BASE_URL", "http://comfy:8188");
  vi.stubEnv("COMFYUI_API_KEY", "private-comfy-token");
  vi.stubEnv("BILLING_PROVIDER", "none");
  vi.spyOn(keyProvider, "describeUserKeys").mockResolvedValue({
    fal: { isSet: false },
  } as any);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("ComfyUI selfie integration", () => {
  it("generates text-to-image without a fal key and persists the image in chat and gallery", async () => {
    vi.spyOn(db, "getConversation").mockResolvedValue({ id: 1 } as any);
    vi.spyOn(db, "getActiveGirlfriend").mockResolvedValue({
      id: 2,
      appearance: "黑色长发",
      intimacyLevel: 1,
      referenceImageKey: "ref.png",
      referenceImageUrl: "http://localhost:3000/files/ref.png",
    } as any);
    vi.spyOn(storage, "storagePut").mockResolvedValue({
      key: "generated.png",
      url: "http://localhost:3000/files/generated.png",
    });
    const saveSelfie = vi
      .spyOn(db, "createSelfie")
      .mockImplementation(async data => data as any);
    vi.spyOn(db, "createMessage").mockImplementation(async data => data as any);
    const generate = vi
      .spyOn(providers, "generateProviderImage")
      .mockResolvedValue(png);
    const key = vi.spyOn(keyProvider, "get");
    const result = await caller().selfie.generate({
      conversationId: 1,
      userContext: "在公园散步",
      poseId: "casual",
      generationMode: "text",
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "comfyui" }),
      expect.objectContaining({
        mode: "text",
        prompt: expect.stringContaining("黑色长发"),
      })
    );
    expect(saveSelfie).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: result.message.imageUrl })
    );
    expect(key).not.toHaveBeenCalled();
  });

  it("checks conversation ownership and intimacy before submitting a task", async () => {
    const conversation = vi
      .spyOn(db, "getConversation")
      .mockResolvedValue(undefined);
    const generate = vi.spyOn(providers, "generateProviderImage");
    await expect(
      caller().selfie.generate({ conversationId: 1, userContext: "test" })
    ).rejects.toThrow("not owned");
    conversation.mockResolvedValue({ id: 1 } as any);
    vi.spyOn(db, "getActiveGirlfriend").mockResolvedValue({
      id: 2,
      intimacyLevel: 1,
    } as any);
    await expect(
      caller().selfie.generate({
        conversationId: 1,
        userContext: "test",
        poseId: "alluring",
        generationMode: "text",
      })
    ).rejects.toThrow("LEVEL_LOCKED");
    expect(generate).not.toHaveBeenCalled();
  });

  it("reads reference bytes from storage without asking the remote server to fetch localhost", async () => {
    const read = vi.spyOn(storage, "storageRead").mockResolvedValue(png);
    const get = vi.spyOn(axios, "get");
    const generate = vi
      .spyOn(ComfyUIClient.prototype, "generate")
      .mockResolvedValue(png);
    const provider = await providers.resolveImageProvider("u");
    await providers.generateProviderImage(provider, {
      mode: "reference",
      prompt: "自拍",
      references: [
        { key: "ref.png", url: "http://localhost:3000/files/ref.png" },
      ],
    });
    expect(read).toHaveBeenCalledWith("ref.png");
    expect(get).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        references: [{ data: png, mimeType: "image/png" }],
      })
    );
  });

  it("uses a user's fal key only at fal endpoints, even when ComfyUI is configured", async () => {
    vi.mocked(keyProvider.describeUserKeys).mockResolvedValue({
      fal: { isSet: true },
    } as any);
    vi.spyOn(keyProvider, "get").mockResolvedValue("user-fal-key");
    const provider = await providers.resolveImageProvider("u");
    expect(provider).toMatchObject({
      name: "fal",
      isByok: true,
      apiKey: "user-fal-key",
    });
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { images: [{ url: "https://fal.example/result.png" }] },
    });
    vi.spyOn(axios, "get").mockResolvedValue({ data: png });
    await providers.generateProviderImage(provider, {
      mode: "reference",
      prompt: "自拍",
      references: [{ key: "ref.png", url: "https://app.example/ref.png" }],
    });
    expect(post).toHaveBeenCalledWith(
      "https://fal.run/fal-ai/grok-imagine-image-edit",
      expect.any(Object),
      expect.objectContaining({
        headers: { Authorization: "Key user-fal-key" },
      })
    );
    expect(JSON.stringify(post.mock.calls)).not.toContain(
      "private-comfy-token"
    );
  });

  it("exposes provider capabilities without its URL or secret", async () => {
    vi.spyOn(db, "getUserApiConfig").mockResolvedValue(undefined);
    vi.spyOn(keyProvider, "get").mockResolvedValue(null);
    const result = await caller().apiConfig.get();
    expect(result.imageProvider).toEqual({
      name: "comfyui",
      configured: true,
      supportsTextToImage: true,
    });
    expect(JSON.stringify(result)).not.toContain("private-comfy-token");
    expect(JSON.stringify(result)).not.toContain("comfy:8188");
  });
});
