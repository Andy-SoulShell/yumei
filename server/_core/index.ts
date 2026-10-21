import { uploadBodyParser } from "./uploads";
/** 应用启动入口，负责配置、迁移、健康探针、中间件顺序和优雅退出。 */

import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import "dotenv/config";
import { sql } from "drizzle-orm";
import express from "express";
import { createServer } from "http";
import net from "net";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { registerBillingRoutes } from "../billing";
import { getDb } from "../database";
import { startMediaCleanupScheduler } from "../mediaCleanup";
import { startProactiveScheduler } from "../proactive";
import { appRouter } from "../routers";
import { auth } from "./auth";
import { getOperatorChatProvider } from "./chatProvider";
import { registerChatStreamRoutes } from "./chatStreamRoutes";
import { startChatTurnScheduler } from "../chatStreaming";
import { createContext } from "./context";
import { csrfCookieMiddleware, csrfVerifyMiddleware } from "./csrf";
import { ENV } from "./env";
import { registerFileRoutes } from "./files";
import { serveStatic } from "./static";
import { initializeDiscovery } from "../repositories/discovery";
import { initializeProductConfig } from "../repositories/productConfig";

/** 通过临时绑定检测目标 TCP 端口是否可用。 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

/** 开发环境从指定端口起查找可用端口，达到搜索边界后抛出错误。 */
async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/** 验证数据库连接及本地存储写入，生产启动时自动应用已有迁移。 */
async function runBootChecks() {
  // 生产自动应用迁移，使新数据卷可直接启动。
  const db = await getDb();
  if (!db) {
    throw new Error(
      "DATABASE_URL is not configured or the database is unreachable."
    );
  }
  if (ENV.isProduction || process.env.MIGRATE_ON_BOOT === "1") {
    const { migrate } = await import("drizzle-orm/mysql2/migrator");
    await migrate(db, { migrationsFolder: path.resolve("drizzle") });
    console.log("[boot] database migrations applied");
  }
  await db.execute(sql`SELECT 1`);
  await initializeDiscovery();
  await initializeProductConfig();

  // 本地存储执行写入探针；S3 此处仅有启动配置校验。
  if (ENV.storageDriver === "local") {
    const probe = path.join(ENV.storageLocalDir, ".boot-probe");
    await mkdir(ENV.storageLocalDir, { recursive: true });
    await writeFile(probe, String(Date.now()));
    await rm(probe, { force: true });
  }

  // 缺少运营方密钥时告警，仍允许仅使用 BYOK 的自托管部署启动。
  const chatProvider = await getOperatorChatProvider();
  if (!chatProvider.apiKey) {
    console.warn(
      `[boot] WARNING: ${chatProvider.name === "deepseek" ? "OPERATOR_DEEPSEEK_KEY" : "OPERATOR_OPENROUTER_KEY"} is not set — chat only works for users who bring their own OpenRouter key in Settings.`
    );
  }
  if (
    process.env.IMAGE_PROVIDER !== "comfyui" &&
    !process.env.OPERATOR_FAL_KEY
  ) {
    console.warn(
      "[boot] WARNING: OPERATOR_FAL_KEY is not set — selfie generation only works for BYOK users."
    );
  }
}

/**
 * 按顺序装配 Express、认证、文件路由与 tRPC，并监听端口。
 *
 * @remarks 生产端口占用时直接失败；开发模式可选择后续可用端口。
 */
async function startServer() {
  await runBootChecks();

  const app = express();
  const server = createServer(app);
  // 支付签名校验依赖原始字节，必须先于 JSON 解析器注册。
  registerBillingRoutes(app);
  // 上传包含编码后的媒体内容，因此将请求体上限设为 50 MB。
  app.use(uploadBodyParser());

  // healthz 检查进程存活；readyz 额外检查数据库，供流量调度使用。
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/readyz", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("no db");
      await db.execute(sql`SELECT 1`);
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: "database unreachable" });
    }
  });

  // 在业务写请求处理前设置双提交 CSRF Cookie。
  app.use(csrfCookieMiddleware);
  // 认证路由由 Better-Auth 自行校验来源，先于 tRPC 的 CSRF 校验挂载。
  if (auth) {
    app.all("/api/auth/*", toNodeHandler(auth.handler));
  }
  // 媒体读取：本地文件流或 S3 预签名跳转。
  registerFileRoutes(app);
  registerChatStreamRoutes(app);
  // tRPC 的写请求必须通过 CSRF 令牌校验。
  app.use(
    "/api/trpc",
    csrfVerifyMiddleware,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // 开发使用 Vite 中间件，其他环境返回已构建的静态文件。
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  let port = preferredPort;
  if (!(await isPortAvailable(preferredPort))) {
    if (ENV.isProduction) {
      // 生产端口由入口代理约定，占用时应失败，避免服务与代理端口错位。
      throw new Error(
        `Port ${preferredPort} is already in use. Refusing to auto-shift ports in production.`
      );
    }
    port = await findAvailablePort(preferredPort);
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // 先规划显式同意的站内联系，再恢复持久投递；无需依赖设备是否订阅推送。
  const stopPush = startProactiveScheduler();
  const stopMediaCleanup = startMediaCleanupScheduler();
  const stopChatTurns = startChatTurnScheduler();

  // 收到退出信号后停止接收新连接，等待现有连接处理完毕。
  const shutdown = (signal: string) => {
    console.log(`[boot] ${signal} received, shutting down`);
    stopMediaCleanup();
    stopPush();
    stopChatTurns();
    server.close(() => process.exit(0));
    // 最多等待十秒，避免挂起的上游请求阻止退出。
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  console.error("[boot] fatal:", error);
  process.exit(1);
});
