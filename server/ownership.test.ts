import * as photosDb from "./repositories/photos";
/** 覆盖写操作之前的资源归属校验。 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

import * as companionsDb from "./repositories/companions";
import * as conversationsDb from "./repositories/conversations";
import { appRouter } from "./routers";

const fakeUser: User = {
  id: "test-user-42",

  name: "Tester",
  email: "ownership@example.com",

  // AI routes require a confirmed 18+ birth date.
  birthDate: new Date("1990-01-01"),
  createdAt: new Date(),
  lastSignedIn: new Date(),
  image: null,
  emailVerified: false,
  role: "user",
  updatedAt: new Date(),
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
});

describe(": ownership-before-write", () => {
  describe("chat.sendMessage", () => {
    it("calls getConversation BEFORE createMessage", async () => {
      vi.spyOn(conversationsDb, "getConversation").mockImplementation(
        async () => {
          callOrder.push("getConversation");
          return {
            id: 1,
            userId: "test-user-42",
            girlfriendId: 1,
            title: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any;
        }
      );
      vi.spyOn(conversationsDb, "createMessage").mockImplementation(
        async () => {
          callOrder.push("createMessage");
          return {} as any;
        }
      );
      vi.spyOn(companionsDb, "getActiveGirlfriend").mockResolvedValue(
        undefined
      );

      const caller = appRouter.createCaller(ctx as any);
      try {
        await caller.chat.sendMessage({
          conversationId: 1,
          content: "发张自拍",
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
      vi.spyOn(conversationsDb, "getConversation").mockImplementation(
        async () => {
          callOrder.push("getConversation");
          return undefined; // simulate "not found / not owned"
        }
      );
      const createMessageSpy = vi
        .spyOn(conversationsDb, "createMessage")
        .mockImplementation(async () => {
          callOrder.push("createMessage");
          return {} as any;
        });

      const caller = appRouter.createCaller(ctx as any);
      await expect(
        caller.chat.sendMessage({ conversationId: 999, content: "发张自拍" })
      ).rejects.toThrowError(TRPCError);

      expect(createMessageSpy).not.toHaveBeenCalled();
      expect(callOrder).toEqual(["getConversation"]);
    });
  });

  describe("selfie.generate", () => {
    it("throws FORBIDDEN and does NOT write when conversation is not owned", async () => {
      vi.spyOn(conversationsDb, "getConversation").mockImplementation(
        async () => {
          callOrder.push("getConversation");
          return undefined;
        }
      );
      const createMessageSpy = vi
        .spyOn(conversationsDb, "createMessage")
        .mockImplementation(async () => {
          callOrder.push("createMessage");
          return {} as any;
        });
      const createSelfieSpy = vi
        .spyOn(photosDb, "createSelfie")
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
