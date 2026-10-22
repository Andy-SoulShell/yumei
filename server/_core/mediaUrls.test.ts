/** 验证实际响应中间件跨地址返回历史媒体，同时保持外链、正文及日期不变。 */
import { describe, expect, it, vi } from "vitest";
import { normalizeMediaResponse } from "./mediaUrls";
import { publicProcedure, router } from "./trpc";
import type { TrpcContext } from "./context";

vi.mock("node:os", () => ({
  hostname: () => "dev-mac.local",
  networkInterfaces: () => ({
    en0: [{ address: "192.168.0.38", family: "IPv4", internal: false }],
  }),
}));

describe("same-origin media responses", () => {
  it.each(["127.0.0.1", "localhost", "192.168.0.38", "dev-mac.local"])(
    "returns a file path for stored %s:3000 URLs",
    host => {
      const input = {
        imageUrl: `http://${host}:3000/files/photos/one.png?download=1#preview`,
      };
      expect(normalizeMediaResponse(input)).toEqual({
        imageUrl: "/files/photos/one.png?download=1#preview",
      });
      expect(input.imageUrl).toContain(host);
      for (const origin of [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.38:3000",
        "http://dev-mac.local:3000",
      ]) {
        expect(
          new URL(normalizeMediaResponse(input).imageUrl, origin).origin
        ).toBe(origin);
      }
    }
  );

  it("normalizes nested avatars, references, chat pictures, gallery pictures and audio", () => {
    const prefix = "http://127.0.0.1:3000/files/";
    const createdAt = new Date("2026-10-20T00:00:00Z");
    const input = {
      user: { image: `${prefix}user-avatar.png` },
      role: {
        avatarUrl: `${prefix}avatar.png`,
        referenceImageUrl: `${prefix}reference.png`,
        createdAt,
      },
      pages: [{ items: [{ imageUrl: `${prefix}photo.png` }] }],
      playback: { audioUrl: `${prefix}voice.mp3` },
      conversation: { girlfriendImage: `${prefix}reference.png` },
      upload: { key: "file.bin", url: `${prefix}file.bin` },
    };
    const result = normalizeMediaResponse(input);
    expect(result.user.image).toBe("/files/user-avatar.png");
    expect(result.role.avatarUrl).toBe("/files/avatar.png");
    expect(result.role.referenceImageUrl).toBe("/files/reference.png");
    expect(result.role.createdAt).toBe(createdAt);
    expect(result.pages[0].items[0].imageUrl).toBe("/files/photo.png");
    expect(result.playback.audioUrl).toBe("/files/voice.mp3");
    expect(result.conversation.girlfriendImage).toBe("/files/reference.png");
    expect(result.upload.url).toBe("/files/file.bin");
    expect(input.upload.url).toBe(`${prefix}file.bin`);
  });

  it("preserves external files, signed URLs, other ports and user-authored strings", () => {
    const input = {
      imageUrl: "https://cdn.example.com/files/image.png",
      audioUrl: "https://bucket.s3.example.com/audio.mp3?signature=test",
      referenceImageUrl: "/characters/preset.jpg",
      url: "http://localhost:9000/files/other.png",
      avatarUrl: null,
      content: "http://127.0.0.1:3000/files/mentioned.png",
      apiBaseUrl: "http://127.0.0.1:3000/files/service",
      invalid: { imageUrl: "http://[invalid" },
    };
    expect(normalizeMediaResponse(input)).toEqual(input);
  });

  it("applies normalization through the actual tRPC response middleware", async () => {
    const stored = { imageUrl: "http://127.0.0.1:3000/files/old-image.png" };
    const api = router({ media: publicProcedure.query(() => stored) });
    const caller = api.createCaller({
      user: null,
      req: {},
      res: {},
    } as TrpcContext);
    expect(await caller.media()).toEqual({ imageUrl: "/files/old-image.png" });
    expect(stored.imageUrl).toBe("http://127.0.0.1:3000/files/old-image.png");
  });
});
