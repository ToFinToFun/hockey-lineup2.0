/**
 * Matcher mot andra lag spelas inte alltid på våra tider i laget.se (t.ex.
 * bortamatcher). Har uppställningen egen dag/tid/plats (Lineup → Match) gäller
 * de i stället för laget.se-evenemangets – för nyheten, Score Tracker,
 * matchens plats och allt annat som läser "nästa evenemang".
 * Anmälningarna kommer fortfarande från laget.se.
 */
import { getLineupSnapshot } from "./lineupSync";
import { getOpponent } from "./opponents";
import type { MatchSetup } from "../shared/matchSetup";

export interface EventFields { eventTitle?: string; eventDate?: string; eventTime?: string; eventLocation?: string; noEvent?: boolean }

/** Ren funktion (exporteras för test): lägger matchens egna dag/tid/plats över evenemanget */
export function applyExternalEvent<T extends EventFields>(att: T, setup: MatchSetup | null | undefined, opponentName: string | null): T {
  if (setup?.mode !== "external") return att;
  const hasOwn = !!(setup.date || setup.time || setup.location);
  if (!hasOwn) return att;
  const date = setup.date ?? att.eventDate;
  return {
    ...att,
    eventDate: date,
    eventTime: setup.time ?? (setup.date && setup.date !== att.eventDate ? undefined : att.eventTime),
    eventLocation: setup.location ?? (setup.date && setup.date !== att.eventDate ? undefined : att.eventLocation),
    eventTitle: opponentName ? `Match mot ${opponentName}` : att.eventTitle,
    noEvent: date ? false : att.noEvent,
  };
}

export async function withExternalEvent<T extends EventFields>(att: T): Promise<T> {
  try {
    const { doc } = await getLineupSnapshot();
    const setup = doc.setup;
    if (setup?.mode !== "external") return att;
    const opp = setup.opponentId ? await getOpponent(setup.opponentId).catch(() => null) : null;
    return applyExternalEvent(att, setup, opp?.name ?? null);
  } catch {
    return att;
  }
}
