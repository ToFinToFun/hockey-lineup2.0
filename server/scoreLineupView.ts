/**
 * Vad Score Tracker visar för den som inte är inloggad:
 *
 *  - Publicerat lag (nyheten ute; tidsinställd räknas från den inställda tiden)
 *    → bara det laget, "Publicerat tis 18:30".
 *  - Tidsinställd nyhet som inte gått ut → "Laget publiceras tis 18:30".
 *  - Ingen nyhet och 75 min (eller mindre) kvar till matchstart → uppställningen
 *    live från Lineup.
 *  - Annars → "Inget lag publicerat än" (med när det visas).
 *
 * Inloggade (styrelsen, Lineup-länk) ser som tidigare alltid laget.
 */
import { publishedTime, type LineupLock } from "./lineupLock";

export const SCORE_LIVE_MINUTES = 75;

export type ScoreLineupView =
  | { mode: "published"; publishedAt: string }
  | { mode: "scheduled"; publishAt: string }
  | { mode: "live" }
  | { mode: "hidden"; showFrom: string | null };

export function scoreLineupView(lock: LineupLock | null, start: Date | null, now = new Date()): ScoreLineupView {
  if (lock) {
    const at = publishedTime(lock);
    return at.getTime() <= now.getTime() ? { mode: "published", publishedAt: at.toISOString() } : { mode: "scheduled", publishAt: at.toISOString() };
  }
  if (start) {
    const from = new Date(start.getTime() - SCORE_LIVE_MINUTES * 60_000);
    if (now.getTime() >= from.getTime()) return { mode: "live" };
    return { mode: "hidden", showFrom: from.toISOString() };
  }
  return { mode: "hidden", showFrom: null };
}
