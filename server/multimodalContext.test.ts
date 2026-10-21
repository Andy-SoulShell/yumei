import { resolveCompanionBehavior } from "./testAiConfig";
import { stubProductConfig } from "./testProductConfig";
import axios from "axios";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  aiTaskRuns,
  generationRequests,
  selfies,
  users,
} from "../drizzle/schema";

import * as imageProvider from "./_core/imageProvider";
import { keyProvider } from "./_core/keyProvider";
import { getDb } from "./database";
import * as managedMedia from "./managedMedia";
import { clearMemories } from "./memory";
import * as memory from "./memory";
import * as chatProvider from "./_core/chatProvider";
import { runChatTurns, submitChatTurn } from "./chatStreaming";
import { upsertApiConfig } from "./repositories/apiConfig";
import { permanentDeleteGirlfriend } from "./repositories/companions";
import {
  createConversation,
  createMessage,
  getConversationMessages,
} from "./repositories/conversations";
import { appRouter } from "./routers";
import { createTestGirlfriend } from "./testFixtures";
import { transcribeWithOpenAI } from "./_core/openaiWhisper";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const cleanup: { userId: string; roleId: number }[] = [];
beforeEach(() => {
  stubProductConfig("billing.mode", "none");
  vi.spyOn(imageProvider, "resolveImageProvider").mockResolvedValue({
    name: "fal",
    apiKey: "fake",
    configured: true,
    isByok: false,
  });
  vi.spyOn(memory, "maybeExtractMemories").mockImplementation(async () => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const item of cleanup.splice(0))
    await permanentDeleteGirlfriend(item.roleId, item.userId);
});
async function seed() {
  const userId = `multimodal-${crypto.randomUUID()}`;
  const gf = await createTestGirlfriend({
    userId,
    name: "Test",
    personality: "gentle",
    appearance: "adult, dark hair",
    intimacyLevel: 6,
    behavior: resolveCompanionBehavior({ expression: "reserved" }),
    referenceImageKey: "multimodal-test-ref",
    referenceImageUrl: "/files/multimodal-test-ref",
  });
  cleanup.push({ userId, roleId: gf.id });
  const conversation = await createConversation({
    userId,
    girlfriendId: gf.id,
  });
  const caller = appRouter.createCaller({
    user: { id: userId, birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as never);
  return { userId, gf, conversation, caller };
}

it.each(["camera", "couple"] as const)(
  "%s follows the current request without stored emotion, behavior or chat history",
  async mode => {
    const a = await seed();
    await createMessage({
      conversationId: a.conversation.id,
      role: "assistant",
      content: "我穿着蓝色衬衫。",
      generationStatus: "succeeded",
    });
    const generate = vi
      .spyOn(imageProvider, "generateProviderImage")
      .mockResolvedValue(png);
    const userContext = "今天好累，想看白色衬衫的自拍";
    const result =
      mode === "couple"
        ? await a.caller.selfie.generateCouple({
            conversationId: a.conversation.id,
            userPhotoBase64: png.toString("base64"),
            userPhotoMimeType: "image/png",
            userContext,
          })
        : await a.caller.selfie.generate({
            conversationId: a.conversation.id,
            userContext,
          });
    expect(result.message.imageKey).toBeTruthy();
    const prompt = generate.mock.calls[0][1].prompt;
    expect(prompt).not.toContain('"expression"');
    expect(prompt).not.toContain('"relationshipLevel"');
    expect(prompt).not.toContain('"tone"');
    expect(prompt.endsWith(userContext)).toBe(true);
    expect(prompt).toContain("白色衬衫");
    expect(prompt).not.toContain("蓝色衬衫");
  }
);

it.each(["camera", "chat", "couple"] as const)(
  "does not publish %s output or replay old input after its role context was forgotten",
  async mode => {
    const a = await seed();
    let finish!: (bytes: Buffer) => void;
    const generate = vi
      .spyOn(imageProvider, "generateProviderImage")
      .mockImplementation(
        async () =>
          new Promise<Buffer>(resolve => {
            finish = resolve;
          })
      );
    const pending =
      mode === "chat"
        ? a.caller.chat.sendMessage({
            conversationId: a.conversation.id,
            content: "发张自拍，旁边是我的猫麻薯。",
          })
        : mode === "couple"
          ? a.caller.selfie.generateCouple({
              conversationId: a.conversation.id,
              userPhotoBase64: png.toString("base64"),
              userPhotoMimeType: "image/png",
              userContext: "自然合照",
            })
          : a.caller.selfie.generate({
              conversationId: a.conversation.id,
              userContext: "自拍",
            });
    const rejected = expect(pending).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await clearMemories(a.userId, a.gf.id);
    finish(png);
    await rejected;
    const db = (await getDb())!;
    expect(
      await db.select().from(selfies).where(eq(selfies.userId, a.userId))
    ).toHaveLength(0);
    const [request] = await db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.userId, a.userId));
    expect(request).toMatchObject({
      status: "failed",
      telemetry: { outcome: "succeeded", costUsd: null },
    });
    expect(request.kind).toBe(mode === "couple" ? "couple" : "selfie");
    expect(
      JSON.stringify(await getConversationMessages(a.conversation.id))
    ).not.toContain("麻薯");
    if (mode === "chat") {
      vi.spyOn(chatProvider, "resolveChatProvider").mockResolvedValue({
        name: "openrouter",
        baseUrl: "https://example.test",
        model: "test",
        apiKey: "fake",
        isByok: true,
      });
      const fetchMock = vi.fn(
        async (_url: unknown, _options: RequestInit) =>
          new Response(
            'data: {"choices":[{"delta":{"content":"我目前没有这项记忆。"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            { headers: { "Content-Type": "text/event-stream" } }
          )
      );
      vi.stubGlobal("fetch", fetchMock);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, a.userId));
      await submitChatTurn(user, {
        clientRequestId: crypto.randomUUID(),
        conversationId: a.conversation.id,
        content: "你记得什么？",
      });
      await runChatTurns([a.userId]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].body).not.toContain("麻薯");
    }
  }
);

