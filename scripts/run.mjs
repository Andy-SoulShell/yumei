/** 跨平台开发、构建和启动入口，不依赖 shell 的环境变量与转义语法。 */
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
process.env.NODE_ENV = command === "dev" ? "development" : "production";
if (command === "build") {
  const { build: buildClient } = await import("vite");
  const { build: buildServer } = await import("esbuild");
  await buildClient();
  await buildServer({
    entryPoints: ["server/_core/index.ts"],
    platform: "node",
    packages: "external",
    bundle: true,
    format: "esm",
    outdir: "dist",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "info",
  });
} else if (command === "dev" || command === "start") {
  const args =
    command === "dev"
      ? [
          fileURLToPath(
            new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)
          ),
          "watch",
          "server/_core/index.ts",
        ]
      : ["dist/index.js"];
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
  child.on("exit", code => {
    process.exitCode = code ?? 1;
  });
  process.on("SIGTERM", () => child.kill("SIGTERM"));
} else {
  throw new Error("Expected dev, build or start");
}
