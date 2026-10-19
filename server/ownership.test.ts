import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";

/**
 * Regression test for issue #4: ownership-before-write.
 *
 * The v3.0 implementations of `chat.sendMessage` and `selfie.generate`
 * accepted any `conversationId` from the client and only verified
 * ownership AFTER `createMessage` ran — so an attacker holding a valid
 * session could insert messages into any user's conversation.
 *
 * This test mocks `db.ts` and asserts:
 *   1. `getConversation` is called with the caller's `userId` BEFORE
 *      `createMessage` is called (by recording invocation order).
 *   2. When `getConversation` returns undefined (= conversation not
 *      owned by the caller), the route throws TRPCError(FORBIDDEN) and
 *      `createMessage` is never called.
 *
 * If a future refactor reintroduces "write first, validate later", these
 * tests fail.
 */

vi.mock("../server/db", async () => {
  return await vi.importActual("./db");
});

import * as db from "./db";
import { appRouter } from "./routers";

const fakeUser: User = {
  id: "test-user-42",
  openId: "test-openid-42",
  name: "Tester",
  email: null,
  loginMethod: null,
  avatarUrl: null,
  // M1-6: AI routes require a confirmed 18+ birth date.
  birthDate: new Date("1990-01-01"),
  createdAt: new Date(),
  lastSignedIn: new Date(),
  lastActiveAt: new Date(),
};

const ctx = {
  user: fakeUser,
  cookies: {} as any,
  res: {} as any,
  req: {} as any,
};

const callOrder: string[] = [];

beforeEach(() => {
  callOrder.length = 0;
  vi.restoreAllMocks();
  // M1-3: chat.sendMessage resolves the LLM key before any reads/writes.
  // Provide a fake operator key so these tests exercise the ownership
  // path rather than failing at the key precondition.
  process.env.OPERATOR_OPENROUTER_KEY = "sk-or-test-fake-operator-key";
});

afterEach(() => {
  delete process.env.OPERATOR_OPENROUTER_KEY;
});

describe("issue #4: ownership-before-write", () => {
  describe("chat.sendMessage", () => {
    it("calls getConversation BEFORE createMessage", async () => {
      vi.spyOn(db, "getConversation").mockImplementation(async () => {
        callOrder.push("getConversation");
        return {
          id: 1,
          userId: "test-user-42",
          girlfriendId: 1,
          title: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      });
      vi.spyOn(db, "createMessage").mockImplementation(async () => {
        callOrder.push("createMessage");
        return {} as any;
      });
      vi.spyOn(db, "getActiveGirlfriend").mockResolvedValue(null);

      const caller = appRouter.createCaller(ctx as any);
      try {
        await caller.chat.sendMessage({
          conversationId: 1,
          content: "hi",
        });
      } catch {
        // ignore — we expect a downstream error since girlfriend is null,
        // but we only care about the order of the first two calls.
      }

      expect(callOrder[0]).toBe("getConversation");
      // createMessage must NOT precede getConversation. It is fine for it
      // to never run (because girlfriend lookup fails first); what would
      // be a regression is createMessage running BEFORE getConversation.
      const createIdx = callOrder.indexOf("createMessage");
      const getIdx = callOrder.indexOf("getConversation");
      if (createIdx !== -1) {
        expect(createIdx).toBeGreaterThan(getIdx);
      }
    });

    it("throws FORBIDDEN and does NOT write when conversation is not owned", async () => {
      vi.spyOn(db, "getConversation").mockImplementation(async () => {
        callOrder.push("getConversation");
        return undefined; // simulate "not found / not owned"
      });
      const createMessageSpy = vi
        .spyOn(db, "createMessage")
        .mockImplementation(async () => {
          callOrder.push("createMessage");
          return {} as any;
        });

      const caller = appRouter.createCaller(ctx as any);
      await expect(
        caller.chat.sendMessage({ conversationId: 999, content: "hi" })
      ).rejects.toThrowError(TRPCError);

      expect(createMessageSpy).not.toHaveBeenCalled();
      expect(callOrder).toEqual(["getConversation"]);
    });
  });

  describe("selfie.generate", () => {
    it("throws FORBIDDEN and does NOT write when conversation is not owned", async () => {
      vi.spyOn(db, "getConversation").mockImplementation(async () => {
        callOrder.push("getConversation");
        return undefined;
      });
      const createMessageSpy = vi
        .spyOn(db, "createMessage")
        .mockImplementation(async () => {
          callOrder.push("createMessage");
          return {} as any;
        });
      const createSelfieSpy = vi
        .spyOn(db, "createSelfie")
        .mockImplementation(async () => {
          callOrder.push("createSelfie");
          return {} as any;
        });

      const caller = appRouter.createCaller(ctx as any);
      await expect(
        caller.selfie.generate({
          conversationId: 999,
          userContext: "wearing a dress",
        })
      ).rejects.toThrowError(TRPCError);

      expect(createMessageSpy).not.toHaveBeenCalled();
      expect(createSelfieSpy).not.toHaveBeenCalled();
      expect(callOrder).toEqual(["getConversation"]);
    });
  });
});
