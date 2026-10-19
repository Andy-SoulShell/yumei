/** 保存一次性语音转写凭据，奖励只依据服务端返回的文本和时长。 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { voiceTranscriptions } from "../drizzle/schema";
import type { TranscriptionResponse } from "./_core/openaiWhisper";
import { getDb, type DbTransaction } from "./database";

/** 成功转写后保存短期凭据，原始录音由媒体生命周期负责回收。 */
export async function saveTranscription(
  userId: string,
  result: TranscriptionResponse
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const id = crypto.randomUUID();
  await db.insert(voiceTranscriptions).values({
    id,
    userId,
    text: result.text.trim(),
    durationMs: Math.max(0, Math.round((result.duration || 0) * 1000)),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  return id;
}

/** 在消息成功结算的事务内核对并消费凭据，拒绝伪造、跨账号、过期及重复使用。 */
export async function consumeTranscription(
  tx: DbTransaction,
  id: string,
  userId: string,
  content: string
) {
  const [record] = await tx
    .select()
    .from(voiceTranscriptions)
    .where(
      and(
        eq(voiceTranscriptions.id, id),
        eq(voiceTranscriptions.userId, userId)
      )
    )
    .for("update");
  if (
    !record ||
    record.consumed ||
    record.expiresAt.getTime() <= Date.now() ||
    record.text !== content.trim()
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Voice transcription is unavailable",
    });
  await tx
    .update(voiceTranscriptions)
    .set({ consumed: true })
    .where(eq(voiceTranscriptions.id, id));
  return record;
}

/** 在调用收费模型前拒绝无效凭据，结算事务仍会再次核对以防并发消费。 */
export async function validateTranscription(
  userId: string,
  id: string,
  content: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [record] = await db
    .select()
    .from(voiceTranscriptions)
    .where(
      and(
        eq(voiceTranscriptions.id, id),
        eq(voiceTranscriptions.userId, userId)
      )
    );
  if (
    !record ||
    record.consumed ||
    record.expiresAt.getTime() <= Date.now() ||
    record.text !== content.trim()
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Voice transcription is unavailable",
    });
}
