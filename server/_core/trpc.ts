import type { AccessModule } from "../../shared/accessModules";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { canLineup, hasModule, isAdmin } from "../auth";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

/** Öppet för alla (score tracker). */
export const publicProcedure = t.procedure;

/** Styrelsen eller den som har en giltig tillfällig länk. */
export const lineupProcedure = t.procedure.use(({ ctx, next }) => {
  // Admin, gammal Lineup-länk, eller länk/medlem med Lineup
  if (!canLineup(ctx.session)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Inloggning krävs" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/** Admin (lösenordet eller medlem med Admin). */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Kräver Admin" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});


/**
 * Styrelsen eller en delad länk med någon av modulerna (shared/accessModules.ts).
 * Används för det modulerna behöver; borttagningar och inställningar har kvar adminProcedure.
 */
export const moduleProcedure = (...modules: AccessModule[]) => t.procedure.use(({ ctx, next }) => {
  const s = ctx.session;
  if (!hasModule(s, ...modules)) throw new TRPCError({ code: "FORBIDDEN", message: "Du har inte behörighet till det här" });
  return next({ ctx: { ...ctx, session: s! } });
});

/** Lineup (styrelsen eller Lineup-länk) eller en delad länk med någon av modulerna – för läsning som modulerna delar */
export const lineupOrModuleProcedure = (...modules: AccessModule[]) => t.procedure.use(({ ctx, next }) => {
  const s = ctx.session;
  const ok = canLineup(s) || hasModule(s, ...modules);
  if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Inloggning krävs" });
  return next({ ctx: { ...ctx, session: s! } });
});

/** Inloggad medlem (e-post via sajten). Ger bara medlemmens egna aktiviteter och svar. */
export const memberProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.member) throw new TRPCError({ code: "UNAUTHORIZED", message: "Logga in som medlem" });
  return next({ ctx: { ...ctx, member: ctx.member } });
});

/** Score Tracker: öppen för alla, eller bara inloggade (Inställningar → Åtkomst). */
export const scoreProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { canScore } = await import("../publicAccess");
  if (!(await canScore(ctx.session, ctx.member))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Logga in för att använda Score Tracker" });
  return next();
});

/** Live: öppen för alla, eller bara inloggade (Inställningar → Åtkomst). */
export const liveProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { canLive } = await import("../publicAccess");
  if (!(await canLive(ctx.session, ctx.member))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Logga in för att följa Live" });
  return next();
});

/** Sända Live från Score Tracker: Lineup (Admin, Lineup-länk/-behörighet) eller behörigheten Score Tracker. */
export const broadcastProcedure = t.procedure.use(({ ctx, next }) => {
  if (!canLineup(ctx.session) && !ctx.session?.modules?.includes("score")) throw new TRPCError({ code: "UNAUTHORIZED", message: "Inloggning krävs" });
  return next({ ctx: { ...ctx, session: ctx.session! } });
});
