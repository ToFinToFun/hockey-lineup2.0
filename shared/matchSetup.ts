/**
 * Matchtyp för uppställningen (steg 4 i docs/PLAN-lag-och-motstandare.md).
 *
 * - internal: två egna lag (som alltid tidigare)
 * - external: vårt lag (alltid lag A) mot en motståndare (lag B)
 *
 * Motståndarens spelare har id "opp-<id>" och hör aldrig hemma i vår trupp
 * eller vårt spelarregister.
 */
export type OurLogo = "club" | "white" | "green";

export interface MatchSetup {
  mode: "internal" | "external";
  /** Motståndarlaget (opponents.id) när mode = external */
  opponentId: number | null;
  /** Vårt lags namn i externa matcher (standard: klubbens namn) */
  ourName: string | null;
  /** Vårt lags logga i externa matcher */
  ourLogo: OurLogo;
}

export const INTERNAL_SETUP: MatchSetup = { mode: "internal", opponentId: null, ourName: null, ourLogo: "club" };

export const OPP_PREFIX = "opp-";
export const isOpponentPlayerId = (id: string | undefined | null) => !!id && id.startsWith(OPP_PREFIX);
export const opponentPlayerId = (id: number) => `${OPP_PREFIX}${id}`;
export const opponentPlayerDbId = (id: string) => Number(id.slice(OPP_PREFIX.length));

export function normalizeSetup(s: Partial<MatchSetup> | null | undefined): MatchSetup {
  if (!s || s.mode !== "external") return INTERNAL_SETUP;
  return { mode: "external", opponentId: s.opponentId ?? null, ourName: s.ourName ?? null, ourLogo: s.ourLogo ?? "club" };
}
