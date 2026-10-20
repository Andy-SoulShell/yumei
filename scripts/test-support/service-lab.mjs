/** 启动独立应用、数据库、HTTP/SMTP 夹具，可选择运行完整 HTTP 验收。 */
import process from "node:process";
import { mkdir, writeFile, cp, access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { setTimeout } from "node:timers";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import webpush from "web-push";
import { parse } from "dotenv";
import {
  ROOT,
  LAB_DIR,
  APP_ORIGIN,
  DATABASE,
  DATABASE_GRANT,
  assertLabDatabase,
  assertLabGrants,
  buildLabEnvironment,
} from "./lab-config.mjs";
import { startFixtures } from "./lab-fixtures.mjs";

const { fetch, AbortSignal } = globalThis;

/** 先拒绝占用端口，避免产品开发入口自动切换端口。 */
async function requireFreePort(port, host) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () =>
      reject(new Error(`Lab port ${port} is occupied`))
    );
    server.listen(port, host, resolve);
  });
  await new Promise(resolve => server.close(resolve));
}

/** 只创建固定 lab 数据库并应用已有迁移；没有 DROP、TRUNCATE 或共享库写入。 */
export async function prepareDatabase(env) {
  const url = assertLabDatabase(env.DATABASE_URL);
  const local = parse(await readFile(path.join(ROOT, ".env.test.local")));
  if (!local.TEST_MYSQL_ROOT_PASSWORD)
    throw new Error("Test-only database bootstrap credential is required");
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: "root",
    password: local.TEST_MYSQL_ROOT_PASSWORD,
    timezone: "Z",
    connectionLimit: 2,
  });
  try {
    await pool.query(
      `CREATE DATABASE IF NOT EXISTS \`${DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await pool.query(
      "CREATE USER IF NOT EXISTS 'yumei_service_lab'@'%' IDENTIFIED BY ?",
      [decodeURIComponent(url.password)]
    );
    await pool.query("ALTER USER 'yumei_service_lab'@'%' IDENTIFIED BY ?", [
      decodeURIComponent(url.password),
    ]);
    await pool.query(
      "REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'yumei_service_lab'@'%'"
    );
    await pool.query(
      `GRANT ALL PRIVILEGES ON \`${DATABASE_GRANT}\`.* TO 'yumei_service_lab'@'%'`
    );
    const [grants] = await pool.query(
      "SHOW GRANTS FOR 'yumei_service_lab'@'%'"
    );
    assertLabGrants(grants.map(row => String(Object.values(row)[0])));
  } finally {
    await pool.end();
  }
  const lab = createPool({ uri: url.href, timezone: "Z", connectionLimit: 2 });
  try {
    await migrate(drizzle(lab), {
      migrationsFolder: path.join(ROOT, "drizzle"),
    });
  } finally {
    await lab.end();
  }
}

async function main() {
  await Promise.all([
    requireFreePort(3100, "127.0.0.2"),
    requireFreePort(3299, "127.0.0.1"),
    requireFreePort(3298, "127.0.0.1"),
  ]);
  await mkdir(LAB_DIR, { recursive: true });
  const env = await buildLabEnvironment(webpush.generateVAPIDKeys());
  await writeFile(
    path.join(LAB_DIR, "empty.env"),
    "# Intentionally empty: never load the application .env\n"
  );
  await prepareDatabase(env);
  const publicSource = path.join(ROOT, "dist", "public");
  await access(path.join(publicSource, "index.html"));
  const output = path.join(LAB_DIR, "server");
  await mkdir(output, { recursive: true });
  await cp(publicSource, path.join(output, "public"), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, "server/_core/index.ts")],
    outfile: path.join(output, "index.mjs"),
    platform: "node",
    packages: "external",
    bundle: true,
    format: "esm",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "silent",
  });
  const fixture = await startFixtures();
  const child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(path.join(ROOT, "scripts/test-support/lab-preload.mjs"))
        .href,
      path.join(output, "index.mjs"),
    ],
    { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  );
  let logs = "";
  const collect = chunk => {
    logs += chunk.toString();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  let stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    child.kill();
    await fixture.close();
    await writeFile(path.join(LAB_DIR, "application.log"), logs);
  };
  process.on("SIGTERM", () => {
    void close().finally(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    void close().finally(() => process.exit(0));
  });
  try {
    const deadline = Date.now() + 45000;
    while (true) {
      if (child.exitCode !== null)
        throw new Error(
          `Isolated application exited (${child.exitCode}); inspect tmp/service-lab/application.log`
        );
      try {
        if (
          (
            await fetch(`${APP_ORIGIN}/readyz`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          break;
      } catch {
        /* 启动阶段尚未监听。 */
      }
      if (Date.now() > deadline)
        throw new Error("Lab application readiness timed out");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    process.stdout.write(
      `SIMULATED service lab ready: ${APP_ORIGIN}; database=${DATABASE}; HTTP fixture=3299; SMTP sink=3298\n`
    );
    if (process.argv.includes("--smoke")) {
      const { runLiveSmoke } = await import("./service-lab-smoke.mjs");
      const report = await runLiveSmoke({
        env,
        fixture,
        getApplicationLogs: () => logs,
      });
      await writeFile(
        path.join(LAB_DIR, "report.json"),
        JSON.stringify(report, null, 2) + "\n"
      );
      await rm(path.join(LAB_DIR, "failure-stack.txt"), { force: true });
      process.stdout.write(
        `Lab HTTP acceptance passed: ${report.checks.length} checks. Report: tmp/service-lab/report.json\n`
      );
    }
    await writeFile(path.join(LAB_DIR, "application.log"), logs);
    if (process.argv.includes("--keep") || !process.argv.includes("--smoke")) {
      process.stdout.write(
        "Lab remains running for a separate browser session; Ctrl+C closes it.\n"
      );
      await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
    }
  } finally {
    await close();
  }
}

main().catch(error => {
  // 驱动错误可能含连接信息，仅输出错误代码或我们自己构造的脱敏说明。
  process.stderr.write(`Service lab failed: ${error.code || error.message}\n`);
  void writeFile(
    path.join(LAB_DIR, "failure-stack.txt"),
    error.stack || String(error.code)
  );
  process.exitCode = 1;
});
