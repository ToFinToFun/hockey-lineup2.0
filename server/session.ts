/**
 * Sessionen som gäller för ett anrop: kakan (lösenord eller länk) ihopslagen med den
 * inloggade medlemmens behörighet (server/grants.ts). Används av tRPC och REST-routerna.
 */
import type { Request } from "express";
import { mergeSessions, readSession, type Session } from "./auth";
import { readMember, type MemberSession } from "./memberAuth";
import { getGrant, touchGrant } from "./grants";

export async function effectiveSession(req: Request): Promise<{ session: Session; member: MemberSession }> {
  const [cookie, member] = await Promise.all([readSession(req), readMember(req)]);
  const grant = member ? await getGrant(member.memberId).catch(() => null) : null;
  if (grant) touchGrant(grant.memberId);
  return { session: mergeSessions(cookie, grant), member };
}
