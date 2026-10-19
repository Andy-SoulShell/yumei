import { z } from "zod";
import { COLOR_MODES, THEME_IDS, UI_LANGUAGES } from "../../shared/preferences";
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
          theme: z.enum(THEME_IDS).optional(),
          colorMode: z.enum(COLOR_MODES).optional(),
        })
        .refine(
          patch => Object.keys(patch).length > 0,
          "At least one preference is required"
        )
    )
    .mutation(({ ctx, input }) => saveInterfacePreferences(ctx.user.id, input)),
});
