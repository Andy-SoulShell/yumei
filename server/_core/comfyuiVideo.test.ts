/** 以实际客户端验证 HTTP 负载、远端恢复、视频输出解析和容量边界。 */
import axios from "axios";
import { afterEach, expect, it, vi } from "vitest";
import { ComfyUIVideoClient } from "./comfyuiVideo";
import { productFixture } from "../testProductConfig";
import type { VideoTask } from "../../shared/video";

function client() {
  const task: VideoTask = {
    baseUrl: "http://comfy.test:8188",
    input: {
      clientRequestId: crypto.randomUUID(),
      conversationId: 1,
      mode: "text",
      prompt: "用户描述",
      durationSeconds: 5,
      referenceMessageId: null,
    },
    workflow: productFixture.models.video.workflows.text,
    runtime: productFixture.runtime.video,
    referenceKey: null,
    phase: "queued",
    frames: 124,
    fps: 24,
  };
  return new ComfyUIVideoClient(task);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("submits the request correlation marker and retains audio while replacing runtime parameters", async () => {
  vi.stubEnv("COMFYUI_API_KEY", "test-proxy-key");
  const post = vi
    .spyOn(axios, "post")
    .mockResolvedValue({ data: { prompt_id: "remote-id" } });
  expect(await client().submit("local-id")).toBe("remote-id");
  expect(post).toHaveBeenCalledWith(
    "http://comfy.test:8188/prompt",
    expect.objectContaining({
      client_id: "local-id",
      extra_data: { yumei_video_request_id: "local-id" },
    }),
    expect.objectContaining({
      headers: { Authorization: "Bearer test-proxy-key" },
      maxRedirects: 0,
    })
  );
  const body = post.mock.calls[0][1] as {
    prompt: Record<string, { inputs: Record<string, unknown> }>;
  };
  expect(body.prompt["105:104"].inputs.length).toBe(124);
  expect(body.prompt["105:91"].inputs.audio).toEqual(["105:23", 0]);
});

it("recovers an accepted task from either queue or completed history", async () => {
  const get = vi.spyOn(axios, "get").mockResolvedValueOnce({
    data: {
      queue_running: [
        [1, "running-id", {}, { yumei_video_request_id: "local-id" }],
      ],
    },
  });
  expect(await client().recover("local-id")).toBe("running-id");
  expect(get).toHaveBeenCalledTimes(1);
  get
    .mockResolvedValueOnce({ data: { queue_running: [], queue_pending: [] } })
    .mockResolvedValueOnce({
      data: {
        "completed-id": {
          prompt: [1, "completed-id", {}, { client_id: "local-id" }],
        },
      },
    });
  expect(await client().recover("local-id")).toBe("completed-id");
});

it("parses supported SaveVideo output shapes and handles failed completed entries before reading output", async () => {
  const get = vi.spyOn(axios, "get");
  for (const key of ["images", "videos", "gifs"]) {
    get.mockResolvedValueOnce({
      data: {
        remote: {
          status: { completed: true, status_str: "success" },
          outputs: {
            "92": {
              [key]: [
                { filename: "clip.mp4", type: "output", subfolder: "video" },
              ],
            },
          },
        },
      },
    });
    expect(await client().result("remote")).toMatchObject({
      filename: "clip.mp4",
    });
  }
  get.mockResolvedValueOnce({
    data: { remote: { status: { completed: true, status_str: "error" } } },
  });
  await expect(client().result("remote")).rejects.toThrow("生成失败");
  get.mockResolvedValueOnce({
    data: { remote: { status: { completed: true }, outputs: {} } },
  });
  await expect(client().result("remote")).rejects.toThrow("没有输出 MP4");
});

it("checks the downloaded container and deletes only its own queue entry", async () => {
  const get = vi
    .spyOn(axios, "get")
    .mockResolvedValue({ data: Buffer.from("not a video") });
  await expect(
    client().download({ filename: "clip.mp4", type: "output" })
  ).rejects.toThrow("无效的 MP4");
  expect(get.mock.calls[0][1]).toMatchObject({
    maxContentLength: productFixture.runtime.video.maxVideoBytes,
    timeout: productFixture.runtime.video.downloadTimeoutMs,
    responseType: "arraybuffer",
  });
  const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} });
  await client().cancel("my-task");
  expect(post).toHaveBeenCalledWith(
    "http://comfy.test:8188/queue",
    { delete: ["my-task"] },
    expect.anything()
  );
});