it("records a TTS attempt without storing spoken content or pretending unknown cost is zero", async () => {
  const a = await seed();
  await upsertApiConfig({
    userId: a.userId,
    ttsProvider: "elevenlabs",
    elevenlabsVoiceId: "test-voice",
  });
  vi.spyOn(keyProvider, "resolve").mockResolvedValue({
    value: "synthetic-key",
    source: "user",
  });
  const post = vi
    .spyOn(axios, "post")
    .mockResolvedValue({ data: Buffer.from("mp3") });
  vi.spyOn(managedMedia, "putStagedMedia").mockResolvedValue({
    key: "tts-test",
    url: "/files/tts-test",
  });
  const result = await a.caller.tts.generate({
    text: "这段合成私密对白不应写进统计。",
  });
  expect(result.audioUrl).toBe("/files/tts-test");
  expect(post.mock.calls[0][2]?.signal).toBeInstanceOf(AbortSignal);
  const [task] = await (await getDb())!
    .select()
    .from(aiTaskRuns)
    .where(eq(aiTaskRuns.userId, a.userId));
  expect(task).toMatchObject({
    kind: "tts",
    outcome: "succeeded",
    usage: { costUsd: null },
  });
  expect(JSON.stringify(task)).not.toMatch(/私密对白|synthetic-key|test-voice/);
});

it("redacts upstream transcription failures instead of returning the response body", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "secret-key and uploaded-audio" },
          }),
          { status: 500 }
        )
    )
  );
  const result = await transcribeWithOpenAI(
    { audio: { data: Buffer.from("test"), mimeType: "audio/webm" } },
    "sk-synthetic-key"
  );
  expect(result).toMatchObject({ code: "TRANSCRIPTION_FAILED" });
  expect(JSON.stringify(result)).not.toMatch(/secret-key|uploaded-audio/);
});
