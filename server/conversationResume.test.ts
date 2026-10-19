/** 覆盖会话延续与显式新建入口。 */

import { afterEach, describe, expect, it, vi } from "vitest";
import * as companionsDb from "./repositories/companions";
import * as conversationsDb from "./repositories/conversations";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({
  user: { id: "resume-test-user" },
  req: {},
  res: {},
} as any);
afterEach(() => vi.restoreAllMocks());

describe("resume and explicit new conversations", () => {
  it("resumes the selected character instead of calling the explicit creation path", async () => {
    const resume = vi
      .spyOn(conversationsDb, "resumeConversation")
      .mockResolvedValue({ id: 18, girlfriendId: 5 } as any);
    const create = vi.spyOn(conversationsDb, "createConversation");
    const result = await caller.conversation.resume({ girlfriendId: 5 });
    expect(result.id).toBe(18);
    expect(resume).toHaveBeenCalledWith("resume-test-user", 5);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not open a deleted or another user's character", async () => {
    vi.spyOn(conversationsDb, "resumeConversation").mockResolvedValue(
      undefined
    );
    await expect(
      caller.conversation.resume({ girlfriendId: 99 })
    ).rejects.toThrow("角色不存在");
  });

  it("creates a new conversation only through the explicit create endpoint", async () => {
    const owner = vi
      .spyOn(companionsDb, "getActiveGirlfriend")
      .mockResolvedValue({ id: 5 } as any);
    const create = vi
      .spyOn(conversationsDb, "createConversation")
      .mockResolvedValue({ id: 19 } as any);
    await caller.conversation.create({ girlfriendId: 5, title: "新的开始" });
    expect(owner).toHaveBeenCalledWith("resume-test-user", 5);
    expect(create).toHaveBeenCalledWith({
      userId: "resume-test-user",
      girlfriendId: 5,
      title: "新的开始",
    });
  });

  it("validates character ownership before explicit creation", async () => {
    vi.spyOn(companionsDb, "getActiveGirlfriend").mockResolvedValue(undefined);
    const create = vi.spyOn(conversationsDb, "createConversation");
    await expect(
      caller.conversation.create({ girlfriendId: 99 })
    ).rejects.toThrow("角色不存在");
    expect(create).not.toHaveBeenCalled();
  });

  it("checks conversation ownership before loading its messages", async () => {
    const owner = vi
      .spyOn(conversationsDb, "getConversation")
      .mockResolvedValue(undefined);
    const messages = vi.spyOn(conversationsDb, "getMessagePage");
    await expect(
      caller.conversation.getMessages({ conversationId: 99 })
    ).rejects.toThrow("not owned");
    expect(owner).toHaveBeenCalledWith(99, "resume-test-user");
    expect(messages).not.toHaveBeenCalled();
  });
});
