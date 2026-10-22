/** 仅连接运营方配置的 OmniVoice 地址；客户端不能指定 URL 或服务密钥。 */
import axios from "axios";
import { z } from "zod";

const catalogSchema = z.object({
  voices: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
      })
    )
    .min(1)
    .max(100),
});

export function getOmniVoiceConfig() {
  const baseUrl = process.env.OMNIVOICE_BASE_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  const url = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("OMNIVOICE_BASE_URL 必须是无凭据的 HTTP(S) 服务地址");
  const timeout = Number(process.env.OMNIVOICE_TIMEOUT_MS || 180000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000)
    throw new Error("OMNIVOICE_TIMEOUT_MS 必须为 1000～600000 毫秒");
  return {
    baseUrl,
    timeout,
    headers: process.env.OMNIVOICE_API_KEY
      ? { Authorization: `Bearer ${process.env.OMNIVOICE_API_KEY}` }
      : {},
  };
}

export async function getOmniVoiceCatalog() {
  const config = getOmniVoiceConfig();
  if (!config) return { configured: false, available: false, voices: [] };
  try {
    const response = await axios.get(`${config.baseUrl}/v1/audio/voices`, {
      headers: config.headers,
      timeout: 5000,
      maxRedirects: 0,
      maxContentLength: 100000,
    });
    return {
      configured: true,
      available: true,
      voices: catalogSchema.parse(response.data).voices,
    };
  } catch {
    return { configured: true, available: false, voices: [] };
  }
}

export async function generateOmniVoiceSpeech(
  text: string,
  voice: string,
  signal: AbortSignal
) {
  const config = getOmniVoiceConfig();
  if (!config) throw new Error("OmniVoice 本地服务尚未配置");
  try {
    const response = await axios.post(
      `${config.baseUrl}/v1/audio/speech`,
      {
        model: "omnivoice",
        input: text,
        voice,
        response_format: "wav",
      },
      {
        headers: config.headers,
        signal,
        timeout: config.timeout,
        maxRedirects: 0,
        responseType: "arraybuffer",
        maxContentLength: 50 * 1024 * 1024,
      }
    );
    const audio = Buffer.from(response.data);
    if (
      audio.length < 44 ||
      audio.toString("ascii", 0, 4) !== "RIFF" ||
      audio.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new Error("Invalid WAV response");
    return audio;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429)
      // eslint-disable-next-line preserve-caught-error -- Do not retain Axios headers containing service credentials.
      throw new Error("OmniVoice 正在生成语音，请稍后重试");
    if (axios.isAxiosError(error) && error.response?.status === 400)
      // eslint-disable-next-line preserve-caught-error -- Do not retain Axios headers containing service credentials.
      throw new Error("OmniVoice 音色不可用，请在语音设置中重新选择");
    // eslint-disable-next-line preserve-caught-error -- Provider errors can contain service credentials and local paths.
    throw new Error(
      "OmniVoice 语音生成失败，请检查本地服务是否运行；首次使用需下载模型"
    );
  }
}
