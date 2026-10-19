/** 相册读取通过真实路由和数据库验证账号、角色及软删除边界。 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createTestGirlfriend } from "./testFixtures";
import { createSelfie, getGirlfriendSelfies, softDeleteGirlfriend } from "./db";
import type { TrpcContext } from "./_core/context";

describe("album ownership", () => {
  it("returns only the owner's photos and rejects foreign, missing and deleted roles", async () => {
    const userId = `album-${crypto.randomUUID()}`;
    const foreignId = `album-other-${crypto.randomUUID()}`;
    const create = (owner: string) =>
      createTestGirlfriend({
        userId: owner,
        name: "Test",
        personality: "Test",
        appearance: "Test",
        referenceImageKey: "test-album-ref",
        referenceImageUrl: "https://example.test/ref",
      });
    const own = await create(userId);
    const foreign = await create(foreignId);
    const photo = await createSelfie({
      userId,
      girlfriendId: own.id,
      imageKey: "test-album-photo",
      imageUrl: "https://example.test/photo",
      prompt: "private",
      userContext: "private",
      mode: "direct",
    });
    const caller = appRouter.createCaller({
      user: { id: userId },
      req: {},
      res: {},
    } as TrpcContext);
    expect(
      await caller.selfie.listByGirlfriend({ girlfriendId: own.id })
    ).toEqual([photo]);
    await expect(
      caller.selfie.listByGirlfriend({ girlfriendId: foreign.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getGirlfriendSelfies(own.id, foreignId)).rejects.toMatchObject(
      { code: "NOT_FOUND" }
    );
    await expect(
      caller.selfie.listByGirlfriend({ girlfriendId: -1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await softDeleteGirlfriend(own.id, userId);
    await expect(
      caller.selfie.listByGirlfriend({ girlfriendId: own.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
