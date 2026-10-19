import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { deleteMemory, listMemories, setMemoryPinned } from "../memory";

export const memoryRouter = router({
  /** 按当前用户和角色编号读取记忆列表。 */
  list: protectedProcedure
    .input(z.object({ girlfriendId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await listMemories(ctx.user.id, input.girlfriendId);
    }),

  /** 按当前用户归属删除一条记忆。 */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteMemory(ctx.user.id, input.id);
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
