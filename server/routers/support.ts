/** 售后工单、归属校验与独立管理会话下的客服回复。 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { supportTickets, supportMessages, users } from "../../drizzle/schema";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb, withUserTransaction, type DbTransaction } from "../database";
import { todayUTC, tryConsumeMeterInTransaction } from "../_core/quota";
const category = z.enum(["billing", "account", "technical"]),
  status = z.enum(["open", "resolved"]);
const id = z.string().uuid(),
  body = z.string().trim().min(1).max(4000);
const cursor = z.object({ updatedAt: z.date(), id });
const page = z
  .object({ cursor: cursor.nullish(), status: status.optional() })
  .optional();
const notFound = () =>
  new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
async function quota(
  tx: DbTransaction,
  userId: string,
  meter: string,
  limit: number
) {
  const result = await tryConsumeMeterInTransaction(
    tx,
    userId,
    meter,
    limit,
    todayUTC()
  );
  if (!result.allowed)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Daily support submission limit reached",
    });
}
async function getTicket(ticketId: string, userId?: string) {
  const db = (await getDb())!;
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.id, ticketId),
        userId ? eq(supportTickets.userId, userId) : undefined
      )
    );
  if (!ticket) throw notFound();
  const messages = await db
    .select()
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.ticketId, ticketId),
        eq(supportMessages.userId, ticket.userId)
      )
    )
    .orderBy(desc(supportMessages.createdAt), desc(supportMessages.id))
    .limit(100);
  return { ticket, messages: messages.reverse() };
}
async function list(input: z.infer<typeof page>, userId?: string) {
  const db = (await getDb())!;
  const items = await db
    .select()
    .from(supportTickets)
    .where(
      and(
        userId ? eq(supportTickets.userId, userId) : undefined,
        input?.status ? eq(supportTickets.status, input.status) : undefined,
        input?.cursor
          ? or(
              lt(supportTickets.updatedAt, input.cursor.updatedAt),
              and(
                eq(supportTickets.updatedAt, input.cursor.updatedAt),
                lt(supportTickets.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
    .limit(31);
  const more = items.length > 30;
  items.splice(30);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      more && last ? { updatedAt: last.updatedAt, id: last.id } : null,
  };
}
const reply = z.object({ ticketId: id, id, content: body });
async function post(
  input: z.infer<typeof reply>,
  author: "user" | "staff",
  userId: string,
  state?: "open" | "resolved"
) {
  return withUserTransaction(userId, async tx => {
    const [ticket] = await tx
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.id, input.ticketId),
          eq(supportTickets.userId, userId)
        )
      )
      .for("update");
    if (!ticket) throw notFound();
    const [duplicate] = await tx
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.id, input.id));
    if (duplicate) {
      if (
        duplicate.ticketId === input.ticketId &&
        duplicate.userId === userId &&
        duplicate.author === author &&
        duplicate.content === input.content
      )
        return { success: true };
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reply request already used",
      });
    }
    if (author === "user") await quota(tx, userId, "support-reply", 20);
    const now = new Date(Math.max(Date.now(), ticket.updatedAt.getTime() + 1));
    await tx.insert(supportMessages).values({
      id: input.id,
      ticketId: input.ticketId,
      userId,
      author,
      content: input.content,
      createdAt: now,
    });
    await tx
      .update(supportTickets)
      .set({ status: state ?? "open", updatedAt: now })
      .where(eq(supportTickets.id, input.ticketId));
    return { success: true };
  });
}
export const supportRouter = router({
  list: protectedProcedure
    .input(page)
    .query(({ ctx, input }) => list(input, ctx.user.id)),
  get: protectedProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => getTicket(input.id, ctx.user.id)),
  create: protectedProcedure
    .input(
      z
        .object({
          id,
          category,
          subject: z.string().trim().min(1).max(120),
          orderReference: z.string().trim().max(200).optional(),
          content: body,
        })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      withUserTransaction(ctx.user.id, async tx => {
        const [existing] = await tx
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.id, input.id));
        if (existing) {
          if (
            existing.userId === ctx.user.id &&
            existing.subject === input.subject &&
            existing.category === input.category &&
            existing.orderReference === (input.orderReference ?? null)
          ) {
            const [original] = await tx
              .select()
              .from(supportMessages)
              .where(eq(supportMessages.id, input.id));
            if (original?.content === input.content) return existing;
          }
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ticket request already used",
          });
        }
        await quota(tx, ctx.user.id, "support-create", 5);
        const now = new Date();
        await tx.insert(supportTickets).values({
          id: input.id,
          userId: ctx.user.id,
          category: input.category,
          subject: input.subject,
          orderReference: input.orderReference,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(supportMessages).values({
          id: input.id,
          ticketId: input.id,
          userId: ctx.user.id,
          author: "user",
          content: input.content,
          createdAt: now,
        });
        const [created] = await tx
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.id, input.id));
        return created;
      })
    ),
  reply: protectedProcedure
    .input(reply.strict())
    .mutation(({ ctx, input }) => post(input, "user", ctx.user.id)),
  admin: router({
    list: adminProcedure.input(page).query(({ input }) => list(input)),
    get: adminProcedure.input(z.object({ id })).query(async ({ input }) => {
      const data = await getTicket(input.id);
      const db = (await getDb())!;
      const [owner] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, data.ticket.userId));
      return { ...data, owner };
    }),
    reply: adminProcedure
      .input(reply.extend({ status }).strict())
      .mutation(async ({ input }) => {
        const ticket = await getTicket(input.ticketId);
        return post(input, "staff", ticket.ticket.userId, input.status);
      }),
  }),
});
