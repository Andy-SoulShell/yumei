/** 官方内容的初始化、草稿编辑与原子发布；公开请求只读取已发布快照。 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  discoveryContent,
  officialCharacters,
  productConfiguration,
} from "../../drizzle/schema";
import {
  discoverySnapshotSchema,
  type OfficialCharacter,
  type Homepage,
} from "../../shared/discovery";
import { getDb, type DbTransaction } from "../database";
import { initialDiscovery } from "../seeds/discovery";
import { readOfficialImage } from "../characterPresets";
import type { ProductConfig } from "../../shared/productConfig";
import { initializeProductConfig } from "./productConfig";
import { validateOfficialCharacterFields } from "./officialCompatibility";

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/** 首次启动幂等导入初始数据，后续启动不覆盖运营内容。 */
export async function initializeDiscovery() {
  const db = await database();
  const [existing] = await db
    .select()
    .from(discoveryContent)
    .where(eq(discoveryContent.id, "home"));
  if (existing?.published) return;
  const seed = initialDiscovery();
  await db.transaction(async tx => {
    await tx
      .insert(discoveryContent)
      .values({ id: "home", draft: seed.home })
      .onDuplicateKeyUpdate({ set: { id: "home" } });
    const [state] = await tx
      .select()
      .from(discoveryContent)
      .where(eq(discoveryContent.id, "home"))
      .for("update");
    if (state.published) return;
    for (const character of seed.characters) {
      await tx
        .insert(officialCharacters)
        .values({ id: character.id, data: character });
    }
    await tx
      .update(discoveryContent)
      .set({ published: seed, publishedAt: new Date() })
      .where(eq(discoveryContent.id, "home"));
  });
}

/** 返回一次完整发布的数据及其版本，数据库故障不会回退到静态内容。 */
export async function getPublishedDiscovery() {
  await initializeDiscovery();
  const db = await database();
  const [state] = await db
    .select()
    .from(discoveryContent)
    .where(eq(discoveryContent.id, "home"));
  if (!state?.published)
    throw new Error("Discovery content is not initialized");
  return {
    ...state.published,
    revision: state.publishedRevision,
    publishedAt: state.publishedAt,
  };
}

/** 获取当前已发布的官方人设，归档且已发布下架的角色不能新建。 */
export async function getPublishedCharacter(id: string) {
  const snapshot = await getPublishedDiscovery();
  const preset = snapshot.characters.find(item => item.id === id);
  if (!preset)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "角色预设不存在或已下架",
    });
  return preset;
}

/** 管理员读取同一事务中的完整草稿，包括待发布的归档状态。 */
export async function getDiscoveryDraft() {
  await initializeDiscovery();
  const db = await database();
  return db.transaction(async tx => {
    const [state] = await tx
      .select()
      .from(discoveryContent)
      .where(eq(discoveryContent.id, "home"))
      .for("update");
    const characters = await tx.select().from(officialCharacters);
    return {
      revision: state.revision,
      publishedRevision: state.publishedRevision,
      publishedAt: state.publishedAt,
      published: state.published!,
      home: state.draft,
      characters,
    };
  });
}

async function editDraft<T>(
  revision: number,
  userId: string,
  action: (
    tx: DbTransaction,
    state: typeof discoveryContent.$inferSelect,
    configuration: ProductConfig
  ) => Promise<T>
) {
  await initializeDiscovery();
  await initializeProductConfig();
  const db = await database();
  return db.transaction(async tx => {
    // 与业务配置发布使用同一锁顺序，校验始终针对最新已发布规则。
    const [policy] = await tx
      .select({ published: productConfiguration.published })
      .from(productConfiguration)
      .where(eq(productConfiguration.id, "main"))
      .for("update");
    const [state] = await tx
      .select()
      .from(discoveryContent)
      .where(eq(discoveryContent.id, "home"))
      .for("update");
    if (state.revision !== revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "内容已被修改，请重新读取草稿",
      });
    const result = await action(tx, state, policy.published);
    await tx
      .update(discoveryContent)
      .set({ revision: revision + 1, updatedBy: userId })
      .where(eq(discoveryContent.id, "home"));
    return { revision: revision + 1, result };
  });
}

async function validateImages(images: string[]) {
  for (const image of Array.from(new Set(images)))
    await readOfficialImage(image);
}

/** 新增或完整替换一个角色草稿；ID 始终保留，重复保存可恢复归档角色。 */
export async function saveOfficialCharacter(
  userId: string,
  revision: number,
  character: OfficialCharacter
) {
  await validateImages([character.imageUrl]);
  return editDraft(revision, userId, async (tx, _state, policy) => {
    validateOfficialCharacterFields([character], policy.characters);
    await tx
      .insert(officialCharacters)
      .values({ id: character.id, data: character })
      .onDuplicateKeyUpdate({ set: { data: character, archived: false } });
    return { id: character.id };
  });
}

/** 归档草稿，不删除稳定 ID 或用户角色；正式下架在统一发布后生效。 */
export async function archiveOfficialCharacter(
  userId: string,
  revision: number,
  id: string
) {
  return editDraft(revision, userId, async tx => {
    const [item] = await tx
      .select()
      .from(officialCharacters)
      .where(eq(officialCharacters.id, id));
    if (!item)
      throw new TRPCError({ code: "NOT_FOUND", message: "角色预设不存在" });
    await tx
      .update(officialCharacters)
      .set({ archived: true })
      .where(eq(officialCharacters.id, id));
    return { id };
  });
}

/** 完整替换首页草稿；数组顺序分别控制精选、轮播和 FAQ 顺序。 */
export async function saveHomepage(
  userId: string,
  revision: number,
  home: Homepage
) {
  await validateImages(home.slides.flatMap(slide => slide.images));
  return editDraft(revision, userId, async tx => {
    await tx
      .update(discoveryContent)
      .set({ draft: home })
      .where(eq(discoveryContent.id, "home"));
    return { saved: true };
  });
}

/** 校验所有引用并一次发布角色和首页，失败时完整保留上一发布版本。 */
export async function publishDiscovery(userId: string, revision: number) {
  return editDraft(revision, userId, async (tx, state, policy) => {
    const rows = await tx
      .select()
      .from(officialCharacters)
      .where(eq(officialCharacters.archived, false));
    const parsed = discoverySnapshotSchema.safeParse({
      characters: rows
        .map(row => row.data)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      home: state.draft,
    });
    if (!parsed.success)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: parsed.error.issues.map(issue => issue.message).join("；"),
      });
    validateOfficialCharacterFields(parsed.data.characters, policy.characters);
    await validateImages([
      ...parsed.data.characters.map(item => item.imageUrl),
      ...parsed.data.home.slides.flatMap(slide => slide.images),
    ]);
    await tx
      .update(discoveryContent)
      .set({
        published: parsed.data,
        publishedRevision: revision + 1,
        publishedAt: new Date(),
      })
      .where(eq(discoveryContent.id, "home"));
    return { published: true };
  });
}
