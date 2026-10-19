import axios from "axios";
import { keyProvider } from "./keyProvider";
import {
  ComfyUIClient,
  type ImageGenerationMode,
  type ImageInput,
} from "./comfyui";
import { storageRead } from "../storage";
import { DEFAULT_GIRLFRIEND } from "../../shared/defaultGirlfriend";

export type ImageProvider = {
  name: "fal" | "comfyui";
  apiKey: string | null;
  isByok: boolean;
  configured: boolean;
};

export async function resolveImageProvider(
  userId: string
): Promise<ImageProvider> {
  const keys = await keyProvider.describeUserKeys(userId);
  const isByok = keys.fal?.isSet === true;
  if (process.env.IMAGE_PROVIDER === "comfyui" && !isByok) {
    return {
      name: "comfyui",
      apiKey: process.env.COMFYUI_API_KEY || null,
      configured: !!process.env.COMFYUI_BASE_URL,
      isByok: false,
    };
  }
  const apiKey = await keyProvider.get({ userId }, "fal");
  return { name: "fal", apiKey, configured: !!apiKey, isByok };
}

type Reference = { key: string; url: string };

async function readReference(reference: Reference): Promise<ImageInput> {
  let data: Buffer;
  // The bundled default companion has an external reference, not a storage key.
  // All user uploads are read by key, without fetching arbitrary user URLs.
  if (
    reference.url === DEFAULT_GIRLFRIEND.referenceImageUrl &&
    reference.key.startsWith("default-yumei-")
  ) {
    const response = await axios.get<ArrayBuffer>(
      DEFAULT_GIRLFRIEND.referenceImageUrl,
      {
        responseType: "arraybuffer",
        timeout: 30_000,
        maxContentLength: 25 * 1024 * 1024,
      }
    );
    data = Buffer.from(response.data);
  } else {
    data = await storageRead(reference.key);
  }
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
  const couple = params.references.length > 1;
  const model = couple
    ? process.env.FAL_COUPLE_MODEL || "fal-ai/nano-banana/edit"
    : "fal-ai/grok-imagine-image-edit";
  const response = await axios.post(
    `https://fal.run/${model}`,
    {
      prompt: params.prompt,
      ...(couple
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
