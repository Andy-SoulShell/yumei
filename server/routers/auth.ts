import { TRPCError } from "@trpc/server";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { nanoid } from "nanoid";
import { userProfileSchema } from "../../shared/profile";
import { auth } from "../_core/auth";
import { getSessionCookieOptions } from "../_core/cookies";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  hasCredentialPassword,
  setUserBirthDate,
  updateUserProfile,
} from "../repositories/users";
import { decodeBase64Upload, enforceUpload } from "../_core/uploads";
import { log, providerErrorSummary } from "../_core/log";
import { getPublishedProductConfig } from "../repositories/productConfig";
import { putStagedMedia } from "../managedMedia";
import { flushMediaDeletions, queueMediaDeletion } from "../mediaCleanup";
import { yearsSince } from "./guards";

export const authRouter = router({
  /** 返回上下文中已解析的应用用户，未登录时返回 null。 */
  me: publicProcedure.query(opts => opts.ctx.user),

  /** 仅修改当前登录账号的显示资料，头像文件与姓名在同一事务中生效。 */
  updateProfile: protectedProcedure
    .input(userProfileSchema)
    .mutation(async ({ ctx, input }) => {
      let avatarKey: string | null | undefined;
      try {
        if (input.avatar === null) avatarKey = null;
        else if (input.avatar) {
          const image = decodeBase64Upload(input.avatar.imageBase64);
          enforceUpload(
            (await getPublishedProductConfig()).uploads.avatar,
            image,
            input.avatar.mimeType
          );
          const ext = input.avatar.mimeType
            .split("/")[1]
            .replace("jpeg", "jpg");
          avatarKey = `user-avatar-${nanoid()}.${ext}`;
          await putStagedMedia(
            ctx.user.id,
            avatarKey,
            image,
            input.avatar.mimeType
          );
        }
        const user = await updateUserProfile(
          ctx.user.id,
          input.name,
          avatarKey
        );
        // 资料已经提交，清理失败交由后台重试，不能向客户端误报保存失败。
        await flushMediaDeletions(ctx.user.id).catch(error =>
          log.error("[profile] cleanup will retry", providerErrorSummary(error))
        );
        return user;
      } catch (error) {
        if (avatarKey)
          await queueMediaDeletion(ctx.user.id, [avatarKey]).catch(
            cleanupError =>
              log.error(
                "[profile] failed upload will retry",
                providerErrorSummary(cleanupError)
              )
          );
        throw error;
      }
    }),

  /** 当前用户是否已设置密码；邮箱链接账号可通过邮件为原账号设置密码。 */
  passwordStatus: protectedProcedure.query(async ({ ctx }) => ({
    hasPassword: await hasCredentialPassword(ctx.user.id),
  })),

  /** 校验输入日期及周岁，保存当前用户的成年确认日期。 */
  confirmAge: protectedProcedure
    .input(
      z.object({
        birthDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const birthDate = new Date(`${input.birthDate}T00:00:00Z`);
      if (
        Number.isNaN(birthDate.getTime()) ||
        birthDate.toISOString().slice(0, 10) !== input.birthDate ||
        birthDate > new Date()
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please enter a valid date of birth.",
        });
      }
      if (yearsSince(birthDate) < 18) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "YUMEI is an 18+ service. You must be at least 18 years old to use it.",
        });
      }
      await setUserBirthDate(ctx.user.id, birthDate);
      return { ok: true as const };
    }),

  /** 撤销数据库会话，并清除普通与 HTTPS 安全前缀的会话 Cookie。 */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (auth) {
      const headers = fromNodeHeaders(ctx.req.headers);
      const response = await auth.api.signOut({ headers, asResponse: true });
      // Better-Auth 的注销入口会捕获删除错误，因此再确认数据库会话已撤销。
      try {
        const remaining = await auth.api.getSession({
          headers,
          query: { disableCookieCache: true },
        });
        if (remaining) throw new Error("Session still active");
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "退出登录尚未完成，请稍后重试。",
        });
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) ctx.res.append("Set-Cookie", cookies);
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    for (const prefix of ["", "__Secure-"]) {
      for (const name of [
        "better-auth.session_token",
        "better-auth.session_data",
      ]) {
        ctx.res.clearCookie(`${prefix}${name}`, {
          ...cookieOptions,
          secure: prefix ? true : cookieOptions.secure,
        });
      }
    }
    return { success: true } as const;
  }),
});
