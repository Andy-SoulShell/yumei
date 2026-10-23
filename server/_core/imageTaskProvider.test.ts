/** 图片队列协议测试：固定标记、原任务恢复和有界结果下载。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import type { ImageTask } from "../../shared/imageTasks";
import { productFixture } from "../testProductConfig";
import { ImageTaskProvider } from "./imageTaskProvider";
import * as storage from "../storage";

function task(provider: "comfyui" | "fal" = "comfyui"): ImageTask {
  return {
    fingerprint: "test",
    input: { conversationId: 1, userContext: "海边", generationMode: "text" },
    prompt: "scene",
    promptMode: "direct",
    provider,
    isByok: false,
    model: "fal-ai/flux/edit",
    baseUrl: "http://comfy.test",
    workflow: productFixture.models.image.workflows.text,
    runtime: productFixture.runtime.image,
    maxReferenceBytes: 1024,
    references: [{ key: "ref", url: "https://images.test/ref.png" }],
    phase: "running",
    remoteId: "remote-image",
    statusUrl: "https://queue.fal.run/fal-ai/flux/requests/remote-image/status",
    responseUrl: "https://queue.fal.run/fal-ai/flux/requests/remote-image",
  };
}
afterEach(() => vi.restoreAllMocks());
describe("persistent image provider protocol", () => {
  it("keeps supported GIF character references usable in the new task path", async () => {
    const input = task();
    input.input.generationMode = "reference";
    vi.spyOn(storage, "storageRead").mockResolvedValue(
      Buffer.from("GIF89a-test-image")
    );
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { name: "reference.gif", subfolder: "yumei-image" },
    });
    expect(
      await new ImageTaskProvider(input, null).prepare("local-request")
    ).toEqual(["yumei-image/reference.gif"]);
    const form = post.mock.calls[0][1] as FormData;
    expect((form.get("image") as File).type).toBe("image/gif");
  });
  it("submits a stable ComfyUI request marker and output prefix without changing the template", async () => {
    const input = task();
    const original = structuredClone(input.workflow);
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { prompt_id: "remote-image" } });
    const result = await new ImageTaskProvider(input, "test-only-token").submit(
      "local-request",
      []
    );
    expect(result).toEqual({ remoteId: "remote-image" });
    const body = post.mock.calls[0][1] as any;
    expect(body.extra_data).toEqual({
      yumei_image_request_id: "local-request",
    });
    expect(body.client_id).toBe("local-request");
    expect(body.prompt[input.workflow.outputNode].inputs.filename_prefix).toBe(
      "yumei-image/local-request"
    );
    expect(input.workflow).toEqual(original);
  });
  it.each(["queue", "history"])(
    "recovers the original task from %s without posting a new prompt",
    async source => {
      const prompt = [
        0,
        "remote-image",
        {},
        { yumei_image_request_id: "local-request" },
      ];
      const get = vi.spyOn(axios, "get").mockResolvedValueOnce({
        data: source === "queue" ? { queue_pending: [prompt] } : {},
      });
      if (source === "history")
        get.mockResolvedValueOnce({ data: { "remote-image": { prompt } } });
      const post = vi.spyOn(axios, "post");
      expect(
        await new ImageTaskProvider(task(), null).recover("local-request")
      ).toBe("remote-image");
      expect(post).not.toHaveBeenCalled();
    }
  );
  it("distinguishes a queued image from a running one", async () => {
    const get = vi
      .spyOn(axios, "get")
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({
        data: { queue_pending: [[1, "remote-image"]] },
      });
    const client = new ImageTaskProvider(task(), null);
    expect(await client.result()).toEqual({ queued: true, output: null });
    get
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { queue_pending: [] } });
    expect(await client.result()).toEqual({ queued: false, output: null });
  });
  it("handles execution errors before completed and rejects missing output", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValueOnce({
      data: {
        "remote-image": { status: { status_str: "error", completed: true } },
      },
    });
    const client = new ImageTaskProvider(task(), null);
    await expect(client.result()).rejects.toThrow("generation failed");
    get.mockResolvedValueOnce({
      data: { "remote-image": { status: { completed: true }, outputs: {} } },
    });
    await expect(client.result()).rejects.toThrow("Missing image output");
  });
  it("uses fal queue URLs as returned, rather than reconstructing the model subpath", async () => {
    const input = task("fal");
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        request_id: "remote-image",
        status_url: input.statusUrl,
        response_url: input.responseUrl,
      },
    });
    expect(
      await new ImageTaskProvider(input, "synthetic-test-key").submit(
        "local-request",
        []
      )
    ).toMatchObject({
      statusUrl: input.statusUrl,
      responseUrl: input.responseUrl,
    });
    expect(post.mock.calls[0][0]).toBe(
      "https://queue.fal.run/fal-ai/flux/edit"
    );
    const get = vi
      .spyOn(axios, "get")
      .mockResolvedValueOnce({ data: { status: "COMPLETED" } })
      .mockResolvedValueOnce({
        data: { images: [{ url: "https://images.test/output.png" }] },
      });
    expect(await new ImageTaskProvider(input, null).result()).toEqual({
      queued: false,
      output: { url: "https://images.test/output.png" },
    });
    expect(get.mock.calls.map(call => call[0])).toEqual([
      input.statusUrl,
      input.responseUrl,
    ]);
  });
  it("does not send queue credentials to a returned foreign status URL", async () => {
    const input = task("fal");
    input.statusUrl = "https://elsewhere.test/steal";
    const get = vi.spyOn(axios, "get");
    await expect(
      new ImageTaskProvider(input, "synthetic-test-key").result()
    ).rejects.toThrow("Invalid queue URL");
    expect(get).not.toHaveBeenCalled();
  });
  it("rejects invalid image bytes and does not send fal authorization to output downloads", async () => {
    const input = task("fal");
    const get = vi
      .spyOn(axios, "get")
      .mockResolvedValue({ data: Buffer.from("not an image") });
    await expect(
      new ImageTaskProvider(input, "synthetic-test-key").download({
        url: "https://images.test/output.png",
      })
    ).rejects.toThrow("Invalid image output");
    expect(get.mock.calls[0][1]).toMatchObject({
      headers: {},
      maxContentLength: input.runtime.maxImageBytes,
      maxRedirects: 0,
    });
  });
});
