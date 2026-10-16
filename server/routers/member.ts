/**
 * Medlemmarna: logga in med e-post (via sajten), se och svara på sina aktiviteter, hantera enheter.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { memberProcedure, publicProcedure, router } from "../_core/trpc";
import { choiceTicket, clearMemberCookie, listDevices, readChoiceTicket, revokeAll, revokeDevice, startMemberSession } from "../memberAuth";
import { memberActivities, memberActivity, memberRespond, playerForMember } from "../activities";
import { listPlayers } from "../playersDb";

// Enkel spärr: högst 10 kodförfrågningar och 20 kontroller per IP och 15 minuter
const hits = new Map<string, { n: number; reset: number }>();
function limited(key: string, max: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + 15 * 60_000 });
    return false;
  }
  h.n++;
  return h.n > max;
}

async function site<T>(path: string, body: unknown): Promise<T> {
  const { siteRequest, integrationConfigured } = await import("../integration");
  if (!integrationConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Inloggningen är inte i drift än" });
  try {
    return await siteRequest<T>("POST", path, body);
  } catch (e) {
    // Sajtens felmeddelande (t.ex. "Koden stämmer inte") visas som det är
    const msg = (e as Error).message;
    throw new TRPCError({ code: "BAD_REQUEST", message: /^Når inte sajten|^Sajten svarade/.test(msg) ? "Inloggningen svarar inte just nu. Försök igen om en stund." : msg });
  }
}

/** Namn på medlemmarna (från deras spelare) – när flera delar e-postadress. */
async function choices(memberIds: number[]) {
  const players = await listPlayers();
  return memberIds.map((id) => ({ memberId: id, name: players.find((p) => p.externalId === String(id))?.name ?? `Medlem ${id}` }));
}

async function finish(req: Parameters<typeof startMemberSession>[0], res: Parameters<typeof startMemberSession>[1], memberIds: number[]) {
  if (memberIds.length === 1) {
    await startMemberSession(req, res, memberIds[0]);
    return { done: true as const };
  }
  return { done: false as const, ticket: await choiceTicket(memberIds), choices: await choices(memberIds) };
}

export const memberRouter = router({
  /** Vem är inloggad (null = ingen medlem) */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.member) return null;
    const p = await playerForMember(ctx.member.memberId);
    return { memberId: ctx.member.memberId, playerId: p?.id ?? null, name: p?.name ?? null };
  }),

  requestCode: publicProcedure.input(z.object({ email: z.string().trim().email().max(200) })).mutation(async ({ ctx, input }) => {
    if (limited(`req:${ctx.req.ip}`, 10)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "För många försök. Vänta en stund." });
    await site("/internal/v1/login/request", { email: input.email });
    return { ok: true };
  }),

  verifyCode: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(200), code: z.string().trim().regex(/^\d{6}$/, "Koden är sex siffror") }))
    .mutation(async ({ ctx, input }) => {
      if (limited(`ver:${ctx.req.ip}`, 20)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "För många försök. Vänta en stund." });
      const r = await site<{ memberIds: number[] }>("/internal/v1/login/verify", input);
      return finish(ctx.req, ctx.res, r.memberIds);
    }),

  verifyLink: publicProcedure.input(z.object({ token: z.string().min(10).max(100) })).mutation(async ({ ctx, input }) => {
    if (limited(`ver:${ctx.req.ip}`, 20)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "För många försök. Vänta en stund." });
    const r = await site<{ memberIds: number[] }>("/internal/v1/login/verify", { token: input.token });
    return finish(ctx.req, ctx.res, r.memberIds);
  }),

  /** Flera medlemmar på samma e-post: välj vem som loggar in. */
  choose: publicProcedure.input(z.object({ ticket: z.string(), memberId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const ids = await readChoiceTicket(input.ticket);
    if (!ids?.includes(input.memberId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Valet har gått ut. Logga in igen." });
    await startMemberSession(ctx.req, ctx.res, input.memberId);
    return { done: true };
  }),

  logout: memberProcedure.mutation(async ({ ctx }) => {
    await revokeDevice(ctx.member.memberId, ctx.member.sid);
    clearMemberCookie(ctx.res);
    return { ok: true };
  }),

  devices: memberProcedure.query(async ({ ctx }) =>
    (await listDevices(ctx.member.memberId)).map((d) => ({ id: d.id, device: d.device, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, current: d.id === ctx.member.sid })),
  ),
  logoutDevice: memberProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await revokeDevice(ctx.member.memberId, input.id);
    if (input.id === ctx.member.sid) clearMemberCookie(ctx.res);
    return { ok: true };
  }),
  logoutAll: memberProcedure.mutation(async ({ ctx }) => {
    const n = await revokeAll(ctx.member.memberId);
    clearMemberCookie(ctx.res);
    return { count: n };
  }),

  activities: memberProcedure.query(async ({ ctx }) => {
    const p = await playerForMember(ctx.member.memberId);
    if (!p) return { linked: false as const, items: [] };
    return { linked: true as const, items: await memberActivities(p.id) };
  }),

  activity: memberProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const p = await playerForMember(ctx.member.memberId);
    if (!p) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Du är inte kopplad till en spelare än. Kontakta styrelsen." });
    try {
      return { ...(await memberActivity(input.id, p.id)), playerId: p.id };
    } catch (e) {
      throw new TRPCError({ code: "NOT_FOUND", message: (e as Error).message });
    }
  }),

  respond: memberProcedure.input(z.object({ id: z.number().int(), status: z.enum(["yes", "no"]) })).mutation(async ({ ctx, input }) => {
    const p = await playerForMember(ctx.member.memberId);
    if (!p) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Du är inte kopplad till en spelare än. Kontakta styrelsen." });
    try {
      return await memberRespond(input.id, p.id, input.status);
    } catch (e) {
      throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
    }
  }),
});
