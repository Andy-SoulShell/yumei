import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: "test-user-1",
    openId: "voice-test-user",
    email: "voice@example.com",
    name: "Voice Test User",
    loginMethod: "manus",
    role: "user",
    // M1-6: AI routes require a confirmed 18+ birth date.
    birthDate: new Date("1990-01-01"),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

// A minimal valid base64 audio-like string (not real audio, but tests input validation)
const FAKE_AUDIO_BASE64 = "SGVsbG8gV29ybGQ="; // "Hello World" in base64

describe("voice.transcribe", () => {
  it("should reject unauthenticated requests", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.voice.transcribe({
        audioBase64: FAKE_AUDIO_BASE64,
        mimeType: "audio/webm",
      })
    ).rejects.toThrow();
  });

  it("should reject empty audio data", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.voice.transcribe({
        audioBase64: "",
        mimeType: "audio/webm",
      })
    ).rejects.toThrow();
  });

  it("should reject audio data exceeding 16MB", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Generate a base64 string that decodes to > 16MB
    // 16MB = 16 * 1024 * 1024 = 16777216 bytes
    // Base64 encoding: 4 chars = 3 bytes, so we need ~22369622 chars
    const largeBase64 = Buffer.alloc(17 * 1024 * 1024).toString("base64");

    await expect(
      caller.voice.transcribe({
        audioBase64: largeBase64,
        mimeType: "audio/webm",
      })
    ).rejects.toThrow(/音频文件过大/);
  });

  it("should accept valid input with default mimeType", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This will fail at the S3 upload or Whisper stage (not in validation)
    // We just verify the input validation passes
    try {
      await caller.voice.transcribe({
        audioBase64: FAKE_AUDIO_BASE64,
      });
    } catch (error: any) {
      // Should not be a validation error (BAD_REQUEST)
      // It will likely fail at S3 upload or Whisper API call
      expect(error.code).not.toBe("BAD_REQUEST");
    }
  });

  it("should handle different mimeType values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mimeTypes = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"];

    for (const mimeType of mimeTypes) {
      try {
        await caller.voice.transcribe({
          audioBase64: FAKE_AUDIO_BASE64,
          mimeType,
        });
      } catch (error: any) {
        // Should pass validation, fail at S3/Whisper level
        expect(error.code).not.toBe("BAD_REQUEST");
      }
    }
  });

  it("should accept optional language parameter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.voice.transcribe({
        audioBase64: FAKE_AUDIO_BASE64,
        mimeType: "audio/webm",
        language: "zh",
      });
    } catch (error: any) {
      // Should pass validation
      expect(error.code).not.toBe("BAD_REQUEST");
    }
  });

  it("should calculate correct file size from base64", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // 10 bytes of data encoded as base64
    const smallData = Buffer.alloc(10).toString("base64");

    try {
      await caller.voice.transcribe({
        audioBase64: smallData,
        mimeType: "audio/webm",
      });
    } catch (error: any) {
      // Should not be a size error
      expect(error.message).not.toMatch(/音频文件过大/);
    }
  });
});
