import { getPublishedProductConfig } from "../repositories/productConfig";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LOCALES } from "../../shared/locales";
import { protectedProcedure, router } from "../_core/trpc";
import { getActiveGirlfriend } from "../repositories/companions";
import {
  createConversation,
  getConversation,
  getConversationsWithLastMessage,
  getMessagePage,
  getUserConversations,
  resumeConversation,
  searchConversations,
} from "../repositories/conversations";

import { deleteConversation } from "../privacy";
export const conversationRouter = router({
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => deleteConversation(ctx.user.id, input.id)),
  /** 校验角色归属后复用最近会话，首次创建通过事务内角色行锁串行化。 */
  resume: protectedProcedure
    .input(
      z.object({
        girlfriendId: z.number().int().positive(),
        locale: z.enum(LOCALES).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await resumeConversation(
        ctx.user.id,
        input.girlfriendId,
        input.locale
      );
      if (!conversation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "角色不存在或已删除",
        });
      return conversation;
    }),
  /** 校验角色归属后显式新建会话。 */
  create: protectedProcedure
    .input(
      z.object({
        girlfriendId: z.number(),
        title: z.string().max(200).optional(),
        locale: z.enum(LOCALES).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const girlfriend = await getActiveGirlfriend(
        ctx.user.id,
        input.girlfriendId
      );
      if (!girlfriend)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "角色不存在或已删除",
        });
      return await createConversation({
        userId: ctx.user.id,
        girlfriendId: girlfriend.id,
        title: input.title,
        locale: input.locale,
      });
    }),

  /** 读取当前用户的全部会话。 */
  list: protectedProcedure.query(async ({ ctx }) => {
    return await getUserConversations(ctx.user.id);
  }),

  /** 读取当前用户会话并补充最近消息及角色信息。 */
  listWithDetails: protectedProcedure
    .input(
      z
        .object({
          cursor: z
            .object({ updatedAt: z.date(), id: z.number().int() })
            .nullish(),
          search: z.string().max(500).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const rules = (await getPublishedProductConfig()).experience.pagination;
      if ((input?.search?.length ?? 0) > rules.maxSearchChars)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "搜索内容超出当前长度限制",
        });
      return await getConversationsWithLastMessage(ctx.user.id, input);
    }),

  /** 按用户归属读取单个会话。 */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return await getConversation(input.id, ctx.user.id);
    }),

  /** 校验会话归属后读取其全部消息。 */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        cursor: z.number().int().nullish(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!(await getConversation(input.conversationId, ctx.user.id))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Conversation not found or not owned by current user",
        });
      }
      return await getMessagePage(
        input.conversationId,
        input.cursor,
        input.limit ??
          (await getPublishedProductConfig()).experience.pagination.messages
      );
    }),

  /** 按当前用户归属返回关键词命中的会话信息。 */
  search: protectedProcedure
    .input(
      z.object({
        keyword: z.string().min(1).max(500),
        cursor: z.number().int().nullish(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const rules = (await getPublishedProductConfig()).experience.pagination;
      if (input.keyword.length > rules.maxSearchChars)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "搜索内容超出当前长度限制",
        });
      return await searchConversations(
        ctx.user.id,
        input.keyword,
        input.cursor,
        input.limit ?? rules.search
      );
    }),
});
