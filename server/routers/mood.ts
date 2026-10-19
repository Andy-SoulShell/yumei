import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllGirlfriendMoods,
  getGirlfriendMood,
} from "../repositories/moods";

export const moodRouter = router({
  /** 按当前用户和角色编号读取心情。 */
  get: protectedProcedure
    .input(z.object({ girlfriendId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await getGirlfriendMood(ctx.user.id, input.girlfriendId);
    }),

  /** 读取当前用户的全部角色心情。 */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await getAllGirlfriendMoods(ctx.user.id);
  }),
});
