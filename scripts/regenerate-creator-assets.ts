/** 使用 YUMEI 自身的 ComfyUI 工作流生成整套选项图，逐张落盘，可断点续跑。 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { ComfyUIClient } from "../server/_core/comfyui";
import { creatorAssetJobs } from "./creator-asset-prompts";

const root = path.resolve("output/creator/generated-v2");
const rawRoot = path.join(root, "raw");
const manifestPath = path.join(root, "manifest.json");
type Job = ReturnType<typeof creatorAssetJobs>[number] & {
  status: "pending" | "generating" | "generated" | "failed";
  attempts: number;
  hash?: string;
  bytes?: number;
  error?: string;
  durationMs?: number;
};
await mkdir(rawRoot, { recursive: true });
let previous: { jobs: Job[] } | undefined;
try {
  previous = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const jobs: Job[] = creatorAssetJobs().map(job => {
  const old = previous?.jobs.find(
    item =>
      item.id === job.id && item.prompt === job.prompt && item.seed === job.seed
  );
  return {
    ...job,
    status: old?.status === "generated" ? "generated" : "pending",
    attempts: old?.attempts ?? 0,
    hash: old?.hash,
    bytes: old?.bytes,
    durationMs: old?.durationMs,
  };
});
for (const job of jobs) {
  if (job.status !== "generated") continue;
  try {
    const image = await readFile(
      path.join(rawRoot, job.source.replace(/\.webp$/, ".png"))
    );
    if (createHash("sha256").update(image).digest("hex") === job.hash) continue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  job.status = "pending";
  delete job.hash;
  delete job.bytes;
  delete job.durationMs;
}
const save = async () => {
  await writeFile(
    manifestPath + ".pending",
    JSON.stringify(
      {
        version: 2,
        provider: "yumei-comfyui",
        width: 512,
        height: 800,
        updatedAt: new Date().toISOString(),
        jobs,
      },
      null,
      2
    ) + "\n"
  );
  await rename(manifestPath + ".pending", manifestPath);
};
const workflowRoot = path.join(root, "workflows");
await mkdir(workflowRoot, { recursive: true });
for (const mode of ["text", "edit"]) {
  const workflow = JSON.parse(
    await readFile(`workflows/comfyui/qwen-image-${mode}.json`, "utf8")
  );
  const resize =
    mode === "text" ? workflow["459:456"] : workflow.reference_resize;
  resize.inputs.width = 512;
  resize.inputs.height = 800;
  await writeFile(
    path.join(workflowRoot, `qwen-image-${mode}.json`),
    JSON.stringify(workflow)
  );
}
process.env.COMFYUI_WORKFLOW_DIR = workflowRoot;
await save();
if (process.argv.includes("--prepare")) {
  console.log(`Prepared ${jobs.length} asset prompts.`);
  process.exit(0);
}
if (process.env.IMAGE_PROVIDER !== "comfyui" || !process.env.COMFYUI_BASE_URL)
  throw new Error(
    "This asset job requires the configured YUMEI ComfyUI provider."
  );
const client = new ComfyUIClient({
  baseUrl: process.env.COMFYUI_BASE_URL,
  apiKey: process.env.COMFYUI_API_KEY || undefined,
  timeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS || 600000),
});
const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : Infinity;
const onlyFlag = process.argv.indexOf("--only");
const only = onlyFlag >= 0 ? process.argv[onlyFlag + 1].split(",") : [];
let produced = 0;
for (const job of jobs) {
  if (job.status === "generated") continue;
  if (only.length && !only.some(prefix => job.id.startsWith(prefix))) continue;
  if (produced >= limit) break;
  job.status = "generating";
  job.attempts++;
  await save();
  console.log(
    `START ${jobs.filter(item => item.status === "generated").length + 1}/${jobs.length} ${job.id}`
  );
  const started = Date.now();
  try {
    const image = await client.generate({
      mode: "text",
      prompt: job.prompt,
      seed: job.seed,
    });
    const output = path.join(rawRoot, job.source.replace(/\.webp$/, ".png"));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, image);
    job.hash = createHash("sha256").update(image).digest("hex");
    job.bytes = image.length;
    job.durationMs = Date.now() - started;
    job.status = "generated";
    delete job.error;
    console.log(
      `DONE ${jobs.filter(item => item.status === "generated").length}/${jobs.length} ${job.id} ${Math.round(job.durationMs / 1000)}s`
    );
    produced++;
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Generation failed";
    console.error(`FAILED ${job.id}: ${job.error}`);
    await save();
    process.exitCode = 1;
    break;
  }
  await save();
}
console.log(
  `Generated ${jobs.filter(job => job.status === "generated").length}/${jobs.length} images.`
);
