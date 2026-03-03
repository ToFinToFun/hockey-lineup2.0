import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { fetchAttendance, updateAttendance, type AttendingStatus } from "./lagetSe";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  laget: router({
    /** Hämta anmälningslistan från laget.se för dagens/nästa event */
    attendance: publicProcedure.query(async () => {
      const result = await fetchAttendance();
      return result;
    }),

    /** Ändra en spelares deltagarstatus på laget.se */
    updateAttendance: publicProcedure
      .input(
        z.object({
          playerName: z.string().min(1),
          status: z.enum(["Attending", "NotAttending", "NotAnswered"]),
        })
      )
      .mutation(async ({ input }) => {
        const result = await updateAttendance(
          input.playerName,
          input.status as AttendingStatus
        );
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
