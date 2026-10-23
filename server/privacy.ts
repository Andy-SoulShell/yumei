/** 用户数据导出、会话遗忘与邮箱确认后的原子注销。 */
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import * as s from "../drizzle/schema";
import { withUserTransaction, getDb, type DbTransaction } from "./database";
import { cancelConversationGenerations } from "./generations";
import { flushMediaDeletions } from "./mediaCleanup";
import { sendAccountDeletionEmail } from "./_core/email";
import { ENV } from "./_core/env";
import type { Locale } from "../shared/locales";

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const deletionId = (userId: string) => `account-deletion:${userId}`;
export const subscriptionCanBeDeleted = (status?: string) =>
  !status || status === "cancelled" || status === "expired";

async function queueKeys(
  tx: DbTransaction,
  userId: string,
  keys: (string | null | undefined)[]
) {
  for (const key of Array.from(
    new Set(keys.filter((key): key is string => !!key))
  ))
    await tx
      .insert(s.mediaDeletions)
      .values({ userId, key })
      .onDuplicateKeyUpdate({ set: { key } });
}

/** 删除单个会话及其来源记忆；epoch 阻止旧提取任务把删除内容重新写回。 */
export async function deleteConversation(userId: string, id: number) {
  await withUserTransaction(userId, async tx => {
    const [conversation] = await tx
      .select()
      .from(s.conversations)
      .where(
        and(eq(s.conversations.userId, userId), eq(s.conversations.id, id))
      )
      .for("update");
    if (!conversation)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    const rows = await tx
      .select({ id: s.messages.id, key: s.messages.imageKey })
      .from(s.messages)
      .where(eq(s.messages.conversationId, id));
    const ids = rows.map(row => row.id),
      keys = rows.map(row => row.key).filter((key): key is string => !!key);
    await cancelConversationGenerations(tx, [id]);
    const roleWhere = and(
      eq(s.girlfriends.id, conversation.girlfriendId),
      eq(s.girlfriends.userId, userId)
    );
    await tx
      .update(s.girlfriends)
      .set({ memoryEpoch: sql`${s.girlfriends.memoryEpoch}+1` })
      .where(roleWhere);
    if (ids.length)
      await tx
        .delete(s.memories)
        .where(
          and(
            eq(s.memories.userId, userId),
            inArray(s.memories.sourceMessageId, ids)
          )
        );
    const contacts = await tx
      .select({ id: s.proactiveContacts.id })
      .from(s.proactiveContacts)
      .where(
        and(
          eq(s.proactiveContacts.userId, userId),
          eq(s.proactiveContacts.girlfriendId, conversation.girlfriendId)
        )
      );
    if (contacts.length)
      await tx.delete(s.notifications).where(
        and(
          eq(s.notifications.userId, userId),
          inArray(
            s.notifications.contactId,
            contacts.map(row => row.id)
          )
        )
      );
    for (const table of [
      s.memoryEmbeddings,
      s.conversationSummaries,
      s.memoryExtractionJobs,
      s.proactiveDeliveries,
      s.proactiveContacts,
    ])
      await tx.delete(table).where(
        and(
          eq(table.userId, userId),
          "girlfriendId" in table
            ? eq(table.girlfriendId, conversation.girlfriendId)
            : inArray(
                table.contactId,
                tx
                  .select({ id: s.proactiveContacts.id })
                  .from(s.proactiveContacts)
                  .where(
                    and(
                      eq(s.proactiveContacts.userId, userId),
                      eq(
                        s.proactiveContacts.girlfriendId,
                        conversation.girlfriendId
                      )
                    )
                  )
              )
        )
      );
    await tx.delete(s.messages).where(eq(s.messages.conversationId, id));
    if (keys.length)
      await tx
        .delete(s.selfies)
        .where(
          and(eq(s.selfies.userId, userId), inArray(s.selfies.imageKey, keys))
        );
    await tx.delete(s.conversations).where(eq(s.conversations.id, id));
    await queueKeys(tx, userId, keys);
  });
  await flushMediaDeletions(userId).catch(() => {});
  return { success: true };
}

