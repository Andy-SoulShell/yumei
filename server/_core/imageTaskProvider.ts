/** 可恢复图片传输：只提交一次，之后查询同一个远端任务。 */
import axios from "axios";
import type { ImageTask } from "../../shared/imageTasks";
import { buildImageWorkflow } from "./comfyui";
import { resolveImageProvider } from "./imageProvider";
import { storageRead } from "../storage";

type Output =
  { filename: string; subfolder?: string; type: string } | { url: string };
type Prompt = [
  number,
  string,
  unknown,
  { yumei_image_request_id?: string; client_id?: string },
];
export class ImageTaskOutputError extends Error {}

function mime(data: Buffer) {
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (data[0] === 255 && data[1] === 216) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6)))
    return "image/gif";
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new ImageTaskOutputError("Invalid image output");
}
function falUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "queue.fal.run" ||
    url.username ||
    url.password
  )
    throw new ImageTaskOutputError("Invalid queue URL");
  return value;
}

export class ImageTaskProvider {
  constructor(
    private readonly task: ImageTask,
    private readonly apiKey: string | null
  ) {}
  private get options() {
    return {
      headers: this.apiKey
        ? {
            Authorization:
              this.task.provider === "fal"
                ? `Key ${this.apiKey}`
                : `Bearer ${this.apiKey}`,
          }
        : {},
      timeout:
        this.task.provider === "fal"
          ? this.task.runtime.falTimeoutMs
          : this.task.runtime.comfyuiRequestTimeoutMs,
      maxContentLength: this.task.runtime.maxImageBytes,
      maxBodyLength:
        Math.max(this.task.maxReferenceBytes, this.task.runtime.maxImageBytes) +
        1024 * 1024,
      maxRedirects: 0,
    };
  }
  /** 凭据只在执行时解析；不把密钥写入任务，也不静默切换服务。 */
  static async forTask(userId: string, task: ImageTask) {
    if (task.provider === "comfyui")
      return new ImageTaskProvider(task, process.env.COMFYUI_API_KEY || null);
    const provider = await resolveImageProvider(userId);
    if (
      !provider.configured ||
      provider.name !== task.provider ||
      provider.isByok !== task.isByok
    )
      throw new ImageTaskOutputError("Image credentials changed");
    return new ImageTaskProvider(task, provider.apiKey);
  }
  /** 上传参考图发生在 submitting 之前；重做上传不会重复调用模型。 */
  async prepare(id: string) {
    const references: string[] = [];
    if (
      this.task.provider === "comfyui" &&
      this.task.input.generationMode === "reference"
    ) {
      for (const [index, ref] of Array.from(this.task.references.entries())) {
        const data = await storageRead(ref.key);
        if (data.length > this.task.maxReferenceBytes)
          throw new ImageTaskOutputError("Reference too large");
        const mimeType = mime(data);
        const form = new FormData();
        form.append(
          "image",
          new Blob([new Uint8Array(data)], { type: mimeType }),
          `${id}-${index}.${mimeType.split("/")[1]}`
        );
        form.append("type", "input");
        form.append("subfolder", "yumei-image");
        form.append("overwrite", "true");
        const { data: response } = await axios.post<{
          name: string;
          subfolder?: string;
        }>(`${this.task.baseUrl}/upload/image`, form, this.options);
        if (!response.name)
          throw new ImageTaskOutputError("Missing reference filename");
        references.push(
          [response.subfolder, response.name].filter(Boolean).join("/")
        );
      }
    }
    return references;
  }
  async submit(id: string, references: string[]) {
    if (this.task.provider === "fal") {
      const refs = this.task.references.map(ref => ref.url);
      const { data } = await axios.post<{
        request_id: string;
        status_url: string;
        response_url: string;
      }>(
        `https://queue.fal.run/${this.task.model}`,
        {
          prompt: this.task.prompt,
          ...(refs.length > 1 ? { image_urls: refs } : { image_url: refs[0] }),
        },
        this.options
      );
      if (!data.request_id)
        throw new ImageTaskOutputError("Missing request ID");
      return {
        remoteId: data.request_id,
        statusUrl: falUrl(data.status_url),
        responseUrl: falUrl(data.response_url),
      };
    }
    const prompt = await buildImageWorkflow({
      mode: this.task.input.generationMode,
      prompt: this.task.prompt,
      references,
      spec: this.task.workflow,
      prefix: `yumei-image/${id}`,
    });
    const { data } = await axios.post<{ prompt_id?: string }>(
      `${this.task.baseUrl}/prompt`,
      {
        prompt,
        client_id: id,
        extra_data: { yumei_image_request_id: id },
      },
      this.options
    );
    if (!data.prompt_id) throw new ImageTaskOutputError("Missing request ID");
    return { remoteId: data.prompt_id };
  }
  async recover(id: string) {
    if (this.task.provider === "fal") return undefined;
    const matches = (prompt?: Prompt) =>
      prompt?.[3]?.yumei_image_request_id === id ||
      prompt?.[3]?.client_id === id;
    const { data: queue } = await axios.get<{
      queue_running?: Prompt[];
      queue_pending?: Prompt[];
    }>(`${this.task.baseUrl}/queue`, this.options);
    const queued = [
      ...(queue.queue_running ?? []),
      ...(queue.queue_pending ?? []),
    ].find(matches);
    if (queued) return queued[1];
    const { data: history } = await axios.get<
      Record<string, { prompt?: Prompt }>
    >(`${this.task.baseUrl}/history`, this.options);
    return Object.entries(history).find(([, value]) =>
      matches(value.prompt)
    )?.[0];
  }
  /** 读取真实排队/运行状态；完成仅表示可下载，仍须原子保存后才显示完成。 */
  async result(): Promise<{ queued: boolean; output: Output | null }> {
    if (this.task.provider === "fal") {
      const { data } = await axios.get<{ status: string; error?: string }>(
        falUrl(this.task.statusUrl!),
        this.options
      );
      if (data.status !== "COMPLETED")
        return { queued: data.status === "IN_QUEUE", output: null };
      if (data.error) throw new ImageTaskOutputError("Image generation failed");
      const result = await axios.get<{ images?: { url: string }[] }>(
        falUrl(this.task.responseUrl!),
        this.options
      );
      const url = result.data.images?.[0]?.url;
      if (!url || new URL(url).protocol !== "https:")
        throw new ImageTaskOutputError("Missing image output");
      return { queued: false, output: { url } };
    }
    const { data } = await axios.get<
      Record<
        string,
        {
          status?: { status_str?: string; completed?: boolean };
          outputs?: Record<string, { images?: Output[] }>;
        }
      >
    >(
      `${this.task.baseUrl}/history/${encodeURIComponent(this.task.remoteId!)}`,
      this.options
    );
    const entry = data[this.task.remoteId!];
    if (entry?.status?.status_str === "error")
      throw new ImageTaskOutputError("Image generation failed");
    if (entry?.status?.completed) {
      const output = entry.outputs?.[
        this.task.workflow.outputNode
      ]?.images?.find(item => "type" in item && item.type === "output");
      if (!output) throw new ImageTaskOutputError("Missing image output");
      return { queued: false, output };
    }
    const queue = await axios.get<{ queue_pending?: Prompt[] }>(
      `${this.task.baseUrl}/queue`,
      this.options
    );
    return {
      queued: !!queue.data.queue_pending?.some(
        item => item[1] === this.task.remoteId
      ),
      output: null,
    };
  }
  async download(output: Output) {
    const { data } = await axios.get<ArrayBuffer>(
      "url" in output ? output.url : `${this.task.baseUrl}/view`,
      {
        ...this.options,
        headers: "url" in output ? {} : this.options.headers,
        timeout: this.task.runtime.downloadTimeoutMs,
        params:
          "url" in output
            ? undefined
            : {
                filename: output.filename,
                subfolder: output.subfolder ?? "",
                type: output.type,
              },
        responseType: "arraybuffer",
      }
    );
    const buffer = Buffer.from(data);
    return { buffer, mimeType: mime(buffer) };
  }
}
