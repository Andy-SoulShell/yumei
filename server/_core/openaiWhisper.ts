/** 使用内存中的录音调用 OpenAI Whisper，返回结构化结果或错误。 */

/** 语音转写输入，包含录音字节与可选语言、上下文提示。 */

export type TranscribeOptions = {
  /** 已通过业务层校验的录音字节；不写入公开存储。 */
  audio: { data: Uint8Array; mimeType: string };
  /** 可选的转写语言代码，例如 zh 或 en。 */
  language?: string;
  /** 辅助识别专有词或语境的可选文本。 */
  prompt?: string;
  signal?: AbortSignal;
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
 * 使用录音字节调用 Whisper，并返回成功结果或结构化错误。
 *
 * @param options - 录音字节、语言及可选提示词
 * @param apiKey - 仅供服务端使用的 OpenAI 密钥
 * @remarks 不保存原始录音；转写最多等待六十秒。
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

    const audioBuffer = Buffer.from(options.audio.data);
    const mimeType = options.audio.mimeType;
    if (audioBuffer.length > 25 * 1024 * 1024)
      return {
        error: "Audio file exceeds maximum size",
        code: "FILE_TOO_LARGE",
      };

    // 使用 multipart 表单上传到 Whisper 接口。
    const formData = new FormData();

    // 将录音字节封装为音频文件。
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
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(60_000)])
          : AbortSignal.timeout(60_000),
      }
    );

    if (!response.ok) {
      return {
        error: "Voice transcription failed. Please try again.",
        code: "TRANSCRIPTION_FAILED",
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
