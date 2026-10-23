import { z } from "zod";
import { LOCALES } from "../../shared/locales";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  deleteAccount,
  deletionEligibility,
  deletionStatus,
  exportAccountData,
  requestAccountDeletion,
} from "../privacy";
const token = z.string().regex(/^[a-f0-9]{48}$/);
export const privacyRouter = router({
  export: protectedProcedure.mutation(async ({ ctx }) => {
    ctx.res.setHeader?.("Cache-Control", "no-store");
    return exportAccountData(ctx.user.id);
  }),
  eligibility: protectedProcedure.query(({ ctx }) =>
    deletionEligibility(ctx.user.id)
  ),
  requestDeletion: protectedProcedure
    .input(z.object({ locale: z.enum(LOCALES) }))
    .mutation(({ ctx, input }) =>
      requestAccountDeletion(ctx.user.id, input.locale)
    ),
  deleteAccount: protectedProcedure
    .input(
      z.object({
        token,
        email: z.string().email(),
        confirm: z.literal("DELETE"),
      })
    )
    .mutation(({ ctx, input }) =>
      deleteAccount(ctx.user.id, input.token, input.email)
    ),
  deletionStatus: publicProcedure
    .input(z.object({ token }))
    .query(async ({ ctx, input }) => {
      ctx.res.setHeader?.("Cache-Control", "no-store");
      return deletionStatus(input.token);
    }),
});
