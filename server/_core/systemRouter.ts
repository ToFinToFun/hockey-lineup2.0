import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "./trpc";
import { getDatabaseInfo } from "../dbInfo";

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

  /** Vilken databas appen använder och vad den innehåller (styrelsen). */
  database: adminProcedure.query(() => getDatabaseInfo()),
});
