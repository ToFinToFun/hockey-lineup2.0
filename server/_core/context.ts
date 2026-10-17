import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Session } from "../auth";
import type { MemberSession } from "../memberAuth";
import { effectiveSession } from "../session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** Det man får göra: lösenord, länk eller medlemmens behörighet (server/session.ts) */
  session: Session;
  /** Inloggad medlem (egen kaka) */
  member: MemberSession;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const { session, member } = await effectiveSession(opts.req);
  return { req: opts.req, res: opts.res, session, member };
}
