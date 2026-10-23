/** 图片任务的持久执行信息；API 只返回 ImageTaskView，不返回服务地址或工作流。 */
import { z } from "zod";
import { CHAT_INPUT_CAPACITY } from "./const";
import type { ProductConfig } from "./productConfig";
import type { ContentText } from "./discovery";

export const imageTaskInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  conversationId: z.number().int().positive(),
  userContext: z.string().max(CHAT_INPUT_CAPACITY),
  generationMode: z.enum(["reference", "text"]).default("reference"),
  poseId: z.string().optional(),
});
export const coupleTaskInputSchema = imageTaskInputSchema
  .omit({ poseId: true, generationMode: true })
  .extend({
    userPhotoBase64: z.string().min(1),
    userPhotoMimeType: z.string(),
  });
export type ImageTaskInput = z.infer<typeof imageTaskInputSchema>;
export type CoupleTaskInput = z.infer<typeof coupleTaskInputSchema>;
export type ImageTask = {
  fingerprint: string;
  input: Omit<ImageTaskInput, "clientRequestId">;
  prompt: string;
  promptMode: "direct" | "mirror";
  preset?: { label: ContentText; emoji: string };
  chatContent?: string;
  provider: "comfyui" | "fal";
  isByok: boolean;
  model: string;
  baseUrl: string | null;
  workflow: ProductConfig["models"]["image"]["workflows"]["text"];
  runtime: ProductConfig["runtime"]["image"];
  maxReferenceBytes: number;
  references: { key: string; url: string }[];
  phase: "queued" | "submitting" | "running" | "saving";
  remoteId?: string;
  statusUrl?: string;
  responseUrl?: string;
  submittedAt?: number;
  remoteQueued?: boolean;
  failure?: "provider" | "timeout" | "unconfirmed" | "context";
  retryTaskId?: string;
  retryUntil?: number;
};
export type ImageTaskView = {
  id: string;
  conversationId: number;
  messageId: number | null;
  kind: "selfie" | "couple";
  status: "queued" | "generating" | "completed" | "failed";
  phase: ImageTask["phase"];
  scene: string;
  preset: ImageTask["preset"] | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  coinCost?: number;
  quota: "reserved" | "charged" | "refunded" | "unmetered";
  isByok: boolean;
  failure: ImageTask["failure"] | null;
  retryTaskId: string | null;
  retryUntil: number | null;
  canRetry: boolean;
};
