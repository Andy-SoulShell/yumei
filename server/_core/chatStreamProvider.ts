/** 解码 OpenAI 兼容流；网络分块、UTF-8 和 SSE 事件边界彼此独立。 */
import { knownUsage } from "../generationTelemetry";

/** 不保存供应商原始载荷，只向业务层传递正文、结束标志与有限统计。 */
export type ChatProviderEvent = {
  text?: string;
  finished?: boolean;
  stopReason?: "stop" | "length";
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  };
};

/**
 * 处理 CRLF、注释、多行 data 和任意字节边界；异常或不完整结束明确失败。
 * reader 在取消时释放，调用方仍须 abort HTTP 请求以中断实际供应商调用。
 */
export async function* parseChatProviderStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ChatProviderEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    data: string[] = [],
    dataSize = 0,
    completed = false,
    done = false;
  let providerFailed = false;
  function parseEvent(): ChatProviderEvent | null {
    if (!data.length) return null;
    const payload = data.join("\n");
    data = [];
    dataSize = 0;
    if (payload.trim() === "[DONE]") {
      completed = true;
      done = true;
      return { finished: true };
    }
    let parsed: {
      error?: unknown;
      choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[];
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        cost?: unknown;
      };
    };
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error("Malformed chat stream event");
    }
    if (!parsed || typeof parsed !== "object")
      throw new Error("Provider stream failed");
    const choice = parsed.choices?.[0];
    const reason = choice?.finish_reason;
    providerFailed =
      !!parsed.error ||
      (reason != null && reason !== "stop" && reason !== "length");
    const finished = reason != null && !providerFailed;
    if (finished) completed = true;
    const text =
      typeof choice?.delta?.content === "string"
        ? choice.delta.content
        : undefined;
    const usage = parsed.usage
      ? {
          inputTokens: knownUsage(parsed.usage.prompt_tokens),
          outputTokens: knownUsage(parsed.usage.completion_tokens),
          costUsd: knownUsage(parsed.usage.cost),
        }
      : undefined;
    return {
      text,
      finished,
      usage,
      ...(finished ? { stopReason: reason as "stop" | "length" } : {}),
    };
  }
  try {
    while (!done) {
      const chunk = await reader.read();
      buffer += chunk.done
        ? decoder.decode()
        : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 256_000)
        throw new Error("Chat stream event exceeds limit");
      let index: number;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (!line) {
          const event = parseEvent();
          if (event) yield event;
          if (providerFailed) throw new Error("Provider stream failed");
          if (done) break;
        } else if (!line.startsWith(":")) {
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          let value = colon === -1 ? "" : line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "data") {
            dataSize += value.length;
            if (dataSize > 256_000)
              throw new Error("Chat stream event exceeds limit");
            data.push(value);
          }
        }
      }
      if (chunk.done) break;
    }
    // SSE requires a blank line to dispatch an event; a truncated data frame is never accepted.
    if (!completed || (!done && (buffer.trim() || data.length)))
      throw new Error("Chat stream ended before completion");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
