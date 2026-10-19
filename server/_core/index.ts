import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import { sql } from "drizzle-orm";
import { csrfCookieMiddleware, csrfVerifyMiddleware } from "./csrf";
import { auth } from "./auth";
import { registerBillingRoutes } from "../billing";
import { startProactivePushScheduler } from "../push";
import { registerFileRoutes } from "./files";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { getOperatorChatProvider } from "./chatProvider";
import { getDb } from "../db";
import { serveStatic } from "./static";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Boot self-checks (M1-5). Fail fast on broken config instead of
 * "starting" into a state where every request errors.
 */
async function runBootChecks() {
  // 1. Database reachable + migrations applied (production applies them
  //    automatically so `docker compose up` works on a fresh volume).
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

  // 2. Storage writable (local driver only; S3 config is env-validated).
  if (ENV.storageDriver === "local") {
    const probe = path.join(ENV.storageLocalDir, ".boot-probe");
    await mkdir(ENV.storageLocalDir, { recursive: true });
    await writeFile(probe, String(Date.now()));
    await rm(probe, { force: true });
  }

  // 3. Operator AI keys. Chat is the core loop, so a missing chat
  //    key gets a loud warning (BYOK-only self-hosts are still valid, so
  //    this is not fatal). Selfies degrade gracefully in the UI.
  const chatProvider = getOperatorChatProvider();
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

async function startServer() {
  await runBootChecks();

  const app = express();
  const server = createServer(app);
  // Billing webhook mounts BEFORE the JSON parser — Lemon Squeezy
  // signature verification needs the raw request bytes (M3).
  registerBillingRoutes(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Health probes (M1-5): /healthz is liveness (always cheap 200),
  // /readyz pings the DB so orchestrators can gate traffic on it.
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

  // CSRF: set the double-submit cookie on every request — must run before
  // any state-changing handler. See server/_core/csrf.ts (issue #8).
  app.use(csrfCookieMiddleware);
  // Better-Auth handles /api/auth/* (magic-link, session, etc.).
  // Mounted before tRPC so auth endpoints are not behind CSRF verify.
  if (auth) {
    app.all("/api/auth/*", toNodeHandler(auth.handler));
  }
  // Stored file reads (local stream / S3 presigned redirect). See M1-2.
  registerFileRoutes(app);
  // tRPC API — verify CSRF token on every state-changing request.
  app.use(
    "/api/trpc",
    csrfVerifyMiddleware,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
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
      // issue #25: silently drifting off $PORT in production means the
      // load balancer routes traffic into the void. Fail loudly instead.
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

  // M4-4: hourly proactive-message push (no-op without VAPID keys).
  startProactivePushScheduler();

  // Graceful shutdown: stop accepting connections, drain, exit.
  const shutdown = (signal: string) => {
    console.log(`[boot] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    // Hard exit if draining takes too long (e.g. hung upstream call).
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  console.error("[boot] fatal:", error);
  process.exit(1);
});
