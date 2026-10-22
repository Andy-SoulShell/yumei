/** 视频工作流绑定、运行边界和持久任务快照；所有业务数值由发布配置提供。 */
import { z } from "zod";

const binding = z
  .object({ node: z.string().min(1), input: z.string().min(1) })
  .strict();
const positive = (max: number) => z.number().int().positive().max(max);
export const videoWorkflowSchema = z
  .object({
    id: z.string().min(1).max(200),
    nodes: z.record(
      z.string().min(1),
      z
        .object({
          class_type: z.string().min(1),
          inputs: z.record(z.string(), z.json()),
          _meta: z.record(z.string(), z.json()).optional(),
        })
        .strict()
    ),
    prompt: binding,
    seed: binding,
    frames: binding,
    fps: binding,
    reference: binding.nullable(),
    outputNode: z.string().min(1),
    frameMultiple: positive(1000),
    frameRemainder: z.number().int().min(0).max(999),
    minFrames: positive(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Object.keys(value.nodes).length < 1 ||
      Object.keys(value.nodes).length > 200 ||
      JSON.stringify(value.nodes).length > 200000
    )
      ctx.addIssue({
        code: "custom",
        message: "视频工作流需要 1–200 个节点，且不能超过 200000 字符",
      });
    for (const [name, item] of Object.entries({
      prompt: value.prompt,
      seed: value.seed,
      frames: value.frames,
      fps: value.fps,
      reference: value.reference,
    })) {
      if (item && !(item.input in (value.nodes[item.node]?.inputs ?? {})))
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `视频工作流缺少绑定输入 ${item.node}.${item.input}`,
        });
    }
    if (
      !value.nodes[value.outputNode] ||
      value.nodes[value.outputNode].class_type !== "SaveVideo"
    )
      ctx.addIssue({
        code: "custom",
        path: ["outputNode"],
        message: "视频输出必须绑定 SaveVideo 节点",
      });
    const fps = value.nodes[value.fps.node]?.inputs[value.fps.input];
    if (typeof fps !== "number" || fps <= 0 || fps > 120)
      ctx.addIssue({
        code: "custom",
        path: ["fps"],
        message: "视频帧率必须是 0–120 之间的数值",
      });
    if (value.frameRemainder >= value.frameMultiple)
      ctx.addIssue({
        code: "custom",
        path: ["frameRemainder"],
        message: "帧数余数必须小于帧数倍数",
      });
  });
export type VideoWorkflow = z.infer<typeof videoWorkflowSchema>;

export const videoRuntimeSchema = z
  .object({
    timeoutMs: positive(3600000),
    requestTimeoutMs: positive(120000),
    downloadTimeoutMs: positive(300000),
    pollMs: positive(30000),
    schedulerMs: positive(60000),
    leaseMs: positive(600000),
    localConcurrency: positive(16),
    userConcurrency: positive(10),
    batchSize: positive(100),
    maxVideoBytes: positive(512 * 1024 * 1024),
    maxPromptChars: positive(8000),
    minDurationSeconds: z.number().positive().max(60),
    maxDurationSeconds: z.number().positive().max(60),
    defaultDurationSeconds: z.number().positive().max(60),
    dailyLimit: z.number().int().min(0).max(100000).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.minDurationSeconds > value.defaultDurationSeconds ||
      value.defaultDurationSeconds > value.maxDurationSeconds
    )
      ctx.addIssue({
        code: "custom",
        message: "默认视频时长必须位于最小与最大时长之间",
      });
    if (
      value.leaseMs <=
      Math.max(value.requestTimeoutMs, value.downloadTimeoutMs) +
        value.schedulerMs
    )
      ctx.addIssue({
        code: "custom",
        message: "视频租约必须大于单次网络请求与调度间隔之和",
      });
    if (value.timeoutMs <= value.leaseMs)
      ctx.addIssue({ code: "custom", message: "视频总时限必须大于执行租约" });
  });
export type VideoRuntime = z.infer<typeof videoRuntimeSchema>;
export const videoInputSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    conversationId: z.number().int().positive(),
    mode: z.enum(["text", "reference"]),
    prompt: z.string().trim().min(1).max(8000),
    durationSeconds: z.number().positive().max(60),
    referenceMessageId: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "text" && value.referenceMessageId !== null)
      ctx.addIssue({ code: "custom", message: "文生视频不接受首帧图片" });
  });
export type VideoInput = z.infer<typeof videoInputSchema>;
/** 路由、工作流和参数在接收时固定；不保存服务端凭据。 */
export type VideoTask = {
  input: VideoInput;
  baseUrl: string;
  workflow: VideoWorkflow;
  runtime: VideoRuntime;
  referenceKey: string | null;
  phase: "queued" | "submitting" | "running" | "saving";
  submittedAt?: number;
  promptId?: string;
  frames: number;
  fps: number;
  output?: {
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
    sizeBytes: number;
  };
};

/** 向上对齐工作流允许的帧数，返回成片的实际时长。 */
export function videoTiming(workflow: VideoWorkflow, durationSeconds: number) {
  const fps = workflow.nodes[workflow.fps.node].inputs[
    workflow.fps.input
  ] as number;
  const base = Math.max(workflow.minFrames, Math.round(durationSeconds * fps));
  const frames =
    base +
    ((workflow.frameRemainder -
      (base % workflow.frameMultiple) +
      workflow.frameMultiple) %
      workflow.frameMultiple);
  return { fps, frames, durationSeconds: frames / fps };
}
