import type { AccessModule } from "../../shared/accessModules";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

/** Öppet för alla (score tracker). */
export const publicProcedure = t.procedure;

/** Styrelsen eller den som har en giltig tillfällig länk. */
export const lineupProcedure = t.procedure.use(({ ctx, next }) => {
  // Delade modullänkar ("access") ger aldrig Lineup
  if (!ctx.session || ctx.session.role === "access") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Inloggning krävs" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/** Endast styrelsen. */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.session?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Endast styrelsen" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});


/**
 * Styrelsen eller en delad länk med någon av modulerna (shared/accessModules.ts).
 * Används för det modulerna behöver; borttagningar och inställningar har kvar adminProcedure.
 */
export const moduleProcedure = (...modules: AccessModule[]) => t.procedure.use(({ ctx, next }) => {
  const s = ctx.session;
  const ok = s?.role === "admin" || (s?.role === "access" && modules.some((m) => s.modules?.includes(m)));
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Endast styrelsen" });
  return next({ ctx: { ...ctx, session: s! } });
});

/** Lineup (styrelsen eller Lineup-länk) eller en delad länk med någon av modulerna – för läsning som modulerna delar */
export const lineupOrModuleProcedure = (...modules: AccessModule[]) => t.procedure.use(({ ctx, next }) => {
  const s = ctx.session;
  const ok = s?.role === "admin" || s?.role === "lineup" || (s?.role === "access" && modules.some((m) => s.modules?.includes(m)));
  if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Inloggning krävs" });
  return next({ ctx: { ...ctx, session: s! } });
});
