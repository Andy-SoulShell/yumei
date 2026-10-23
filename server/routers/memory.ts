import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  clearMemories,
  deleteMemory,
  editMemory,
  getMemoryState,
  listMemories,
  setMemoryEnabled,
  setMemoryPinned,
  setMemoryTimeZone,
} from "../memory";

export const memoryRouter = router({
  state: protectedProcedure
    .input(z.object({ girlfriendId: z.number().int().positive() }))
    .query(({ ctx, input }) => getMemoryState(ctx.user.id, input.girlfriendId)),
  setEnabled: protectedProcedure
    .input(
      z.object({
        girlfriendId: z.number().int().positive(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await setMemoryEnabled(ctx.user.id, input.girlfriendId, input.enabled);
      return { success: true };
    }),
  edit: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        content: z.string().trim().min(1).max(8000),
        expectedVersion: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await editMemory(
        ctx.user.id,
        input.id,
        input.content,
        input.expectedVersion
      );
      return { success: true };
    }),
  clear: protectedProcedure
    .input(z.object({ girlfriendId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await clearMemories(ctx.user.id, input.girlfriendId);
      return { success: true };
    }),
  setTimeZone: protectedProcedure
    .input(z.object({ timeZone: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await setMemoryTimeZone(ctx.user.id, input.timeZone);
      return { success: true };
    }),
  /** 按当前用户和角色编号读取记忆列表。 */
  list: protectedProcedure
    .input(z.object({ girlfriendId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await listMemories(ctx.user.id, input.girlfriendId);
    }),

  /** 按当前用户归属删除一条记忆。 */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        expectedVersion: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await deleteMemory(ctx.user.id, input.id, input.expectedVersion);
      return { success: true };
    }),

  /** 按当前用户归属更新记忆置顶状态。 */
  setPinned: protectedProcedure
    .input(z.object({ id: z.number(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setMemoryPinned(ctx.user.id, input.id, input.pinned);
      return { success: true };
    }),
});
