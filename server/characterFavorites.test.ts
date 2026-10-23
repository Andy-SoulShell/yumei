/** 验证收藏的账号隔离、显式幂等写入、注销清理及个人数据导出。 */
import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { characterFavorites, users } from "../drizzle/schema";
import { getDb } from "./database";
import { createTestUser } from "./testFixtures";
import { appRouter } from "./routers";
import { getPublishedDiscovery } from "./repositories/discovery";
import { exportAccountData } from "./privacy";
const caller = (id?: string) =>
  appRouter.createCaller({ user: id ? { id } : null, req: {}, res: {} } as any);

it("stores one favorite for repeated and concurrent submissions and keeps accounts isolated", async () => {
  const a = await createTestUser(),
    b = await createTestUser();
  const preset = (await getPublishedDiscovery()).characters.find(
    role => role.listed
  )!;
  await Promise.all(
    Array.from({ length: 5 }, () =>
      caller(a).discovery.setFavorite({ id: preset.id, active: true })
    )
  );
  expect(await caller(a).discovery.favorites()).toEqual([preset.id]);
  expect(await caller(b).discovery.favorites()).toEqual([]);
  const database = (await getDb())!;
  expect(
    await database
      .select()
      .from(characterFavorites)
      .where(eq(characterFavorites.userId, a))
  ).toHaveLength(1);
  await caller(a).discovery.setFavorite({ id: preset.id, active: false });
  await caller(a).discovery.setFavorite({ id: preset.id, active: false });
  expect(await caller(a).discovery.favorites()).toEqual([]);
});
it("rejects anonymous writes and unknown roles without creating collection entries", async () => {
  const id = await createTestUser();
  await expect(caller().discovery.favorites()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await expect(
    caller().discovery.setFavorite({ id: "rin", active: true })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    caller(id).discovery.setFavorite({
      id: "not-a-published-role",
      active: true,
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await caller(id).discovery.favorites()).toEqual([]);
});
it("includes private favorites in exports and cascades account deletion", async () => {
  const id = await createTestUser();
  const preset = (await getPublishedDiscovery()).characters.find(
    role => role.listed
  )!;
  await caller(id).discovery.setFavorite({ id: preset.id, active: true });
  expect(
    (await exportAccountData(id)).characterFavorites.map(row => row.presetId)
  ).toEqual([preset.id]);
  const database = (await getDb())!;
  await database.delete(users).where(eq(users.id, id));
  expect(
    await database
      .select()
      .from(characterFavorites)
      .where(eq(characterFavorites.userId, id))
  ).toEqual([]);
});
