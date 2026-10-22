/** 视频任务的认证接收、读取与取消 API。 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { videoInputSchema } from "../../shared/video";
import { acceptVideo, cancelVideo, getVideo } from "../videoGeneration";

export const videoRouter = router({
  create: protectedProcedure
    .input(videoInputSchema)
    .mutation(({ ctx, input }) => acceptVideo(ctx.user, input)),
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .query(({ ctx, input }) => getVideo(ctx.user.id, input.id)),
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) => cancelVideo(ctx.user.id, input.id)),
});