/** 只导出账号本人可见的数据；认证令牌、密码、支付签名和 BYOK 密钥均不进入文件。 */
export async function exportAccountData(userId: string) {
  return withUserTransaction(userId, async tx => {
    const [profile] = await tx
      .select({
        id: s.users.id,
        name: s.users.name,
        email: s.users.email,
        birthDate: s.users.birthDate,
        createdAt: s.users.createdAt,
        image: s.users.image,
      })
      .from(s.users)
      .where(eq(s.users.id, userId));
    const rows = async <
      T extends
        | typeof s.girlfriends
        | typeof s.conversations
        | typeof s.memories
        | typeof s.selfies
        | typeof s.userPreferences
        | typeof s.companionPreferences
        | typeof s.apiConfigs
        | typeof s.omnivoiceVoices,
    >(
      table: T
    ) => tx.select().from(table).where(eq(table.userId, userId));
    return {
      format: "yumei-personal-data-v1",
      exportedAt: new Date().toISOString(),
      profile,
      characters: await rows(s.girlfriends),
      conversations: await rows(s.conversations),
      messages: await tx
        .select(getTableColumns(s.messages))
        .from(s.messages)
        .innerJoin(
          s.conversations,
          eq(s.conversations.id, s.messages.conversationId)
        )
        .where(eq(s.conversations.userId, userId)),
      memories: await rows(s.memories),
      photos: await rows(s.selfies),
      preferences: await rows(s.userPreferences),
      contactPreferences: await rows(s.companionPreferences),
      replyPreferences: await rows(s.apiConfigs),
      voiceClones: await rows(s.omnivoiceVoices),
      supportTickets: await tx
        .select()
        .from(s.supportTickets)
        .where(eq(s.supportTickets.userId, userId)),
      supportMessages: await tx
        .select()
        .from(s.supportMessages)
        .where(eq(s.supportMessages.userId, userId)),
      subscription: await tx
        .select({
          plan: s.subscriptions.plan,
          status: s.subscriptions.status,
          renewsAt: s.subscriptions.renewsAt,
          endsAt: s.subscriptions.endsAt,
        })
        .from(s.subscriptions)
        .where(eq(s.subscriptions.userId, userId)),
    };
  });
}

export async function deletionEligibility(userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [subscription] = await db
    .select({ status: s.subscriptions.status })
    .from(s.subscriptions)
    .where(eq(s.subscriptions.userId, userId));
  return { allowed: subscriptionCanBeDeleted(subscription?.status) };
}

export async function requestAccountDeletion(userId: string, locale: Locale) {
  const token = randomBytes(24).toString("hex");
  const email = await withUserTransaction(userId, async tx => {
    const [user] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId));
    if (!user.emailVerified)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Verify your email first",
      });
    const [sub] = await tx
      .select()
      .from(s.subscriptions)
      .where(eq(s.subscriptions.userId, userId));
    if (!subscriptionCanBeDeleted(sub?.status))
      throw new TRPCError({
        code: "CONFLICT",
        message: "Cancel automatic renewal before deleting your account",
      });
    const [previous] = await tx
      .select()
      .from(s.verifications)
      .where(eq(s.verifications.identifier, deletionId(userId)))
      .for("update");
    if (previous && previous.createdAt.getTime() > Date.now() - 60_000)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Wait a minute before requesting another email",
      });
    await tx
      .delete(s.verifications)
      .where(eq(s.verifications.identifier, deletionId(userId)));
    await tx.insert(s.verifications).values({
      id: randomUUID(),
      identifier: deletionId(userId),
      value: digest(token),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return user.email;
  });
  try {
    await sendAccountDeletionEmail({
      to: email,
      url: `${ENV.publicUrl}/settings#deleteToken=${token}`,
      locale,
    });
  } catch (error) {
    const db = await getDb();
    await db!
      .delete(s.verifications)
      .where(
        and(
          eq(s.verifications.identifier, deletionId(userId)),
          eq(s.verifications.value, digest(token))
        )
      );
    throw error;
  }
  return { sent: true };
}

