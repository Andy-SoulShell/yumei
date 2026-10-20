/** 记录供应商实际调用元数据，统计失败不能改变已成功的业务结算。 */
import { and, eq } from "drizzle-orm";
import { generationRequests } from "../drizzle/schema";
import { getDb } from "./database";
import { log } from "./_core/log";

/** 不包含提示词、回复、邮箱、密钥的统计结构。 */
export type GenerationTelemetry = NonNullable<
  typeof generationRequests.$inferSelect.telemetry
>;

/** 缺失或非法供应商数字保持未知，合法的零与未知明确区分。 */
export function knownUsage(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** 以请求编号覆盖写入同一条统计；落库失败仅记录无正文的结构化元数据。 */
export async function recordGenerationTelemetry(
  id: string,
  userId: string,
  data: GenerationTelemetry
) {
  try {
    const db = await getDb();
    if (!db) throw new Error("no database");
    await db
      .update(generationRequests)
      .set({ telemetry: data })
      .where(
        and(
          eq(generationRequests.id, id),
          eq(generationRequests.userId, userId)
        )
      );
  } catch {
    log.warn("[generation] telemetry storage failed", {
      requestId: id,
      ...data,
    });
  }
}
