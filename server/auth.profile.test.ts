/** 用真实用户事务验证资料归属、头像生命周期、并发替换和失败补偿。 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mediaDeletions } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./database";
import { flushMediaDeletions, isMediaPendingDeletion } from "./mediaCleanup";
import * as usersRepository from "./repositories/users";
import { authRouter } from "./routers/auth";
import * as storage from "./storage";
import { createTestUser } from "./testFixtures";
import { stubProductConfig } from "./testProductConfig";

const avatar = { imageBase64: "dGVzdA==", mimeType: "image/png" as const };
beforeEach(() => {
  vi.spyOn(storage, "storagePut").mockImplementation(async key => ({
    key,
    url: `/files/${key}`,
  }));
  vi.spyOn(storage, "storageDelete").mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());
async function seed() {
  const id = await createTestUser();
  const user = (await usersRepository.getUserById(id))!;
  const caller = authRouter.createCaller({
    user,
    req: {},
    res: {},
  } as TrpcContext);
  return { id, caller };
}

it("saves trimmed names and avatars only for the signed-in user, then preserves or removes the avatar", async () => {
  const owner = await seed();
  const other = await seed();
  const updated = await owner.caller.updateProfile({
    name: "  小雨  ",
    avatar,
  });
  expect(updated.name).toBe("小雨");
  expect(updated.image).toMatch(/^\/files\/user-avatar-.*\.png$/);
  expect((await usersRepository.getUserById(other.id))!.image).toBeNull();
  expect((await usersRepository.getUserById(owner.id))!.name).toBe("小雨");
  const key = updated.image!.slice("/files/".length);
  expect(storage.storageDelete).not.toHaveBeenCalledWith(key);
  const renamed = await owner.caller.updateProfile({ name: "小明" });
  expect(renamed.image).toBe(updated.image);
  const removed = await owner.caller.updateProfile({
    name: "小明",
    avatar: null,
  });
  expect(removed.image).toBeNull();
  expect(storage.storageDelete).toHaveBeenCalledWith(key);
});

it("rejects anonymous, overlong, empty and privilege-changing requests before any file write", async () => {
  const { caller } = await seed();
  const anonymous = authRouter.createCaller({
    user: null,
    req: {},
    res: {},
  } as TrpcContext);
  await expect(
    anonymous.updateProfile({ name: "Name", avatar })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  for (const name of ["   ", "x".repeat(51), "name\nnext"])
    await expect(caller.updateProfile({ name, avatar })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  await expect(
    caller.updateProfile({ name: "Name", avatar, role: "admin" } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(storage.storagePut).not.toHaveBeenCalled();
});

it("enforces the published avatar limits and rejects corrupt Base64 without changing the name", async () => {
  const { caller, id } = await seed();
  stubProductConfig("uploads.avatar.maxBytes", 3);
  await expect(
    caller.updateProfile({ name: "Name", avatar })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller.updateProfile({
      name: "Name",
      avatar: { ...avatar, imageBase64: "!!!!" },
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect((await usersRepository.getUserById(id))!.name).toBeNull();
  expect(storage.storagePut).not.toHaveBeenCalled();
});

it("keeps committed avatars referenced by the cleanup queue", async () => {
  const { caller, id } = await seed();
  const saved = await caller.updateProfile({ name: "Name", avatar });
  const key = saved.image!.slice("/files/".length);
  const db = (await getDb())!;
  await db
    .insert(mediaDeletions)
    .values({ key, userId: id, availableAt: new Date() });
  expect(await isMediaPendingDeletion(key)).toBe(false);
  await flushMediaDeletions(id);
  expect(storage.storageDelete).not.toHaveBeenCalledWith(key);
  expect(
    await db.select().from(mediaDeletions).where(eq(mediaDeletions.key, key))
  ).toHaveLength(0);
});

it("rolls back a failed profile save and reclaims its staged upload, then allows retry", async () => {
  const { caller, id } = await seed();
  const failure = vi
    .spyOn(usersRepository, "updateUserProfile")
    .mockRejectedValueOnce(new Error("save failed"));
  await expect(caller.updateProfile({ name: "New", avatar })).rejects.toThrow(
    "save failed"
  );
  const key = vi.mocked(storage.storagePut).mock.calls[0][0];
  expect(storage.storageDelete).toHaveBeenCalledWith(key);
  expect((await usersRepository.getUserById(id))!.name).toBeNull();
  failure.mockRestore();
  expect((await caller.updateProfile({ name: "New", avatar })).name).toBe(
    "New"
  );
});

it("reclaims only the superseded avatar during concurrent saves", async () => {
  const { caller, id } = await seed();
  await Promise.all([
    caller.updateProfile({ name: "First", avatar }),
    caller.updateProfile({ name: "Second", avatar }),
  ]);
  await flushMediaDeletions(id);
  const current = (await usersRepository.getUserById(id))!;
  const uploads = vi.mocked(storage.storagePut).mock.calls.map(([key]) => key);
  expect(uploads).toHaveLength(2);
  for (const key of uploads) {
    if (current.image === `/files/${key}`)
      expect(storage.storageDelete).not.toHaveBeenCalledWith(key);
    else expect(storage.storageDelete).toHaveBeenCalledWith(key);
  }
});
