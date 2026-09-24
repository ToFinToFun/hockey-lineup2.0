import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import {
  checkAdminPassword,
  clearSessionCookie,
  createInviteToken,
  loginRateLimited,
  redeemInvite,
  revokeAllInvites,
  startAdminSession,
} from "../auth";

export const authRouter = router({
  /** Vem är inloggad? null = ingen (bara score tracker). */
  me: publicProcedure.query(({ ctx }) => ctx.session),

  /** Styrelseinloggning med ADMIN_PASSWORD. */
  login: publicProcedure
    .input(z.object({ password: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      if (loginRateLimited(ctx.req.ip ?? "okänd")) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "För många försök, vänta en stund" });
      }
      if (!checkAdminPassword(input.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Fel lösenord" });
      }
      await startAdminSession(ctx.res);
      return { role: "admin" as const };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    clearSessionCookie(ctx.res);
    return { success: true };
  }),

  /** Öppna en tillfällig länk (24 h). */
  redeemInvite: publicProcedure
    .input(z.object({ token: z.string().min(10).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const result = await redeemInvite(ctx.res, input.token);
      if (!result) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Länken är ogiltig eller har gått ut" });
      }
      return result;
    }),

  /** Skapa en tillfällig länk för att bygga uppställningar. */
  createInvite: adminProcedure.mutation(async () => {
    return createInviteToken();
  }),

  /** Gör alla utskickade länkar (och sessioner från dem) ogiltiga. */
  revokeInvites: adminProcedure.mutation(async () => {
    await revokeAllInvites();
    return { success: true };
  }),
});
