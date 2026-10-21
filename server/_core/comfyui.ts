/** 将发布工作流适配为 ComfyUI 任务，并处理参考图上传和结果轮询。 */
import type { ProductConfig } from "../../shared/productConfig";
import { getPublishedProductConfig } from "../repositories/productConfig";
import axios from "axios";
import { randomInt, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

/** 图片生成方式：使用参考图或仅使用文字提示词。 */
export type ImageGenerationMode = "reference" | "text";
/** 一张参考图的原始字节与 MIME 类型。 */
export type ImageInput = { data: Buffer; mimeType: string };
/** ComfyUI API 格式的节点映射，键为节点标识。 */
type Workflow = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;
/** ComfyUI 历史记录中描述输出文件位置的字段。 */
type OutputImage = { filename: string; subfolder?: string; type: string };
/** 轮询任务时需要读取的执行状态、错误与输出节点。 */
type HistoryEntry = {
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: [string, { exception_message?: string }][];
  };
  outputs?: Record<string, { images?: OutputImage[] }>;
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * 读取发布工作流并替换提示词、随机种子、输出前缀及参考图节点。
 *
 * @throws 参考图模式缺少图片时抛出错误。
 * @remarks 修改内存中的节点副本，不回写工作流模板。
 */
export async function buildImageWorkflow(
  params: {
    mode: ImageGenerationMode;
    prompt: string;
    references?: string[];
  },
  configuration?: ProductConfig
): Promise<Workflow> {
  const policy = configuration ?? (await getPublishedProductConfig());
  const spec = policy.models.image.workflows[params.mode];
  const workflow: Workflow = structuredClone(spec.nodes);
  const encoder = spec.promptNode;
  workflow[encoder].inputs.prompt = params.prompt;
  workflow[spec.seedNode].inputs.seed = randomInt(0, 2 ** 48 - 1);
  workflow[spec.outputNode].inputs.filename_prefix = `yumei/${randomUUID()}`;
  if (params.mode === "reference") {
    if (!params.references?.length)
      throw new Error("参考图生图需要至少一张参考图");
    workflow[spec.referenceNode!].inputs.image = params.references[0];
    if (params.references.length > 1) {
      workflow["475"] = {
        class_type: "LoadImage",
        inputs: { image: params.references[1] },
      };
      workflow.reference_resize_2 = {
        class_type: "ImageScale",
        inputs: { ...workflow[spec.resizeNode!].inputs, image: ["475", 0] },
      };
      workflow[encoder].inputs["images.image_2"] = ["reference_resize_2", 0];
    }
  }
  return workflow;
}

/**
 * 负责上传参考图、提交任务、轮询执行状态并下载 PNG 结果的客户端。
 *
 * @remarks 每次 generate 独立提交任务；轮询期限到达时尝试删除本任务排队项，不能中断已执行任务。
 */
export class ComfyUIClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  /** 保存基础地址、可选 Bearer 凭据和等待配置，时间参数单位均为毫秒。 */
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey?: string;
      timeoutMs?: number;
      pollIntervalMs?: number;
      configuration?: ProductConfig;
    }
  ) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.headers = options.apiKey
      ? { Authorization: `Bearer ${options.apiKey}` }
      : {};
  }

  /**
   * 上传参考图、提交并轮询本次生成任务，成功时返回经签名头检查的 PNG 字节。
   *
   * @throws 任务执行失败、连接异常或超过总等待期限时抛出经过脱敏的错误。
   */
  async generate(params: {
    prompt: string;
    mode: ImageGenerationMode;
    references?: ImageInput[];
  }): Promise<Buffer> {
    const policy =
      this.options.configuration ?? (await getPublishedProductConfig());
    const runtime = policy.runtime.image;
    const maxReferenceBytes = Math.max(
      policy.uploads.reference.maxBytes,
      policy.uploads.couple.maxBytes,
      policy.uploads.official.maxBytes
    );
    const spec = policy.models.image.workflows[params.mode];
    const deadline =
      Date.now() + (this.options.timeoutMs ?? runtime.comfyuiTimeoutMs);
    const requestOptions = () => ({
      headers: this.headers,
      timeout: Math.max(
        1,
        Math.min(runtime.comfyuiRequestTimeoutMs, deadline - Date.now())
      ),
      maxContentLength: runtime.maxImageBytes,
      maxBodyLength:
        Math.max(runtime.maxImageBytes, maxReferenceBytes) + 1024 * 1024,
    });
    let promptId: string | undefined;
    try {
      const references: string[] = [];
      if (params.mode === "reference") {
        for (const reference of params.references ?? []) {
          if (reference.data.length > maxReferenceBytes)
            throw new Error(`参考图不能超过 ${maxReferenceBytes} 字节`);
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
      const workflow = await buildImageWorkflow(
        { ...params, references },
        policy
      );
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
          const image = entry.outputs?.[spec.outputNode]?.images?.find(
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
            this.options.pollIntervalMs ?? runtime.comfyuiPollMs,
            Math.max(1, deadline - Date.now())
          )
        );
      }
      // 只尝试移除本任务的排队项，避免中断其他用户正在执行的任务。
      await axios
        .post(
          `${this.baseUrl}/queue`,
          { delete: [promptId] },
          { headers: this.headers, timeout: runtime.cancelTimeoutMs }
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
