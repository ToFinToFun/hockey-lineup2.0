/** Vem som får se PIR – styrelsen alltid, övriga bara om styrelsen öppnat det. */
import { canLineup, hasModule, isAdmin, type Session } from "./auth";
import type { PirVisibility } from "./pirConfig";

export function pirAllowed(session: Session, visibility: PirVisibility): boolean {
  if (isAdmin(session)) return true;
  if (visibility !== "access") return false;
  return canLineup(session) || hasModule(session, "stats", "cards", "players");
}
