import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getCompanionPreferences } from "../aiTaskRuntime";
import { saveCompanionPreferences } from "../companionPreferences";
import { proactivePreferencesSchema } from "../../shared/proactiveContact";
import {
  checkAndCreateProactiveNotification,
  getUnreadNotificationCount,
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notifications";

export const notificationRouter = router({
  preferences: protectedProcedure.query(({ ctx }) =>
    getCompanionPreferences(ctx.user.id)
  ),
  updatePreferences: protectedProcedure
    .input(
      z.object({
        expectedRevision: z.number().int().nonnegative(),
        preferences: proactivePreferencesSchema,
      })
    )
    .mutation(({ ctx, input }) =>
      saveCompanionPreferences(
        ctx.user.id,
        input.expectedRevision,
        input.preferences
      )
    ),
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

  /** 规划站内消息与持久任务，外部投递仅由共享 outbox 执行。 */
  checkProactive: protectedProcedure.mutation(async ({ ctx }) => {
    const notification = await checkAndCreateProactiveNotification(ctx.user.id);
    return notification;
  }),
});
