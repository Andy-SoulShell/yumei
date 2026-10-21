/** 业务配置的初始化、并发编辑和统一发布；业务事务内固定使用一次读取的快照。 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { discoveryContent, productConfiguration } from "../../drizzle/schema";
import {
  productConfigSchema,
  type ProductConfig,
} from "../../shared/productConfig";
import { getDb, type DbTransaction } from "../database";
import { initialProductConfig } from "../seeds/product";
import { validateOfficialCharacterFields } from "./officialCompatibility";

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

async function read(
  connection: DbTransaction | Awaited<ReturnType<typeof database>>
) {
  let [row] = await connection
    .select()
    .from(productConfiguration)
    .where(eq(productConfiguration.id, "main"));
  if (!row) {
    const config = initialProductConfig();
    // 初始化独立提交，业务事务中的后续读取不会被自身未提交的种子行阻塞。
    await (
      await database()
    )
      .insert(productConfiguration)
      .values({ id: "main", draft: config, published: config })
      .onDuplicateKeyUpdate({ set: { id: "main" } });
    [row] = await connection
      .select()
      .from(productConfiguration)
      .where(eq(productConfiguration.id, "main"));
  }
  return row;
}

/** 新库首次插入现有规则，重复启动不覆盖已保存草稿或发布内容。 */
export async function initializeProductConfig() {
  await read(await database());
}

type Published = ProductConfig & { revision: number; publishedAt: Date };
const transactionSnapshots = new WeakMap<DbTransaction, Promise<Published>>();

/** 无事务时读取当前发布配置；同一事务多次调用始终获得同一份快照。 */
export async function getPublishedProductConfig(
  tx?: DbTransaction
): Promise<Published> {
  const work = async () => {
    const state = await read(tx ?? (await database()));
    return {
      ...state.published,
      revision: state.publishedRevision,
      publishedAt: state.publishedAt,
    };
  };
  if (!tx) return work();
  let pending = transactionSnapshots.get(tx);
  if (!pending) {
    pending = work();
    transactionSnapshots.set(tx, pending);
  }
  return pending;
}

/** 管理员读取完整草稿及当前发布令牌。 */
export async function getProductConfigDraft() {
  const row = await read(await database());
  return {
    config: row.draft,
    revision: row.revision,
    publishedRevision: row.publishedRevision,
    publishedAt: row.publishedAt,
  };
}

/** 保存完整草稿或发布当前草稿，跨领域校验失败不会影响上一发布内容。 */
export async function editProductConfig(
  userId: string,
  revision: number,
  config?: ProductConfig
) {
  const db = await database();
  await read(db);
  return db.transaction(async tx => {
    const [state] = await tx
      .select()
      .from(productConfiguration)
      .where(eq(productConfiguration.id, "main"))
      .for("update");
    if (state.revision !== revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "业务配置已被修改，请重新读取草稿",
      });
    const next = productConfigSchema.safeParse(config ?? state.draft);
    if (!next.success)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: next.error.issues.map(issue => issue.message).join("；"),
      });
    if (!config) {
      // 两套发布都先锁业务配置、再锁官方内容，校验与发布不能交错。
      const [content] = await tx
        .select({ published: discoveryContent.published })
        .from(discoveryContent)
        .where(eq(discoveryContent.id, "home"))
        .for("update");
      if (content?.published)
        validateOfficialCharacterFields(
          content.published.characters,
          next.data.characters
        );
    }
    await tx
      .update(productConfiguration)
      .set(
        config
          ? { draft: next.data, revision: revision + 1, updatedBy: userId }
          : {
              published: next.data,
              publishedRevision: revision + 1,
              publishedAt: new Date(),
              revision: revision + 1,
              updatedBy: userId,
            }
      )
      .where(eq(productConfiguration.id, "main"));
    return { revision: revision + 1, published: !config };
  });
}
