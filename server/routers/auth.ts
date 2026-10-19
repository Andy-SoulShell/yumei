import { TRPCError } from "@trpc/server";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { auth } from "../_core/auth";
import { getSessionCookieOptions } from "../_core/cookies";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { setUserBirthDate } from "../repositories/users";
import { yearsSince } from "./guards";

export const authRouter = router({
  /** 返回上下文中已解析的应用用户，未登录时返回 null。 */
  me: publicProcedure.query(opts => opts.ctx.user),

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
