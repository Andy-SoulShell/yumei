/** 通过本机 HTTP 服务及真实路由验证本地 TTS 协议、凭据隔离与持久化。 */
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { aiTaskRuns, mediaDeletions } from "../drizzle/schema";
import {
  generateOmniVoiceSpeech,
  getOmniVoiceCatalog,
} from "./_core/omnivoice";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./database";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";

const wave = Buffer.alloc(46);
wave.write("RIFF");
wave.writeUInt32LE(38, 4);
wave.write("WAVEfmt ", 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(24000, 24);
wave.writeUInt32LE(48000, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write("data", 36);
wave.writeUInt32LE(2, 40);
let server: Server;
let status = 200;
let invalidAudio = false;
let body: any;
let authorization: string | undefined;

beforeEach(async () => {
  status = 200;
  invalidAudio = false;
  body = undefined;
  authorization = undefined;
  server = createServer(async (request, response) => {
    authorization = request.headers.authorization;
    if (request.url === "/v1/audio/voices") {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          voices: [
            { id: "default", name: "Local voice" },
            { id: "custom", name: "Custom" },
          ],
        })
      );
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    body = JSON.parse(Buffer.concat(chunks).toString());
    response.writeHead(status, { "Content-Type": "audio/wav" });
    response.end(invalidAudio ? Buffer.from("not audio") : wave);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  vi.stubEnv("OMNIVOICE_BASE_URL", `http://127.0.0.1:${address.port}`);
  vi.stubEnv("OMNIVOICE_API_KEY", "test-local-service-secret");
  vi.stubEnv("OMNIVOICE_TIMEOUT_MS", "180000");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
});

describe("OmniVoice local adapter", () => {
  it("stays optional when no service is configured", async () => {
    vi.stubEnv("OMNIVOICE_BASE_URL", "");
    expect(await getOmniVoiceCatalog()).toEqual({
      configured: false,
      available: false,
      voices: [],
    });
    await expect(
      generateOmniVoiceSpeech("hello", "default", new AbortController().signal)
    ).rejects.toThrow("尚未配置");
    expect(authorization).toBeUndefined();
  });

  it("returns only public voices and sends the operator key to the fixed endpoint", async () => {
    const result = await getOmniVoiceCatalog();
    expect(result).toMatchObject({ configured: true, available: true });
    expect(result.voices).toHaveLength(2);
    expect(authorization).toBe("Bearer test-local-service-secret");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("127.0.0.1");
  });

  it("shows a configured but unavailable service without leaking errors", async () => {
    status = 401;
    expect(await getOmniVoiceCatalog()).toEqual({
      configured: true,
      available: false,
      voices: [],
    });
  });

  it("requests WAV and rejects malformed provider responses", async () => {
    const signal = new AbortController().signal;
    expect(await generateOmniVoiceSpeech("你好", "custom", signal)).toEqual(
      wave
    );
    expect(body).toEqual({
      model: "omnivoice",
      input: "你好",
      voice: "custom",
      response_format: "wav",
    });
    invalidAudio = true;
    await expect(
      generateOmniVoiceSpeech("你好", "default", signal)
    ).rejects.toThrow("语音生成失败");
  });

  it("reports a busy service and respects cancellation", async () => {
    status = 429;
    await expect(
      generateOmniVoiceSpeech("你好", "default", new AbortController().signal)
    ).rejects.toThrow("稍后重试");
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateOmniVoiceSpeech("你好", "default", controller.signal)
    ).rejects.toThrow("语音生成失败");
  });

  it("persists the selected provider and voice, generates audio, and records cleanup and usage", async () => {
    const id = await createTestUser();
    const caller = appRouter.createCaller({
      user: { id, birthDate: new Date("1990-01-01") },
      req: {},
      res: {},
    } as TrpcContext);
    await caller.apiConfig.updatePreferences({
      ttsProvider: "omnivoice",
      omnivoiceVoiceId: "custom",
    });
    expect((await caller.apiConfig.get()).preferences).toMatchObject({
      ttsProvider: "omnivoice",
      omnivoiceVoiceId: "custom",
    });
    expect(await caller.tts.omnivoiceStatus()).toMatchObject({
      available: true,
    });
    const result = await caller.tts.generate({ text: "你好，很高兴见到你。" });
    expect(result.provider).toBe("omnivoice");
    expect(result.audioUrl).toContain(".wav");
    expect(body.voice).toBe("custom");
    const db = (await getDb())!;
    expect(
      await db.select().from(aiTaskRuns).where(eq(aiTaskRuns.userId, id))
    ).toEqual([
      expect.objectContaining({
        kind: "tts",
        provider: "omnivoice",
        outcome: "succeeded",
      }),
    ]);
    expect(
      await db
        .select()
        .from(mediaDeletions)
        .where(eq(mediaDeletions.userId, id))
    ).toEqual([
      expect.objectContaining({ key: expect.stringContaining(".wav") }),
    ]);
    await caller.apiConfig.updatePreferences({ omnivoiceVoiceId: null });
    expect(
      (await caller.apiConfig.get()).preferences?.omnivoiceVoiceId
    ).toBeNull();
  });

  it("requires authentication for service status", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {},
      res: {},
    } as TrpcContext);
    await expect(caller.tts.omnivoiceStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
