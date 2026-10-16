import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { readSession, type Session } from "../auth";
import { readMember, type MemberSession } from "../memberAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  session: Session;
  /** Inloggad medlem (egen kaka, skild från styrelsens session) */
  member: MemberSession;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    session: await readSession(opts.req),
    member: await readMember(opts.req),
  };
}
