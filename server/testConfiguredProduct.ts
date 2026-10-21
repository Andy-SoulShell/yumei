/** 测试通过真实管理 API 发布配置，回滚隔离不会污染其他工作进程。 */
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { productConfiguration } from "../drizzle/schema";
import type { ProductConfig } from "../shared/productConfig";
import * as database from "./database";
import * as repository from "./repositories/productConfig";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";
/** 配置单独回滚，业务使用真实提交和用户锁；其他测试进程看不到这里的发布。 */
export async function configured(
  work: (context: {
    userId: string;
    admin: ReturnType<typeof appRouter.createCaller>;
    publish: (config: ProductConfig) => Promise<void>;
  }) => Promise<void>
) {
  const db = (await database.getDb())!;
  const userId = await createTestUser();
  const admin = appRouter.createCaller({
    user: { id: userId, role: "admin", birthDate: new Date("1990-01-01") },
    req: {},
    res: {},
  } as never);
  const rollback = new Error("rollback isolated AI configuration");
  try {
    await db.transaction(
      async tx => {
        const published = vi
          .spyOn(repository, "getPublishedProductConfig")
          .mockImplementation(async () => {
            const [row] = await tx
              .select()
              .from(productConfiguration)
              .where(eq(productConfiguration.id, "main"));
            return {
              ...row.published,
              revision: row.publishedRevision,
              publishedAt: row.publishedAt,
            };
          });
        const publish = async (config: ProductConfig) => {
          const connection = vi
            .spyOn(database, "getDb")
            .mockResolvedValue(tx as never);
          try {
            const draft = await admin.productConfig.admin.getDraft();
            const saved = await admin.productConfig.admin.save({
              expectedRevision: draft.revision,
              config,
            });
            await admin.productConfig.admin.publish({
              expectedRevision: saved.revision,
            });
          } finally {
            connection.mockRestore();
          }
        };
        try {
          await work({ userId, admin, publish });
        } finally {
          published.mockRestore();
        }
        throw rollback;
      },
      { isolationLevel: "read committed" }
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
