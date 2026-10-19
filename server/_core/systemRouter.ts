import { z } from "zod";
import { publicProcedure, router } from "./trpc";

// The Manus notifyOwner route was removed in M1-3 along with the rest of
// the Forge integrations. Health stays for probes (expanded in M1-5).
export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),
});
