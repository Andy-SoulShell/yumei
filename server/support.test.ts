import { randomUUID, createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  supportMessages,
  supportTickets,
  users,
  verifications,
} from "../drizzle/schema";
import { getDb } from "./database";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";
import { deleteAccount, exportAccountData } from "./privacy";
const caller = (userId?: string, admin = false) =>
  appRouter.createCaller({
    user: userId ? { id: userId, role: "admin" } : null,
    administrator: admin ? { id: "management" } : null,
    req: {},
    res: { setHeader: vi.fn() },
  } as any);
const input = () => ({
  id: randomUUID(),
  category: "billing" as const,
  subject: "Payment not received",
  orderReference: "QA-ORDER-1",
  content: "Please check this synthetic order.",
});
afterEach(() => vi.restoreAllMocks());
it("requires sign-in for customer requests and independent management authentication for staff", async () => {
  await expect(caller().support.create(input())).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  const id = await createTestUser();
  await expect(caller(id).support.admin.list()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("keeps requests isolated and retries idempotent", async () => {
  const a = await createTestUser(),
    b = await createTestUser(),
    request = input();
  const client = caller(a);
  const ticket = await client.support.create(request);
  expect((await client.support.create(request)).id).toBe(ticket.id);
  expect((await client.support.get({ id: ticket.id })).messages).toHaveLength(
    1
  );
  expect((await caller(b).support.list()).items).toHaveLength(0);
  await expect(caller(b).support.get({ id: ticket.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    caller(b).support.reply({
      id: randomUUID(),
      ticketId: ticket.id,
      content: "Foreign reply",
    })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("delivers staff replies to the owner, resolves tickets and reopens them when the owner follows up", async () => {
  const id = await createTestUser(),
    client = caller(id),
    ticket = await client.support.create(input()),
    staff = caller(undefined, true);
  const reply = {
    id: randomUUID(),
    ticketId: ticket.id,
    content: "Please check the receipt.",
    status: "resolved" as const,
  };
  await staff.support.admin.reply(reply);
  await staff.support.admin.reply(reply);
  const data = await client.support.get({ id: ticket.id });
  expect(data.ticket.status).toBe("resolved");
  expect(data.messages).toHaveLength(2);
  expect(data.messages[1]).toMatchObject({
    author: "staff",
    content: reply.content,
  });
  await client.support.reply({
    id: randomUUID(),
    ticketId: ticket.id,
    content: "I still need help.",
  });
  expect((await client.support.get({ id: ticket.id })).ticket.status).toBe(
    "open"
  );
  expect((await staff.support.admin.get({ id: ticket.id })).owner?.email).toBe(
    `${id}@example.test`
  );
});
it("rejects conflicting request IDs and overlong content without creating a ticket", async () => {
  const id = await createTestUser(),
    client = caller(id),
    first = input();
  await client.support.create(first);
  await expect(
    client.support.create({ ...first, subject: "Changed payload" })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    client.support.create({ ...input(), content: "x".repeat(4001) })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect((await client.support.list()).items).toHaveLength(1);
});
it("limits new requests transactionally without charging retries twice", async () => {
  const id = await createTestUser(),
    client = caller(id),
    first = input();
  await client.support.create(first);
  await client.support.create(first);
  for (let n = 1; n < 5; n++) await client.support.create(input());
  await expect(client.support.create(input())).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  expect((await client.support.list()).items).toHaveLength(5);
});
it("paginates support inboxes without dropping identical-timestamp tickets", async () => {
  const id = await createTestUser(),
    db = (await getDb())!,
    date = new Date();
  await db.insert(supportTickets).values(
    Array.from({ length: 35 }, () => ({
      id: randomUUID(),
      userId: id,
      category: "technical" as const,
      subject: "QA pagination",
      createdAt: date,
    }))
  );
  const one = await caller(id).support.list();
  const two = await caller(id).support.list({ cursor: one.nextCursor });
  expect(new Set([...one.items, ...two.items].map(t => t.id)).size).toBe(35);
});
it("includes support history in the user's export and removes it with their account", async () => {
  const id = await createTestUser(),
    client = caller(id),
    ticket = await client.support.create(input()),
    db = (await getDb())!;
  const exported = await exportAccountData(id);
  expect(exported.supportTickets.map(t => t.id)).toEqual([ticket.id]);
  expect(exported.supportMessages).toHaveLength(1);
  const token = "a".repeat(48);
  await db.insert(verifications).values({
    id: randomUUID(),
    identifier: `account-deletion:${id}`,
    value: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 60000),
  });
  await deleteAccount(id, token, `${id}@example.test`);
  expect(
    await db.select().from(supportTickets).where(eq(supportTickets.userId, id))
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.userId, id))
  ).toHaveLength(0);
  expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
});
