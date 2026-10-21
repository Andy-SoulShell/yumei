import { z } from "zod";
import { COLOR_MODES, UI_LANGUAGES } from "../../shared/preferences";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getInterfacePreferences,
  saveInterfacePreferences,
} from "../preferences";

export const preferencesRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    getInterfacePreferences(ctx.user.id)
  ),
  update: protectedProcedure
    .input(
      z
        .object({
          language: z.enum(UI_LANGUAGES).optional(),
          theme: z.string().min(1).max(100).optional(),
          colorMode: z.enum(COLOR_MODES).optional(),
        })
        .refine(
          patch => Object.keys(patch).length > 0,
          "At least one preference is required"
        )
    )
    .mutation(({ ctx, input }) => saveInterfacePreferences(ctx.user.id, input)),
});
