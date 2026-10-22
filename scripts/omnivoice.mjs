/** Independent Python environment for the optional local TTS service. */
import { spawn } from "node:child_process";
import process from "node:process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { config } from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: path.join(root, ".env"), quiet: true });
const runtime = path.join(root, "data", "omnivoice");
const venv = path.join(runtime, "venv");
const python =
  process.env.OMNIVOICE_PYTHON ||
  path.join(
    venv,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
  );
process.env.UV_CACHE_DIR ??= path.join(runtime, "uv-cache");
process.env.HF_HOME ??= path.join(runtime, "huggingface");

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", code =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`))
    );
  });
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "install") {
    if (!existsSync(python))
      await run("uv", ["venv", "--python", "3.12", venv]);
    await run("uv", [
      "pip",
      "install",
      "--python",
      python,
      "torch==2.8.0",
      "torchaudio==2.8.0",
      "--index-url",
      `https://download.pytorch.org/whl/${args.includes("--cpu") ? "cpu" : "cu128"}`,
    ]);
    await run("uv", [
      "pip",
      "install",
      "--python",
      python,
      "-r",
      "services/omnivoice/requirements.txt",
    ]);
  } else if (command === "download") {
    if (!existsSync(python))
      throw new Error(
        "Run pnpm omnivoice:install first, or set OMNIVOICE_PYTHON."
      );
    await run(python, ["scripts/download-omnivoice.py", ...args]);
  } else if (command === "start") {
    if (!existsSync(python))
      throw new Error(
        "Run pnpm omnivoice:install first (requires uv and Python 3.12)."
      );
    await run(python, ["services/omnivoice/serve.py", ...args]);
  } else {
    throw new Error(
      "Expected install [--cpu], download [--direct], or start [--host HOST] [--port PORT]"
    );
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
