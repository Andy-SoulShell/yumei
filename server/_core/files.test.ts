/** 通过真实 HTTP 请求验证文件参数只解码一次，异常输入不终止服务。 */

import { eq } from "drizzle-orm";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaDeletions } from "../../drizzle/schema";
import { getDb } from "../database";
import { storagePut } from "../storage";
import { registerFileRoutes } from "./files";

const app = express();
registerFileRoutes(app);
app.get("/healthz", (_req, res) => res.json({ ok: true }));
const server = createServer(app);
let baseUrl: string;

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
});

describe("file HTTP route", () => {
  it("serves video MIME, byte ranges, suffix ranges and HEAD without changing audio MIME", async () => {
    const key = `video-${crypto.randomUUID()}.mp4`;
    await storagePut(key, "0123456789", "video/mp4");
    const partial = await fetch(`${baseUrl}/files/${key}`, {
      headers: { Range: "bytes=2-5" },
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("Content-Type")).toBe("video/mp4");
    expect(partial.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(await partial.text()).toBe("2345");
    const suffix = await fetch(`${baseUrl}/files/${key}`, {
      headers: { Range: "bytes=-3" },
    });
    expect(await suffix.text()).toBe("789");
    const invalid = await fetch(`${baseUrl}/files/${key}`, {
      headers: { Range: "bytes=50-60" },
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("Content-Range")).toBe("bytes */10");
    const head = await fetch(`${baseUrl}/files/${key}`, { method: "HEAD" });
    expect(head.headers.get("Content-Length")).toBe("10");
    expect(await head.text()).toBe("");
    const download = await fetch(`${baseUrl}/files/${key}?download=1`);
    expect(download.headers.get("Content-Disposition")).toBe("attachment");
    await storagePut("audio-route.mp4", "audio", "audio/mp4");
    expect(
      (await fetch(`${baseUrl}/files/audio-route.mp4`)).headers.get(
        "Content-Type"
      )
    ).toBe("audio/mp4");
  });
  it("hides an unreferenced file pending deletion even if storage deletion is delayed", async () => {
    const key = `file-route/deleted-${crypto.randomUUID()}.png`;
    await storagePut(key, "private");
    const db = (await getDb())!;
    await db
      .insert(mediaDeletions)
      .values({ key, userId: "deleted-file-test" });
    expect((await fetch(`${baseUrl}/files/${key}`)).status).toBe(404);
    await db.delete(mediaDeletions).where(eq(mediaDeletions.key, key));
  });

  it("survives a decoded percent sign and remains healthy", async () => {
    expect((await fetch(`${baseUrl}/files/%25`)).status).toBe(404);
    expect(await (await fetch(`${baseUrl}/healthz`)).json()).toEqual({
      ok: true,
    });
  });

  it("reads a literal percent filename without decoding it a second time", async () => {
    await storagePut("file-route/literal%name.png", "image bytes");
    const response = await fetch(
      `${baseUrl}/files/file-route/literal%25name.png`
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image bytes");
  });

  it("rejects encoded path traversal", async () => {
    expect((await fetch(`${baseUrl}/files/%2e%2e%2fsecret`)).status).toBe(400);
  });
});
