/** 编辑和换回复创建可找回的新会话，原消息及生成任务快照始终完整保留。 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import {
  conversations,
  girlfriends,
  messages,
  type User,
} from "../drizzle/schema";
import { withUserTransaction } from "./database";
import { getPublishedProductConfig } from "./repositories/productConfig";
import { ensureAgeConfirmed } from "./routers/guards";
import { submitChatTurn } from "./chatStreaming";
export async function branchChat(
  user: User,
  input: {
    conversationId: number;
    messageId: number;
    clientRequestId: string;
    content?: string;
  }
) {
  ensureAgeConfirmed(user);
  const branch = await withUserTransaction(user.id, async tx => {
    const [prior] = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, user.id),
          eq(conversations.branchRequestId, input.clientRequestId)
        )
      );
    if (prior) {
      if (
        prior.branchSourceId !== input.conversationId ||
        prior.branchMessageId !== input.messageId ||
        (input.content !== undefined &&
          prior.branchInput !== input.content.trim())
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "BRANCH_REQUEST_CHANGED",
        });
      return prior;
    }
    const [source] = await tx
      .select({
        id: conversations.id,
        girlfriendId: conversations.girlfriendId,
        title: conversations.title,
      })
      .from(conversations)
      .innerJoin(girlfriends, eq(girlfriends.id, conversations.girlfriendId))
      .where(
        and(
          eq(conversations.id, input.conversationId),
          eq(conversations.userId, user.id),
          eq(girlfriends.userId, user.id),
          isNull(girlfriends.deletedAt)
        )
      )
      .for("update");
    const [target] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.conversationId, input.conversationId)
        )
      );
    if (
      !source ||
      !target ||
      target.imageUrl ||
      target.generationStatus === "pending"
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "BRANCH_MESSAGE_UNAVAILABLE",
      });
    const [turn] =
      target.role === "user"
        ? [target]
        : await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, source.id),
                eq(messages.role, "user"),
                lt(messages.id, target.id),
                isNull(messages.imageUrl)
              )
            )
            .orderBy(desc(messages.id))
            .limit(1);
    if (!turn)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "BRANCH_USER_MESSAGE_REQUIRED",
      });
    const content = (input.content ?? turn.content).trim(),
      policy = await getPublishedProductConfig(tx);
    if (!content || content.length > policy.runtime.chat.maxInputChars)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "BRANCH_INPUT_TOO_LONG",
      });
    const history = await tx
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, source.id), lt(messages.id, turn.id))
      )
      .orderBy(messages.id)
      .limit(2001);
    if (history.length > 2000)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "BRANCH_HISTORY_TOO_LONG",
      });
    const [inserted] = await tx.insert(conversations).values({
      userId: user.id,
      girlfriendId: source.girlfriendId,
      title: source.title,
      branchRequestId: input.clientRequestId,
      branchSourceId: source.id,
      branchMessageId: input.messageId,
      branchInput: content,
    });
    const id = Number(inserted.insertId);
    if (history.length)
      for (let offset = 0; offset < history.length; offset += 100) {
        const batch = history
          .slice(offset, offset + 100)
          .filter(
            row =>
              row.generationStatus !== "pending" &&
              row.generationStatus !== "failed"
          )
          .map(row => ({
            conversationId: id,
            role: row.role,
            content: row.content,
            imageUrl: row.imageUrl,
            imageKey: row.imageKey,
            selfieMode: row.selfieMode,
            generationRequestId: row.generationRequestId,
            generationStatus: row.generationStatus,
            createdAt: row.createdAt,
          }));
        if (batch.length) await tx.insert(messages).values(batch);
      }
    return (
      await tx.select().from(conversations).where(eq(conversations.id, id))
    )[0];
  });
  try {
    await submitChatTurn(user, {
      conversationId: branch.id,
      clientRequestId: input.clientRequestId,
      content: branch.branchInput!,
    });
    return { id: branch.id, accepted: true, draft: "" };
  } catch (error) {
    if (
      error instanceof TRPCError &&
      [
        "FORBIDDEN",
        "PRECONDITION_FAILED",
        "TOO_MANY_REQUESTS",
        "BAD_REQUEST",
      ].includes(error.code)
    )
      return { id: branch.id, accepted: false, draft: branch.branchInput! };
    throw error;
  }
}
