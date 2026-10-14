import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "./trpc";
import { getDatabaseInfo } from "../dbInfo";
import { integrationStatus, pingSite } from "../integration";

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

  /** Synkstatus mot sajten (styrelsen). Bara visning och test. */
  integration: adminProcedure.query(() => integrationStatus()),
  integrationPing: adminProcedure.mutation(() => pingSite()),
});
