/** 私人克隆音色的数据读写、归属检查、数量限制和删除后的偏好回退。 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { apiConfigs, omnivoiceVoices } from "../../drizzle/schema";
import {
  OMNIVOICE_CLONE_LIMIT,
  OMNIVOICE_CLONE_PREFIX,
} from "../../shared/omnivoice";
import { getDb, withUserTransaction } from "../database";

/** 仅列出当前用户的音色摘要，不返回参考录音和原文。 */
export async function listOmniVoiceClones(userId: string) {
  const db = (await getDb())!;
  return db
    .select({
      id: omnivoiceVoices.id,
      name: omnivoiceVoices.name,
      durationMs: omnivoiceVoices.durationMs,
    })
    .from(omnivoiceVoices)
    .where(eq(omnivoiceVoices.userId, userId));
}

/** 按音色标识及用户归属读取参考录音，未找到时拒绝访问。 */
export async function getOmniVoiceClone(userId: string, id: string) {
  const db = (await getDb())!;
  const [voice] = await db
    .select()
    .from(omnivoiceVoices)
    .where(and(eq(omnivoiceVoices.id, id), eq(omnivoiceVoices.userId, userId)));
  if (!voice)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "克隆音色不存在，请重新选择",
    });
  return voice;
}

/** 在用户事务锁内检查数量并保存已规范化的私人参考录音。 */
export async function createOmniVoiceClone(
  userId: string,
  data: { name: string; audio: string; text: string; durationMs: number }
) {
  return withUserTransaction(userId, async tx => {
    const existing = await tx
      .select({ id: omnivoiceVoices.id })
      .from(omnivoiceVoices)
      .where(eq(omnivoiceVoices.userId, userId));
    if (existing.length >= OMNIVOICE_CLONE_LIMIT)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "最多保存 10 个克隆音色，请先删除不再使用的音色",
      });
    const voice = {
      id: `${OMNIVOICE_CLONE_PREFIX}${nanoid()}`,
      name: data.name,
      durationMs: data.durationMs,
    };
    await tx.insert(omnivoiceVoices).values({
      ...voice,
      userId,
      referenceAudio: data.audio,
      referenceText: data.text,
    });
    return voice;
  });
}

/** 删除所属音色并重置账号偏好；角色绑定由数据库外键同步解除。 */
export async function deleteOmniVoiceClone(userId: string, id: string) {
  return withUserTransaction(userId, async tx => {
    await tx
      .delete(omnivoiceVoices)
      .where(
        and(eq(omnivoiceVoices.id, id), eq(omnivoiceVoices.userId, userId))
      );
    await tx
      .update(apiConfigs)
      .set({ omnivoiceVoiceId: null })
      .where(
        and(eq(apiConfigs.userId, userId), eq(apiConfigs.omnivoiceVoiceId, id))
      );
    return { ok: true as const };
  });
}
