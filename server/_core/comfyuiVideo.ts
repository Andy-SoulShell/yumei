/** ComfyUI 视频传输与工作流适配；持久状态和结算由后台任务层负责。 */
import axios from "axios";
import { randomInt } from "node:crypto";
import type { VideoTask, VideoWorkflow } from "../../shared/video";
import { videoTiming } from "../../shared/video";

type OutputFile = { filename: string; subfolder?: string; type: string };
type History = {
  status?: { completed?: boolean; status_str?: string };
  outputs?: Record<
    string,
    { images?: OutputFile[]; videos?: OutputFile[]; gifs?: OutputFile[] }
  >;
};

/** 已确认的输出失败无需重试存储，应立即结算并退还额度。 */
export class ComfyUIVideoOutputError extends Error {}
/** 在模板副本中替换输入并按帧数约束生成 MP4，保留原有音频连接。 */
export function buildVideoWorkflow(
  spec: VideoWorkflow,
  input: {
    prompt: string;
    durationSeconds: number;
    reference?: string;
    prefix: string;
  }
) {
  const nodes = structuredClone(spec.nodes);
  const set = (
    binding: { node: string; input: string },
    value: string | number
  ) => {
    nodes[binding.node].inputs[binding.input] = value;
  };
  set(spec.prompt, input.prompt);
  set(spec.seed, randomInt(0, 2 ** 48 - 1));
  set(spec.frames, videoTiming(spec, input.durationSeconds).frames);
  if (spec.reference) {
    if (!input.reference) throw new Error("视频首帧缺失");
    set(spec.reference, input.reference);
  }
  const output = nodes[spec.outputNode].inputs;
  output.filename_prefix = input.prefix;
  output.format = "mp4";
  output["format.codec"] = "h264";
  output.codec = "h264";
  return nodes;
}

/** 每次请求均有独立超时和容量上限；凭据仅来自当前服务端环境。 */
export class ComfyUIVideoClient {
  private readonly baseUrl: string;
  private readonly options;
  constructor(private readonly task: VideoTask) {
    this.baseUrl = task.baseUrl.replace(/\/+$/, "");
    this.options = {
      headers: process.env.COMFYUI_API_KEY
        ? { Authorization: `Bearer ${process.env.COMFYUI_API_KEY}` }
        : {},
      timeout: task.runtime.requestTimeoutMs,
      maxContentLength: task.runtime.maxVideoBytes,
      maxBodyLength: task.runtime.maxVideoBytes,
      maxRedirects: 0,
    };
  }
  /** 上传应用存储中的首帧，不让远端访问用户提供的任意 URL。 */
  async upload(data: Buffer, name: string) {
    const mime = data.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71]))
      ? "image/png"
      : data[0] === 255 && data[1] === 216
        ? "image/jpeg"
        : data.toString("ascii", 0, 4) === "RIFF" &&
            data.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : data.toString("ascii", 0, 3) === "GIF"
            ? "image/gif"
            : null;
    if (!mime) throw new Error("视频首帧格式无效");
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(data)], { type: mime }),
      `${name}.${mime.split("/")[1]}`
    );
    form.append("type", "input");
    form.append("subfolder", "yumei-video");
    form.append("overwrite", "true");
    const { data: response } = await axios.post<{
      name: string;
      subfolder?: string;
    }>(`${this.baseUrl}/upload/image`, form, this.options);
    if (!response.name) throw new Error("ComfyUI 未返回首帧文件名");
    return [response.subfolder, response.name].filter(Boolean).join("/");
  }
  /** 使用请求 ID 标记任务，连接中断后可从队列与历史记录找回。 */
  async submit(id: string, reference?: string) {
    const prompt = buildVideoWorkflow(this.task.workflow, {
      ...this.task.input,
      reference,
      prefix: `yumei-video/${id}`,
    });
    const { data } = await axios.post<{ prompt_id?: string }>(
      `${this.baseUrl}/prompt`,
      { prompt, client_id: id, extra_data: { yumei_video_request_id: id } },
      this.options
    );
    if (!data.prompt_id) throw new Error("ComfyUI 未返回视频任务编号");
    return data.prompt_id;
  }
  /** 找回提交后尚未写入本地数据库的任务；绝不因提交响应丢失自动再次提交。 */
  async recover(id: string) {
    type Prompt = [
      number,
      string,
      unknown,
      { yumei_video_request_id?: string; client_id?: string },
    ];
    const queue = await axios.get<{
      queue_running?: Prompt[];
      queue_pending?: Prompt[];
    }>(`${this.baseUrl}/queue`, this.options);
    const match = (prompt?: Prompt) =>
      prompt?.[3]?.yumei_video_request_id === id ||
      prompt?.[3]?.client_id === id;
    const queued = [
      ...(queue.data.queue_running ?? []),
      ...(queue.data.queue_pending ?? []),
    ].find(match);
    if (queued) return queued[1];
    const history = await axios.get<Record<string, { prompt?: Prompt }>>(
      `${this.baseUrl}/history`,
      this.options
    );
    return Object.entries(history.data).find(([, value]) =>
      match(value.prompt)
    )?.[0];
  }
  /** 读取指定保存节点的 MP4；执行失败先于 completed 标志处理。 */
  async result(promptId: string) {
    const { data } = await axios.get<Record<string, History>>(
      `${this.baseUrl}/history/${encodeURIComponent(promptId)}`,
      this.options
    );
    const history = data[promptId];
    if (history?.status?.status_str === "error")
      throw new ComfyUIVideoOutputError("ComfyUI 视频生成失败");
    if (!history?.status?.completed) return null;
    const output = history.outputs?.[this.task.workflow.outputNode];
    const file = [
      ...(output?.videos ?? []),
      ...(output?.images ?? []),
      ...(output?.gifs ?? []),
    ].find(item => item.type === "output" && /\.mp4$/i.test(item.filename));
    if (!file)
      throw new ComfyUIVideoOutputError("ComfyUI 保存节点没有输出 MP4 视频");
    return file;
  }
  /** 下载并检查 MP4 容器；大文件仍受发布配置的容量和超时限制。 */
  async download(file: OutputFile) {
    const { data } = await axios.get<ArrayBuffer>(`${this.baseUrl}/view`, {
      ...this.options,
      timeout: this.task.runtime.downloadTimeoutMs,
      params: {
        filename: file.filename,
        subfolder: file.subfolder ?? "",
        type: file.type,
      },
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(data);
    if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp")
      throw new ComfyUIVideoOutputError("ComfyUI 返回了无效的 MP4 视频");
    return buffer;
  }
  /** 仅删除指定排队项；不调用影响当前执行任务的全局 interrupt。 */
  async cancel(promptId: string) {
    await axios.post(
      `${this.baseUrl}/queue`,
      { delete: [promptId] },
      this.options
    );
  }
}
