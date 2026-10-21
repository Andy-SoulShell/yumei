/** 套餐、姿势和亲密度规则的公开读取与管理员草稿发布 API。 */
import { z } from "zod";
import { productConfigSchema } from "../../shared/productConfig";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  editProductConfig,
  getProductConfigDraft,
  getPublishedProductConfig,
} from "../repositories/productConfig";

export const productConfigRouter = router({
  get: publicProcedure.query(() => getPublishedProductConfig()),
  admin: router({
    getDraft: adminProcedure.query(() => getProductConfigDraft()),
    save: adminProcedure
      .input(
        z
          .object({
            expectedRevision: z.number().int().positive(),
            config: productConfigSchema,
          })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        editProductConfig(ctx.user.id, input.expectedRevision, input.config)
      ),
    publish: adminProcedure
      .input(
        z.object({ expectedRevision: z.number().int().positive() }).strict()
      )
      .mutation(({ ctx, input }) =>
        editProductConfig(ctx.user.id, input.expectedRevision)
      ),
  }),
});
