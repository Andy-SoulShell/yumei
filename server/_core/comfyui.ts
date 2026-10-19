import axios from "axios";
import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type ImageGenerationMode = "reference" | "text";
export type ImageInput = { data: Buffer; mimeType: string };
type Workflow = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;
type OutputImage = { filename: string; subfolder?: string; type: string };
type HistoryEntry = {
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: [string, { exception_message?: string }][];
  };
  outputs?: Record<string, { images?: OutputImage[] }>;
};

const OUTPUT_NODE = "461";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Adapt the supplied Qwen workflows without retaining their demo images. */
export async function buildImageWorkflow(params: {
  mode: ImageGenerationMode;
  prompt: string;
  references?: string[];
}): Promise<Workflow> {
  const file =
    params.mode === "text" ? "qwen-image-text.json" : "qwen-image-edit.json";
  const dir = process.env.COMFYUI_WORKFLOW_DIR || "workflows/comfyui";
  const workflow: Workflow = JSON.parse(
    await readFile(path.resolve(dir, file), "utf8")
  );
  const encoder = params.mode === "text" ? "459:452" : "459:474";
  workflow[encoder].inputs.prompt = params.prompt;
  workflow["459:458"].inputs.seed = randomInt(0, 2 ** 48 - 1);
  workflow[OUTPUT_NODE].inputs.filename_prefix = `yumei/${randomUUID()}`;
  if (params.mode === "reference") {
    if (!params.references?.length)
      throw new Error("参考图生图需要至少一张参考图");
    workflow["470"].inputs.image = params.references[0];
    if (params.references.length > 1) {
      workflow["475"] = {
        class_type: "LoadImage",
        inputs: { image: params.references[1] },
      };
      workflow.reference_resize_2 = {
        class_type: "ImageScale",
        inputs: { ...workflow.reference_resize.inputs, image: ["475", 0] },
      };
      workflow[encoder].inputs["images.image_2"] = ["reference_resize_2", 0];
    }
  }
  return workflow;
}

export class ComfyUIClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey?: string;
      timeoutMs?: number;
      pollIntervalMs?: number;
    }
  ) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.headers = options.apiKey
      ? { Authorization: `Bearer ${options.apiKey}` }
      : {};
  }

  async generate(params: {
    prompt: string;
    mode: ImageGenerationMode;
    references?: ImageInput[];
  }): Promise<Buffer> {
    const deadline = Date.now() + (this.options.timeoutMs ?? 600_000);
    const requestOptions = () => ({
      headers: this.headers,
      timeout: Math.max(1, Math.min(30_000, deadline - Date.now())),
      maxContentLength: MAX_IMAGE_BYTES,
      maxBodyLength: MAX_IMAGE_BYTES + 1024 * 1024,
    });
    let promptId: string | undefined;
    try {
      const references: string[] = [];
      if (params.mode === "reference") {
        for (const reference of params.references ?? []) {
          if (reference.data.length > MAX_IMAGE_BYTES)
            throw new Error("参考图不能超过 25MB");
          const form = new FormData();
          const extension = reference.mimeType.split("/")[1] || "png";
          form.append(
            "image",
            new Blob([new Uint8Array(reference.data)], {
              type: reference.mimeType,
            }),
            `${randomUUID()}.${extension}`
          );
          form.append("type", "input");
          form.append("subfolder", "yumei");
          const response = await axios.post<{
            name: string;
            subfolder?: string;
          }>(`${this.baseUrl}/upload/image`, form, requestOptions());
          if (!response.data.name)
            throw new Error("ComfyUI 未返回上传后的参考图文件名");
          references.push(
            [response.data.subfolder, response.data.name]
              .filter(Boolean)
              .join("/")
          );
        }
      }
      const workflow = await buildImageWorkflow({ ...params, references });
      const submitted = await axios.post<{
        prompt_id?: string;
        error?: { message?: string };
      }>(
        `${this.baseUrl}/prompt`,
        { prompt: workflow, client_id: randomUUID() },
        requestOptions()
      );
      if (!submitted.data.prompt_id) {
        throw new Error(
          submitted.data.error?.message || "ComfyUI 未返回任务编号"
        );
      }
      promptId = submitted.data.prompt_id;
      while (Date.now() < deadline) {
        const response = await axios.get<Record<string, HistoryEntry>>(
          `${this.baseUrl}/history/${encodeURIComponent(promptId)}`,
          requestOptions()
        );
        const entry = response.data[promptId];
        if (entry?.status?.status_str === "error") {
          const detail = entry.status.messages?.find(
            ([kind]) => kind === "execution_error"
          )?.[1]?.exception_message;
          throw new Error(
            `ComfyUI 生成失败${detail ? `：${detail.slice(0, 300)}` : "，请检查远端模型与工作流"}`
          );
        }
        if (entry?.status?.completed) {
          const image = entry.outputs?.[OUTPUT_NODE]?.images?.find(
            item => item.type === "output"
          );
          if (!image)
            throw new Error("ComfyUI 任务已完成，但保存节点没有输出图片");
          const downloaded = await axios.get<ArrayBuffer>(
            `${this.baseUrl}/view`,
            {
              ...requestOptions(),
              params: {
                filename: image.filename,
                subfolder: image.subfolder || "",
                type: image.type,
              },
              responseType: "arraybuffer",
            }
          );
          const data = Buffer.from(downloaded.data);
          if (!data.subarray(0, 8).equals(PNG_SIGNATURE))
            throw new Error("ComfyUI 返回了无效的 PNG 图片");
          return data;
        }
        await delay(
          Math.min(
            this.options.pollIntervalMs ?? 1000,
            Math.max(1, deadline - Date.now())
          )
        );
      }
      // Delete only this pending task; never interrupt another user's running job.
      await axios
        .post(
          `${this.baseUrl}/queue`,
          { delete: [promptId] },
          { headers: this.headers, timeout: 5000 }
        )
        .catch(() => {});
      throw new Error(
        "ComfyUI 排队或生成超时；若任务已开始，仍可能在远端继续运行"
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 400) {
          // eslint-disable-next-line preserve-caught-error -- Axios errors can contain the ComfyUI bearer token.
          throw new Error("ComfyUI 拒绝了工作流，请检查远端节点和模型是否齐全");
        }
        // eslint-disable-next-line preserve-caught-error -- Axios errors can contain the ComfyUI bearer token.
        throw new Error(
          status
            ? `ComfyUI 请求失败（HTTP ${status}）`
            : "无法连接 ComfyUI 或请求超时，请检查远端地址与服务状态"
        );
      }
      throw error;
    }
  }
}
