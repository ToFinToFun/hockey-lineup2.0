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
  if (!ctx.session) {
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
