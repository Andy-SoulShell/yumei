/** 覆盖图片生成的工作流适配与业务约束。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosError } from "axios";
import { buildImageWorkflow, ComfyUIClient } from "./comfyui";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const output = {
  job: {
    status: { completed: true },
    outputs: {
      "461": {
        images: [{ filename: "photo.png", subfolder: "yumei", type: "output" }],
      },
    },
  },
};
beforeEach(() => vi.stubEnv("COMFYUI_WORKFLOW_DIR", "workflows/comfyui"));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Qwen Image workflow adaptation", () => {
  it("uses the requested text without demo prompts or prompt enhancer nodes", async () => {
    const workflow = await buildImageWorkflow({
      mode: "text",
      prompt: "一杯咖啡",
    });
    expect(workflow["459:452"].inputs.prompt).toBe("一杯咖啡");
    expect(
      Object.values(workflow).some(node => node.class_type === "TextGenerate")
    ).toBe(false);
    expect(
      Object.values(workflow).some(node => node.class_type === "LoadImage")
    ).toBe(false);
    expect(workflow["459:458"].inputs.steps).toBe(25);
    expect(workflow["459:456"].inputs).toMatchObject({
      width: 864,
      height: 1536,
    });
  });

  it("uses only the uploaded reference and limits edit resolution", async () => {
    const workflow = await buildImageWorkflow({
      mode: "reference",
      prompt: "修改背景",
      references: ["yumei/face.png"],
    });
    expect(workflow["470"].inputs.image).toBe("yumei/face.png");
    expect(workflow["459:474"].inputs["images.image_2"]).toBeUndefined();
    expect(workflow.reference_resize.inputs).toMatchObject({
      width: 864,
      height: 1536,
      crop: "center",
    });
    expect(workflow["459:474"].inputs.resolution).toBe(0);
    expect(JSON.stringify(workflow)).not.toContain(
      "clothing_light_blue_denim_shirt"
    );
  });

  it("connects both uploaded references for a couple photo", async () => {
    const workflow = await buildImageWorkflow({
      mode: "reference",
      prompt: "合照",
      references: ["a.png", "b.png"],
    });
    expect(workflow["475"].inputs.image).toBe("b.png");
    expect(workflow["459:474"].inputs["images.image_2"]).toEqual([
      "reference_resize_2",
      0,
    ]);
  });
});

describe("ComfyUI API generation", () => {
  it("uploads bytes, waits for the specific job, and downloads the save-node output", async () => {
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValueOnce({
        data: { name: "uploaded.png", subfolder: "yumei" },
      })
      .mockResolvedValueOnce({ data: { prompt_id: "job" } });
    const get = vi
      .spyOn(axios, "get")
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: output })
      .mockResolvedValueOnce({ data: png });
    const result = await new ComfyUIClient({
      baseUrl: "http://comfy:8188/",
      apiKey: "test-token",
      pollIntervalMs: 0,
    }).generate({
      mode: "reference",
      prompt: "自拍",
      references: [{ data: png, mimeType: "image/png" }],
    });
    expect(result).toEqual(png);
    const form = post.mock.calls[0][1] as FormData;
    expect(
      Buffer.from(await (form.get("image") as Blob).arrayBuffer())
    ).toEqual(png);
    const request = post.mock.calls[1][1] as {
      prompt: Awaited<ReturnType<typeof buildImageWorkflow>>;
    };
    expect(request.prompt["470"].inputs.image).toBe("yumei/uploaded.png");
    expect(get.mock.calls[0][0]).toBe("http://comfy:8188/history/job");
    expect(get.mock.calls[2]).toEqual([
      "http://comfy:8188/view",
      expect.objectContaining({
        params: { filename: "photo.png", subfolder: "yumei", type: "output" },
        headers: { Authorization: "Bearer test-token" },
      }),
    ]);
  });

  it("does not upload a reference for text-to-image", async () => {
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { prompt_id: "job" } });
    vi.spyOn(axios, "get")
      .mockResolvedValueOnce({ data: output })
      .mockResolvedValueOnce({ data: png });
    await new ComfyUIClient({ baseUrl: "http://comfy:8188" }).generate({
      mode: "text",
      prompt: "咖啡杯",
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("http://comfy:8188/prompt");
  });

  it("reports failed execution instead of polling forever", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { prompt_id: "job" } });
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        job: {
          status: {
            status_str: "error",
            messages: [
              ["execution_error", { exception_message: "CUDA out of memory" }],
            ],
          },
        },
      },
    });
    await expect(
      new ComfyUIClient({ baseUrl: "http://comfy:8188" }).generate({
        mode: "text",
        prompt: "test",
      })
    ).rejects.toThrow("CUDA out of memory");
  });

  it("rejects a completed task without an image and never downloads HTML as PNG", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { prompt_id: "job" } });
    const get = vi.spyOn(axios, "get").mockResolvedValueOnce({
      data: { job: { status: { completed: true }, outputs: {} } },
    });
    const client = new ComfyUIClient({ baseUrl: "http://comfy:8188" });
    await expect(
      client.generate({ mode: "text", prompt: "test" })
    ).rejects.toThrow("没有输出图片");
    get
      .mockResolvedValueOnce({ data: output })
      .mockResolvedValueOnce({ data: Buffer.from("<html>error</html>") });
    await expect(
      client.generate({ mode: "text", prompt: "test" })
    ).rejects.toThrow("无效的 PNG");
  });

  it("removes only its own queued job on timeout without interrupting the server", async () => {
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { prompt_id: "job" } });
    vi.spyOn(axios, "get").mockResolvedValue({ data: {} });
    await expect(
      new ComfyUIClient({
        baseUrl: "http://comfy:8188",
        timeoutMs: 30,
        pollIntervalMs: 1,
      }).generate({ mode: "text", prompt: "test" })
    ).rejects.toThrow("超时");
    expect(post).toHaveBeenCalledWith(
      "http://comfy:8188/queue",
      { delete: ["job"] },
      expect.any(Object)
    );
    expect(
      post.mock.calls.some(([url]) => String(url).includes("/interrupt"))
    ).toBe(false);
  });

  it("does not expose an HTTP client's credential-bearing error", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      new AxiosError("Bearer private-token", "ECONNREFUSED")
    );
    await expect(
      new ComfyUIClient({
        baseUrl: "http://comfy:8188",
        apiKey: "private-token",
      }).generate({ mode: "text", prompt: "test" })
    ).rejects.toThrow("无法连接 ComfyUI");
  });
});