/** 注销与所有业务表删除同一提交；媒体任务保留至对象删除成功。 */
export async function deleteAccount(
  userId: string,
  token: string,
  email: string
) {
  const receipt = randomBytes(24).toString("hex");
  await withUserTransaction(userId, async tx => {
    const [user] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId));
    const [verification] = await tx
      .select()
      .from(s.verifications)
      .where(eq(s.verifications.identifier, deletionId(userId)))
      .for("update");
    if (
      user.email !== email ||
      !verification ||
      verification.expiresAt.getTime() <= Date.now() ||
      verification.value.length !== 64 ||
      !timingSafeEqual(
        Buffer.from(verification.value),
        Buffer.from(digest(token))
      )
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Deletion confirmation is invalid or expired",
      });
    const [sub] = await tx
      .select()
      .from(s.subscriptions)
      .where(eq(s.subscriptions.userId, userId))
      .for("update");
    if (!subscriptionCanBeDeleted(sub?.status))
      throw new TRPCError({
        code: "CONFLICT",
        message: "Cancel automatic renewal before deleting your account",
      });
    const conversations = await tx
      .select({ id: s.conversations.id })
      .from(s.conversations)
      .where(eq(s.conversations.userId, userId));
    const ids = conversations.map(row => row.id);
    const media = ids.length
      ? await tx
          .select({ key: s.messages.imageKey })
          .from(s.messages)
          .where(inArray(s.messages.conversationId, ids))
      : [];
    const roles = await tx
      .select()
      .from(s.girlfriends)
      .where(eq(s.girlfriends.userId, userId));
    const photos = await tx
      .select()
      .from(s.selfies)
      .where(eq(s.selfies.userId, userId));
    const pending = await tx
      .select({ expiresAt: s.generationRequests.expiresAt })
      .from(s.generationRequests)
      .where(
        and(
          eq(s.generationRequests.userId, userId),
          eq(s.generationRequests.status, "pending")
        )
      );
    const settleUntil = Math.max(
      Date.now(),
      ...pending.map(row => row.expiresAt.getTime())
    );
    await cancelConversationGenerations(tx, ids);
    if (ids.length)
      await tx
        .delete(s.messages)
        .where(inArray(s.messages.conversationId, ids));
    // 包括软删除角色、全部设备会话、私有音色、任务与已加密的用户密钥。
    for (const table of [
      s.supportMessages,
      s.supportTickets,
      s.proactiveDeliveries,
      s.proactiveContacts,
      s.notifications,
      s.memoryExtractionJobs,
      s.memoryEmbeddings,
      s.conversationSummaries,
      s.memories,
      s.selfies,
      s.girlfriendMoods,
      s.conversations,
      s.girlfriends,
      s.omnivoiceVoices,
      s.generationRequests,
      s.voiceTranscriptions,
      s.pushSubscriptions,
      s.userKeys,
      s.apiConfigs,
      s.companionPreferences,
      s.userPreferences,
      s.usageMeters,
      s.rateWindows,
      s.aiTaskRuns,
      s.billingEvents,
      s.subscriptions,
      s.sessions,
      s.accounts,
    ])
      await tx.delete(table).where(eq(table.userId, userId));
    await tx
      .delete(s.verifications)
      .where(
        sql`${s.verifications.value}=${userId} OR ${s.verifications.identifier}=${deletionId(userId)} OR JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(${s.verifications.value}) THEN ${s.verifications.value} ELSE '{}' END,'$.email'))=${user.email}`
      );
    await queueKeys(tx, userId, [
      user.image?.startsWith("/files/") ? user.image.slice(7) : null,
      ...roles.flatMap(row => [row.referenceImageKey, row.avatarKey]),
      ...photos.map(row => row.imageKey),
      ...media.map(row => row.key),
    ]);
    await tx.insert(s.verifications).values({
      id: randomUUID(),
      identifier: `deletion-receipt:${digest(receipt)}`,
      value: JSON.stringify({ userId, settleUntil }),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    await tx.delete(s.users).where(eq(s.users.id, userId));
  });
  await flushMediaDeletions(userId).catch(() => {});
  return { receipt };
}
export async function deletionStatus(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [receipt] = await db
    .select()
    .from(s.verifications)
    .where(eq(s.verifications.identifier, `deletion-receipt:${digest(token)}`));
  if (!receipt || receipt.expiresAt.getTime() <= Date.now())
    throw new TRPCError({ code: "NOT_FOUND", message: "Receipt unavailable" });
  const owner =
    receipt.value === "complete"
      ? null
      : (JSON.parse(receipt.value) as { userId: string; settleUntil: number });
  const pending =
    receipt.value === "complete"
      ? []
      : await db
          .select({ key: s.mediaDeletions.key })
          .from(s.mediaDeletions)
          .where(eq(s.mediaDeletions.userId, owner!.userId))
          .limit(1);
  const mediaPending =
    pending.length > 0 || Boolean(owner && owner.settleUntil > Date.now());
  if (!mediaPending && receipt.value !== "complete")
    await db
      .update(s.verifications)
      .set({ value: "complete", updatedAt: new Date() })
      .where(eq(s.verifications.id, receipt.id));
  return { accountDeleted: true, mediaPending };
}
