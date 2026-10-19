/** 完整测试启动前确认独立测试库可用且迁移与当前代码完全一致。 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createUtcMysqlPool } from "./_core/mysql";

/** 拒绝缺失、生产命名或未完成迁移的数据库，避免集成测试静默通过或污染应用数据。 */
export default async function setup() {
  const uri = process.env.DATABASE_URL;
  if (!uri)
    throw new Error(
      "DATABASE_URL required: provide a migrated, dedicated MySQL test database"
    );
  const databaseName = decodeURIComponent(new URL(uri).pathname.slice(1));
  if (!databaseName.toLowerCase().includes("test"))
    throw new Error(
      "Database name must contain 'test'; application databases are forbidden for tests"
    );
  const pool = createUtcMysqlPool(uri);
  try {
    await pool.query("SELECT 1");
    const [rows] = await pool.query("SELECT hash FROM __drizzle_migrations");
    const hashes = new Set((rows as { hash: string }[]).map(row => row.hash));
    const journal = JSON.parse(
      await readFile(
        new URL("../drizzle/meta/_journal.json", import.meta.url),
        "utf8"
      )
    ) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      const sql = await readFile(
        new URL(`../drizzle/${tag}.sql`, import.meta.url)
      );
      if (!hashes.has(createHash("sha256").update(sql).digest("hex")))
        throw new Error(
          `Test database migration mismatch: ${tag}; run pnpm db:migrate on the test database`
        );
    }
  } finally {
    await pool.end();
  }
}
