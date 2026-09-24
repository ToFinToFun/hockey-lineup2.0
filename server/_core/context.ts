import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { readSession, type Session } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  session: Session;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    session: await readSession(opts.req),
  };
}
