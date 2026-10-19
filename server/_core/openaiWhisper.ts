/** 下载已上传的语音并调用 OpenAI Whisper，向路由返回结构化结果或错误。 */

/** 语音转写输入，包含可下载地址与可选语言、上下文提示。 */

export type TranscribeOptions = {
  /** 服务端能够下载的音频地址。 */
  audioUrl: string;
  /** 可选的转写语言代码，例如 zh 或 en。 */
  language?: string;
  /** 辅助识别专有词或语境的可选文本。 */
  prompt?: string;
};

/** Whisper 分段文本及时间与置信度字段，起止时间单位为秒。 */
export type WhisperSegment = {
  id: number;
  seek: number;
  /** 片段起始时间，单位为秒。 */
  start: number;
  /** 片段结束时间，单位为秒。 */
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

/** Whisper verbose_json 响应，duration 单位为秒。 */
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  /** 音频时长，单位为秒。 */
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

/** 业务层使用的 Whisper 成功结果别名。 */
export type TranscriptionResponse = WhisperResponse;

/** 业务层可识别的转写错误，details 用于补充上游失败信息。 */
export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "UPLOAD_FAILED"
    | "SERVICE_ERROR";
  details?: string;
};

/**
 * 下载音频后调用 Whisper，并返回成功结果或结构化错误。
 *
 * @param options - 可访问的音频地址、语言及可选提示词
 * @param apiKey - 仅供服务端使用的 OpenAI 密钥
 * @remarks 下载后检查二十五 MB 上限；当前下载和转写请求未设置独立超时。
 */
export async function transcribeWithOpenAI(
  options: TranscribeOptions,
  apiKey: string
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // 调用前要求可用密钥。
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return {
        error: "Invalid OpenAI API key",
        code: "SERVICE_ERROR",
        details: "API key must start with 'sk-'",
      };
    }

    // 从给定地址下载音频。
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const response = await fetch(options.audioUrl);
      if (!response.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type") || "audio/mpeg";

      // 按当前实现的 25 MB 上限校验文件大小。
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 25) {
        return {
          error: "Audio file exceeds OpenAI's maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 25MB`,
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // 使用 multipart 表单上传到 Whisper 接口。
    const formData = new FormData();

    // 将下载内容封装为音频文件。
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], {
      type: mimeType,
    });
    formData.append("file", audioBlob, filename);

    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

    // 附加调用方提供的可选参数。
    if (options.language) {
      formData.append("language", options.language);
    }
    if (options.prompt) {
      formData.append("prompt", options.prompt);
    }

    // 请求 Whisper 转写。
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMessage = "OpenAI Whisper API request failed";

      // 尝试读取上游错误信息。
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // 无法解析时保留默认错误信息。
      }

      return {
        error: errorMessage,
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`,
      };
    }

    // 解析转写结果。
    const whisperResponse = (await response.json()) as WhisperResponse;

    // 校验上游响应结构。
    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "Invalid transcription response from OpenAI",
        code: "SERVICE_ERROR",
        details: "OpenAI returned an invalid response format",
      };
    }

    return whisperResponse; // 返回原始 Whisper 响应。
  } catch (error) {
    // 将未预期异常转换为统一错误结果。
    return {
      error: "OpenAI Whisper transcription failed",
      code: "SERVICE_ERROR",
      details:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/** 按音频 MIME 类型选择上传文件扩展名，未知类型回退为 audio。 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };

  return mimeToExt[mimeType] || "audio";
}
