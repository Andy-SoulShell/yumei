/** 解析图片服务并统一调用 ComfyUI 或 fal.ai，返回待保存的图片字节。 */

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
  userId: string
): Promise<ImageProvider> {
  const key = await keyProvider.resolve({ userId }, "fal");
  const isByok = key.source === "user";
  if (process.env.IMAGE_PROVIDER === "comfyui" && !isByok) {
    return {
      name: "comfyui",
      apiKey: process.env.COMFYUI_API_KEY || null,
      configured: !!process.env.COMFYUI_BASE_URL,
      isByok: false,
    };
  }
  const apiKey = key.value;
  return { name: "fal", apiKey, configured: !!apiKey, isByok };
}

/** 角色或用户参考图的存储键与外部服务可读取的地址。 */
type Reference = { key: string; url: string };

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
  }
): Promise<Buffer> {
  if (provider.name === "comfyui") {
    const references: ImageInput[] = [];
    if (params.mode === "reference") {
      for (const reference of params.references)
        references.push(await readReference(reference));
    }
    return new ComfyUIClient({
      baseUrl: process.env.COMFYUI_BASE_URL!,
      apiKey: provider.apiKey || undefined,
      timeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS || 600_000),
    }).generate({ prompt: params.prompt, mode: params.mode, references });
  }
  const textOnly = params.mode === "text";
  const couple = params.references.length > 1;
  const model = textOnly
    ? "xai/grok-imagine-image"
    : couple
      ? process.env.FAL_COUPLE_MODEL || "fal-ai/nano-banana/edit"
      : "fal-ai/grok-imagine-image-edit";
  const response = await axios.post(
    `https://fal.run/${model}`,
    {
      prompt: params.prompt,
      ...(textOnly
        ? { num_images: 1, aspect_ratio: "3:4", output_format: "png" }
        : couple
          ? { image_urls: params.references.map(ref => ref.url) }
          : { image_url: params.references[0].url }),
    },
    { headers: { Authorization: `Key ${provider.apiKey}` }, timeout: 120_000 }
  );
  const imageUrl = response.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error("图片服务未返回生成结果");
  const downloaded = await axios.get<ArrayBuffer>(imageUrl, {
    responseType: "arraybuffer",
    timeout: 60_000,
    maxContentLength: 25 * 1024 * 1024,
  });
  return Buffer.from(downloaded.data);
}
