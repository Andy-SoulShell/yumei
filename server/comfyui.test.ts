import { stubProductConfig } from "./testProductConfig";
/** 覆盖图片生成的工作流适配与业务约束。 */

import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComfyUIClient } from "./_core/comfyui";
import * as providers from "./_core/imageProvider";
import { keyProvider } from "./_core/keyProvider";
import * as generations from "./generations";
import * as cleanup from "./mediaCleanup";
import * as apiConfigDb from "./repositories/apiConfig";
import * as companionsDb from "./repositories/companions";
import * as conversationsDb from "./repositories/conversations";
import * as photosDb from "./repositories/photos";
import { appRouter } from "./routers";
import * as storage from "./storage";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
let sequence = 0;
const caller = () =>
  appRouter.createCaller({
    user: { id: `comfy-test-${sequence++}`, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as any);

beforeEach(() => {
  vi.spyOn(generations, "reserveGeneration").mockResolvedValue("mock-request");
  vi.spyOn(generations, "failGeneration").mockResolvedValue(undefined);
  vi.spyOn(cleanup, "flushMediaDeletions").mockResolvedValue(undefined);
  vi.spyOn(cleanup, "queueMediaDeletion").mockResolvedValue(undefined);
  vi.spyOn(generations, "completeImageGeneration").mockImplementation(
    async (_id, _userId, image, content) =>
      ({
        selfie: { ...image, girlfriendId: 12 },
        message: { ...image, content: "[自拍照片]" },
        userMessage: content === undefined ? undefined : { content },
        imageGeneration: "completed",
      }) as any
  );
  vi.spyOn(generations, "failImageGeneration").mockImplementation(
    async (_id, _userId, content) =>
      ({
        selfie: null,
        message: {
          content: "这次自拍没有生成成功，本次未扣额度",
          generationStatus: "failed",
        },
        userMessage: { content },
        imageGeneration: "failed",
      }) as any
  );

  stubProductConfig("models.image.provider", "comfyui");
  stubProductConfig("models.image.comfyuiBaseUrl", "http://comfy:8188");
  vi.stubEnv("COMFYUI_API_KEY", "private-comfy-token");
  stubProductConfig("billing.mode", "none");
  vi.spyOn(keyProvider, "resolve").mockResolvedValue({
    value: null,
    source: "none",
  });
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
    vi.spyOn(conversationsDb, "getConversation").mockResolvedValue({
      id: 1,
    } as any);
    vi.spyOn(companionsDb, "getActiveGirlfriend").mockResolvedValue({
      id: 2,
      name: "小桃",
      appearance: "黑色长发",
      intimacyLevel: 1,
      memoryEpoch: 0,
      memoryForgottenThroughId: 0,
      referenceImageKey: "ref.png",
      referenceImageUrl: "http://localhost:3000/files/ref.png",
    } as any);
    vi.spyOn(conversationsDb, "getRecentMessages").mockResolvedValue([]);
    vi.spyOn(storage, "storagePut").mockResolvedValue({
      key: "generated.png",
      url: "http://localhost:3000/files/generated.png",
    });
    vi.spyOn(photosDb, "createSelfie").mockImplementation(
      async data => data as any
    );
    vi.spyOn(conversationsDb, "createMessage").mockImplementation(
      async data => data as any
    );
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
      }),
      expect.objectContaining({ runtime: expect.any(Object) })
    );
    expect(generations.completeImageGeneration).toHaveBeenCalledWith(
      "mock-request",
      expect.any(String),
      expect.objectContaining({
        imageUrl: "http://localhost:3000/files/generated.png",
      }),
      undefined
    );
    expect(result.message.imageUrl).toBe("/files/generated.png");
    expect(result.selfie?.imageUrl).toBe("/files/generated.png");
    expect(key).not.toHaveBeenCalled();
    expect(conversationsDb.getRecentMessages).not.toHaveBeenCalled();
  });

  it.each(["reference", "text"] as const)(
    "passes a long camera request intact in %s mode without the selected pose or old chats",
    async generationMode => {
      vi.spyOn(conversationsDb, "getConversation").mockResolvedValue({
        id: 1,
        girlfriendId: 2,
      } as any);
      vi.spyOn(companionsDb, "getActiveGirlfriend").mockResolvedValue({
        id: 2,
        appearance: "成年女性，黑色长发",
        intimacyLevel: 10,
        referenceImageKey: "ref.png",
        referenceImageUrl: "/files/ref.png",
      } as any);
      const history = vi
        .spyOn(conversationsDb, "getRecentMessages")
        .mockResolvedValue([
          { id: 1, role: "assistant", content: "咖啡厅，蓝色衬衫，正面特写" },
        ] as any);
      vi.spyOn(storage, "storagePut").mockResolvedValue({
        key: "generated.png",
        url: "/files/generated.png",
      });
      const generate = vi
        .spyOn(providers, "generateProviderImage")
        .mockResolvedValue(png);
      const userContext =
        "细节要求。".repeat(250) +
        "\n海边侧面全身，红色长裙，双手自然下垂，不拿手机";
      await caller().selfie.generate({
        conversationId: 1,
        userContext,
        poseId: "sweet_smile",
        generationMode,
      });
      const prompt = generate.mock.calls[0][1].prompt;
      expect(prompt.endsWith(userContext)).toBe(true);
      expect(prompt).not.toContain("咖啡厅");
      expect(prompt).not.toContain("蓝色衬衫");
      expect(prompt).not.toMatch(
        /close-up|sweet smile|phone held at arm's length/
      );
      expect(history).not.toHaveBeenCalled();
      expect(generations.completeImageGeneration).toHaveBeenCalledWith(
        "mock-request",
        expect.any(String),
        expect.objectContaining({ prompt, userContext }),
        undefined
      );
    }
  );

  it("checks conversation ownership and intimacy before submitting a task", async () => {
    const conversation = vi
      .spyOn(conversationsDb, "getConversation")
      .mockResolvedValue(undefined);
    const generate = vi.spyOn(providers, "generateProviderImage");
    await expect(
      caller().selfie.generate({ conversationId: 1, userContext: "test" })
    ).rejects.toThrow("not owned");
    conversation.mockResolvedValue({ id: 1 } as any);
    vi.spyOn(companionsDb, "getActiveGirlfriend").mockResolvedValue({
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
    vi.mocked(keyProvider.resolve).mockResolvedValue({
      value: "user-fal-key",
      source: "user",
    });
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
    vi.spyOn(apiConfigDb, "getUserApiConfig").mockResolvedValue(undefined);
    vi.spyOn(keyProvider, "get").mockResolvedValue(null);
    const result = await caller().apiConfig.get();
    expect(result.imageProvider).toMatchObject({
      name: "comfyui",
      configured: true,
      supportsTextToImage: true,
    });
    expect(JSON.stringify(result)).not.toContain("private-comfy-token");
    expect(JSON.stringify(result)).not.toContain("comfy:8188");
  });
});
