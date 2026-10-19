/** Load only the dedicated test configuration; never load application secrets. */
import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { parse } from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
const localPath = path.join(root, ".env.test.local");
const local = existsSync(localPath) ? parse(readFileSync(localPath)) : {};
const env = { ...local, ...process.env, NODE_ENV: "test" };
env.TZ ??= "UTC";

try {
  if (!env.DATABASE_URL)
    throw new Error(
      "Configure .env.test.local or set DATABASE_URL to a dedicated test database."
    );
  const testUrl = new URL(env.DATABASE_URL);
  const database = decodeURIComponent(testUrl.pathname.slice(1));
  if (!database.toLowerCase().includes("test"))
    throw new Error(
      "Test database name must contain 'test'; application databases are forbidden."
    );
  const appPath = path.join(root, ".env");
  const appUri = existsSync(appPath)
    ? parse(readFileSync(appPath)).DATABASE_URL
    : undefined;
  if (appUri) {
    const appUrl = new URL(appUri);
    if (
      testUrl.hostname === appUrl.hostname &&
      (testUrl.port || "3306") === (appUrl.port || "3306") &&
      testUrl.pathname === appUrl.pathname
    )
      throw new Error(
        "The test database must be separate from the configured application database."
      );
  }
  const args = process.argv.slice(2);
  if (args[0] === "--migrate") {
    const { createPool } = await import("mysql2/promise");
    const { drizzle } = await import("drizzle-orm/mysql2");
    const { migrate } = await import("drizzle-orm/mysql2/migrator");
    const pool = createPool({
      uri: env.DATABASE_URL,
      timezone: "Z",
      connectionLimit: 2,
    });
    try {
      await migrate(drizzle(pool), {
        migrationsFolder: path.join(root, "drizzle"),
      });
      process.stdout.write(`Test database migrated: ${database}\n`);
    } finally {
      await pool.end();
    }
  } else {
    const child = spawn(
      process.execPath,
      [path.join(root, "node_modules/vitest/vitest.mjs"), "run", ...args],
      { cwd: root, env, stdio: "inherit" }
    );
    child.on("error", error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
    child.on("exit", code => {
      process.exitCode = code ?? 1;
    });
  }
} catch (error) {
  // MySQL messages can contain addresses and user names; never print connection URLs.
  process.stderr.write(
    `${error.code ? `Test database operation failed (${error.code})` : error.message}\n`
  );
  process.exitCode = 1;
}
