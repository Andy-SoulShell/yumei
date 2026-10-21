/** 解析图片服务并统一调用 ComfyUI 或 fal.ai，返回待保存的图片字节。 */
import type { ProductConfig } from "../../shared/productConfig";
import { getPublishedProductConfig } from "../repositories/productConfig";
import axios from "axios";
import { keyProvider } from "./keyProvider";
import {
  ComfyUIClient,
  type ImageGenerationMode,
  type ImageInput,
} from "./comfyui";
import { storageRead } from "../storage";

/** 图片服务解析结果；isByok 表示是否使用用户自带的 fal.ai 密钥。 */
export type ImageProvider = {
  name: "fal" | "comfyui";
  apiKey: string | null;
  isByok: boolean;
  configured: boolean;
};

/** 优先使用用户 fal.ai BYOK，否则使用运营方选定的图片服务。 */
export async function resolveImageProvider(
  userId: string,
  configuration?: ProductConfig
): Promise<ImageProvider> {
  const policy = configuration ?? (await getPublishedProductConfig());
  const key = await keyProvider.resolve({ userId }, "fal");
  const isByok = key.source === "user";
  if (policy.models.image.provider === "comfyui" && !isByok) {
    return {
      name: "comfyui",
      apiKey: process.env.COMFYUI_API_KEY || null,
      configured: !!policy.models.image.comfyuiBaseUrl,
      isByok: false,
    };
  }
  const apiKey = key.value;
  return { name: "fal", apiKey, configured: !!apiKey, isByok };
}

/** 角色或用户参考图的存储键与外部服务可读取的地址。 */
type Reference = { key: string; url: string };

/** 调用与统计共用相同模型/工作流身份，避免运营记录占位名。 */
export function imageGenerationModel(
  provider: ImageProvider["name"],
  mode: ImageGenerationMode,
  referenceCount: number,
  configuration: ProductConfig
) {
  if (provider === "comfyui")
    return configuration.models.image.workflows[mode].id;
  return referenceCount > 1
    ? configuration.models.image.falCouple
    : configuration.models.image.falSelfie;
}

/** 按存储键读取参考图，并根据文件头识别受支持的图片类型。 */
async function readReference(reference: Reference): Promise<ImageInput> {
  const data = await storageRead(reference.key);
  const mimeType = data.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71]))
    ? "image/png"
    : data[0] === 255 && data[1] === 216
      ? "image/jpeg"
      : data.toString("ascii", 0, 4) === "RIFF" &&
          data.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : data.toString("ascii", 0, 3) === "GIF"
          ? "image/gif"
          : null;
  if (!mimeType)
    throw new Error("参考图格式无效，请重新上传 PNG、JPEG 或 WebP 图片");
  return { data, mimeType };
}

/**
 * 调用当前图片服务完成生成并下载结果。
 *
 * @remarks ComfyUI 使用服务端上传的字节，fal.ai 使用参考图 URL；此处不写入数据库或计量。
 */
export async function generateProviderImage(
  provider: ImageProvider,
  params: {
    prompt: string;
    mode: ImageGenerationMode;
    references: Reference[];
  },
  configuration?: ProductConfig
): Promise<Buffer> {
  const policy = configuration ?? (await getPublishedProductConfig());
  if (provider.name === "comfyui") {
    const references: ImageInput[] = [];
    if (params.mode === "reference") {
      for (const reference of params.references)
        references.push(await readReference(reference));
    }
    return new ComfyUIClient({
      baseUrl: policy.models.image.comfyuiBaseUrl!,
      apiKey: provider.apiKey || undefined,
      configuration: policy,
    }).generate({ prompt: params.prompt, mode: params.mode, references });
  }
  const couple = params.references.length > 1;
  const model = imageGenerationModel(
    provider.name,
    params.mode,
    params.references.length,
    policy
  );
  const response = await axios.post(
    `https://fal.run/${model}`,
    {
      prompt: params.prompt,
      ...(couple
        ? { image_urls: params.references.map(ref => ref.url) }
        : { image_url: params.references[0].url }),
    },
    {
      headers: { Authorization: `Key ${provider.apiKey}` },
      timeout: policy.runtime.image.falTimeoutMs,
    }
  );
  const imageUrl = response.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error("图片服务未返回生成结果");
  const downloaded = await axios.get<ArrayBuffer>(imageUrl, {
    responseType: "arraybuffer",
    timeout: policy.runtime.image.downloadTimeoutMs,
    maxContentLength: policy.runtime.image.maxImageBytes,
  });
  return Buffer.from(downloaded.data);
}
