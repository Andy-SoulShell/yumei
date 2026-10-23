import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { createTestUser } from "./testFixtures";
import { getDb } from "./database";
import { putStagedMedia } from "./managedMedia";
import { canReadMedia } from "./mediaAuthorization";
import { isMediaPendingDeletion } from "./mediaCleanup";
import { registerFileRoutes } from "./_core/files";
const identity = vi.hoisted(() => ({ id: undefined as string | undefined }));
vi.mock("./_core/auth", () => ({
  getSessionUser: async () => (identity.id ? { id: identity.id } : null),
}));
const app = express();
registerFileRoutes(app);
const server = createServer(app);
let base: string;
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
it("blocks anonymous and cross-account HTTP reads while retaining owner range downloads", async () => {
  const a = await createTestUser(),
    b = await createTestUser(),
    key = `private-${randomUUID()}.png`;
  await putStagedMedia(a, key, Buffer.from("private bytes"), "image/png");
  identity.id = undefined;
  expect((await fetch(`${base}/files/${key}`)).status).toBe(404);
  identity.id = b;
  expect((await fetch(`${base}/files/${key}`)).status).toBe(404);
  identity.id = a;
  const owned = await fetch(`${base}/files/${key}`, {
    headers: { Range: "bytes=0-6" },
  });
  expect(owned.status).toBe(206);
  expect(await owned.text()).toBe("private");
});
it("keeps official public assets readable without a user account", async () => {
  const key = `official-${randomUUID()}.png`;
  await putStagedMedia(
    "management",
    key,
    Buffer.from("public art"),
    "image/png"
  );
  identity.id = undefined;
  expect(await canReadMedia(key)).toBe(true);
  expect((await fetch(`${base}/files/${key}`)).status).toBe(200);
});
it("revokes an orphaned upload immediately while its future cleanup deadline is still pending", async () => {
  const id = await createTestUser(),
    key = `orphan-${randomUUID()}.png`;
  await putStagedMedia(id, key, Buffer.from("private"), "image/png");
  expect(await isMediaPendingDeletion(key)).toBe(false);
  await (await getDb())!.delete(users).where(eq(users.id, id));
  expect(await canReadMedia(key, id)).toBe(false);
  expect(await isMediaPendingDeletion(key)).toBe(true);
  identity.id = id;
  expect((await fetch(`${base}/files/${key}`)).status).toBe(404);
});
