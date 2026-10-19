import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { sendNotificationPush } from "../push";
import {
  checkAndCreateProactiveNotification,
  getUnreadNotificationCount,
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notifications";

export const notificationRouter = router({
  /** 读取当前用户最近的站内通知。 */
  list: protectedProcedure.query(async ({ ctx }) => {
    return await getUserNotifications(ctx.user.id);
  }),

  /** 统计当前用户未读通知数量。 */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return await getUnreadNotificationCount(ctx.user.id);
  }),

  /** 按用户归属标记指定通知为已读。 */
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationRead(input.id, ctx.user.id);
      return { success: true };
    }),

  /** 将当前用户全部通知标记为已读。 */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsRead(ctx.user.id);
    return { success: true };
  }),

  /** 尝试生成主动站内通知，成功后异步向已订阅端点投递。 */
  checkProactive: protectedProcedure.mutation(async ({ ctx }) => {
    const notification = await checkAndCreateProactiveNotification(ctx.user.id);
    if (notification) {
      void sendNotificationPush(ctx.user.id, notification).catch(() => {});
    }
    return notification;
  }),
});
