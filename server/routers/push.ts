import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getVapidPublicKey,
  hasPushSubscription,
  removePushSubscription,
  savePushSubscription,
} from "../push";

export const pushRouter = router({
  /** 返回可公开的 VAPID 公钥，未配置时为 null。 */
  publicKey: publicProcedure.query(() => ({
    key: getVapidPublicKey(),
  })),

  /** 为当前用户保存浏览器推送端点及加密字段。 */
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(500),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await savePushSubscription(ctx.user.id, input);
      return { success: true };
    }),

  /** 仅删除当前用户拥有的指定浏览器端点。 */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().max(500) }))
    .mutation(async ({ ctx, input }) => {
      await removePushSubscription(ctx.user.id, input.endpoint);
      return { success: true };
    }),

  /** 返回当前用户是否有订阅及推送功能是否配置。 */
  status: protectedProcedure.query(async ({ ctx }) => ({
    subscribed: await hasPushSubscription(ctx.user.id),
    configured: getVapidPublicKey() !== null,
  })),
});
