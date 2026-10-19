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
import { listGrants, removeGrant, setGrant } from "../grants";
import { listPlayers } from "../playersDb";
import { boardMembers, playerForMember } from "../activities";
import { ENV } from "../_core/env";

/** Vem som gav en behörighet: medlemmens namn, annars hur man var inloggad. */
async function grantedByName(s: { via?: string; memberId?: number } | null) {
  if (s?.memberId) return (await playerForMember(s.memberId))?.name ?? `Medlem ${s.memberId}`;
  return s?.via === "password" ? "Styrelsens lösenord" : "Okänd";
}

export const authRouter = router({
  /** Vem är inloggad? null = ingen (bara score tracker). */
  me: publicProcedure.query(({ ctx }) => ctx.session),

  /** Vad som är öppet utan inloggning (Live, Score Tracker) */
  publicAccess: publicProcedure.query(async () => (await import("../publicAccess")).getPublicAccess()),
  setPublicAccess: adminProcedure.input(z.object({ live: z.boolean(), score: z.boolean() })).mutation(async ({ input }) => {
    await (await import("../publicAccess")).setPublicAccess(input);
    return input;
  }),

  /** Finns styrelsens lösenord kvar (variabeln satt)? Annars visas bara medlemsinloggningen. */
  loginOptions: publicProcedure.query(() => ({ password: !!ENV.adminPassword })),

  // ─── Behörigheter per medlem (Inställningar → Åtkomst) ───
  grants: adminProcedure.query(async () => {
    const [grants, players, board] = await Promise.all([listGrants(), listPlayers(), boardMembers()]);
    const nameOf = (id: number) => players.find((p) => p.externalId === String(id))?.name ?? null;
    const admins = new Set(grants.filter((g) => g.admin).map((g) => g.memberId));
    return {
      grants: grants
        .map((g) => ({ ...g, name: nameOf(g.memberId) ?? `Medlem ${g.memberId}` }))
        .sort((a, b) => Number(b.admin) - Number(a.admin) || a.name.localeCompare(b.name, "sv")),
      // Kontroll mot Organisation: styrelsen enligt sajten jämfört med de som har Admin
      board: {
        missingAdmin: board.memberIds.filter((id) => !admins.has(id)).map((id) => ({ memberId: id, name: nameOf(id) })),
        adminNotBoard: [...admins].filter((id) => !board.memberIds.includes(id)).map((id) => nameOf(id) ?? `Medlem ${id}`),
        unmatched: board.unmatched,
        error: board.error,
      },
    };
  }),
  setGrant: adminProcedure
    .input(z.object({ memberId: z.number().int().positive(), admin: z.boolean(), modules: z.array(z.string().max(30)).max(20) }))
    .mutation(async ({ ctx, input }) => {
      // Man kan inte ta Admin från sig själv (risk att låsa ute sig)
      if (ctx.session?.memberId === input.memberId && !input.admin) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Du kan inte ta bort din egen Admin. Be en annan admin." });
      }
      await setGrant(input.memberId, input, await grantedByName(ctx.session));
      return { ok: true };
    }),
  removeGrant: adminProcedure.input(z.object({ memberId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.session?.memberId === input.memberId) throw new TRPCError({ code: "BAD_REQUEST", message: "Du kan inte ta bort din egen Admin. Be en annan admin." });
    await removeGrant(input.memberId);
    return { ok: true };
  }),

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

  /** Loggar ut lösenordet/länken. Medlemmens inloggning loggas ut via member.logout. */
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
