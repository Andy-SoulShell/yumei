/** 验证真实流解码器，不把网络分块误当成字符、行或事件边界。 */
import { describe, expect, it } from "vitest";
import { parseChatProviderStream } from "./_core/chatStreamProvider";

function bytes(parts: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}
async function collect(text: string, splitEvery = 1) {
  const encoded = new TextEncoder().encode(text),
    parts = [];
  for (let index = 0; index < encoded.length; index += splitEvery)
    parts.push(encoded.slice(index, index + splitEvery));
  const result = [];
  for await (const event of parseChatProviderStream(bytes(parts)))
    result.push(event);
  return result;
}

describe("chat provider SSE parser", () => {
  it("decodes split UTF-8, CRLF, comments, event metadata, multiline JSON and usage", async () => {
    const result = await collect(
      ': keepalive\r\nevent: chunk\r\nid: provider-id\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"你好🌸"}}]}\r\n\r\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\r\n\r\n' +
        'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3,"cost":0.01}}\r\n\r\n' +
        "data: [DONE]\r\n\r\n"
    );
    expect(result.map(item => item.text ?? "").join("")).toBe("你好🌸");
    expect(result.some(item => item.finished)).toBe(true);
    expect(result.find(item => item.usage)?.usage).toEqual({
      inputTokens: 12,
      outputTokens: 3,
      costUsd: 0.01,
    });
  });
  it("accepts explicit completion followed by EOF without DONE", async () => {
    expect(
      await collect(
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'
      )
    ).toEqual([
      { text: "ok", finished: true, stopReason: "stop", usage: undefined },
    ]);
  });
  it("keeps unknown usage distinct from a real zero", async () => {
    const result = await collect(
      'data: {"usage":{"prompt_tokens":0,"completion_tokens":-1,"cost":"0.2"}}\n\ndata: [DONE]\n\n'
    );
    expect(result[0].usage).toEqual({
      inputTokens: 0,
      outputTokens: null,
      costUsd: null,
    });
  });
  it.each([
    'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
    'data: {"choices":[{"finish_reason":"stop"}]}',
    'data: {"error":{"message":"secret"}}\n\n',
    "data: invalid-secret\n\n",
  ])(
    "rejects malformed or truncated completion without returning upstream raw: %s",
    async text => {
      await expect(collect(text)).rejects.toThrow(/stream/i);
      await expect(collect(text)).rejects.not.toThrow("secret");
    }
  );
  it("rejects invalid UTF-8 rather than changing a persisted reply", async () => {
    const consume = async () => {
      for await (const _event of parseChatProviderStream(
        bytes([new Uint8Array([0xff])])
      )) {
        /* consume */
      }
    };
    await expect(consume()).rejects.toThrow();
  });

  it("exposes known usage before rejecting an error finish_reason", async () => {
    const stream = bytes([
      new TextEncoder().encode(
        'data: {"choices":[{"finish_reason":"error"}],"usage":{"prompt_tokens":7,"completion_tokens":1}}\n\n'
      ),
    ]);
    const iterator = parseChatProviderStream(stream);
    expect((await iterator.next()).value).toMatchObject({
      finished: false,
      usage: { inputTokens: 7, outputTokens: 1 },
    });
    await expect(iterator.next()).rejects.toThrow("Provider stream failed");
  });
});
