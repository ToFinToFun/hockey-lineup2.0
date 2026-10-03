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
  listActiveInvites,
  revokeInvite,
  startAdminSession,
  accessLinkToken,
  redeemAccessLink,
} from "../auth";
import { createAccessLink, listAccessLinks, updateAccessLink, revokeAccessLink } from "../accessLinks";

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
  createInvite: adminProcedure
    .input(z.object({ label: z.string().max(60).optional() }).optional())
    .mutation(async ({ input }) => createInviteToken(input?.label ?? "")),

  /** Aktiva länkar (inte utgångna eller återkallade), nyast först. */
  listInvites: adminProcedure.query(async () =>
    (await listActiveInvites()).map(({ id, label, token, createdAt, expiresAt, uses }) => ({ id, label, token, createdAt, expiresAt, uses }))
  ),

  /** Återkalla en enskild länk (och sessionerna den gett). */
  revokeInvite: adminProcedure
    .input(z.object({ id: z.string().max(20) }))
    .mutation(async ({ input }) => {
      await revokeInvite(input.id);
      return { success: true };
    }),

  // ─── Delade länkar med moduler (Inställningar → Åtkomst) ───
  /** Öppna en delad länk: ger en session med länkens moduler. */
  redeemAccess: publicProcedure
    .input(z.object({ token: z.string().min(10).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const r = await redeemAccessLink(ctx.res, input.token);
      if (!r) throw new TRPCError({ code: "UNAUTHORIZED", message: "Länken är ogiltig, återkallad eller har gått ut" });
      return r;
    }),
  accessLinks: adminProcedure.query(async () =>
    Promise.all((await listAccessLinks()).map(async (l) => ({ ...l, token: await accessLinkToken(l.id) })))
  ),
  createAccessLink: adminProcedure
    .input(z.object({ name: z.string().trim().min(1).max(60), modules: z.array(z.string()).min(1).max(10), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }))
    .mutation(async ({ input }) => {
      const l = await createAccessLink(input);
      return { ...l, token: await accessLinkToken(l.id) };
    }),
  updateAccessLink: adminProcedure
    .input(z.object({ id: z.string().max(40), name: z.string().trim().min(1).max(60).optional(), modules: z.array(z.string()).min(1).max(10).optional(), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }))
    .mutation(async ({ input }) => {
      try { return await updateAccessLink(input.id, input); } catch (e) { throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message }); }
    }),
  revokeAccessLink: adminProcedure.input(z.object({ id: z.string().max(40) })).mutation(async ({ input }) => {
    await revokeAccessLink(input.id);
    return { success: true };
  }),

  /** Gör alla utskickade länkar (och sessioner från dem) ogiltiga. */
  revokeInvites: adminProcedure.mutation(async () => {
    await revokeAllInvites();
    return { success: true };
  }),
});
