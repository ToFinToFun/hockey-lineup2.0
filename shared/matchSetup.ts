/**
 * Matchtyp för uppställningen (steg 4 i docs/PLAN-lag-och-motstandare.md).
 *
 * - internal: två egna lag (som alltid tidigare)
 * - external: vårt lag (alltid lag A) mot en motståndare (lag B)
 *
 * Motståndarens spelare har id "opp-<id>" och hör aldrig hemma i vår trupp
 * eller vårt spelarregister.
 */
/** Vårt lags logga mot andra lag: ett av de interna lagens eller klubbmärket (städet). "club" = äldre val, samma som klubbens logga. */
export type OurLogo = "club" | "white" | "green" | "crest";

export interface MatchSetup {
  mode: "internal" | "external";
  /** Motståndarlaget (opponents.id) när mode = external */
  opponentId: number | null;
  /** Vårt lags namn i externa matcher (standard: klubbens namn) */
  ourName: string | null;
  /** Vårt lags logga i externa matcher */
  ourLogo: OurLogo;
  /** Externa matcher: egen dag och tid (annars laget.se:s evenemang), "YYYY-MM-DD" och "HH:MM" */
  date?: string | null;
  time?: string | null;
  /** Externa matcher: egen plats (t.ex. bortamatch) */
  location?: string | null;
  /**
   * Motståndaren som lista: vilka av lagets sparade spelare (opponent_players.id)
   * som är med, utan platser. null/saknas = vanlig uppställning med platser.
   */
  oppList?: number[] | null;
}

export const INTERNAL_SETUP: MatchSetup = { mode: "internal", opponentId: null, ourName: null, ourLogo: "club", date: null, time: null, location: null, oppList: null };

/** Vårt lags logga mot andra lag */
export function ourLogoFor(setup: Pick<MatchSetup, "ourLogo"> | null | undefined, c: { logo: string; crest?: { url: string }; teams: { white: { logo: string }; green: { logo: string } } }): string {
  switch (setup?.ourLogo) {
    case "white": return c.teams.white.logo;
    case "green": return c.teams.green.logo;
    case "crest": return c.crest?.url ?? c.logo;
    default: return c.logo;
  }
}

export const OPP_PREFIX = "opp-";
export const isOpponentPlayerId = (id: string | undefined | null) => !!id && id.startsWith(OPP_PREFIX);
export const opponentPlayerId = (id: number) => `${OPP_PREFIX}${id}`;
export const opponentPlayerDbId = (id: string) => Number(id.slice(OPP_PREFIX.length));

export function normalizeSetup(s: Partial<MatchSetup> | null | undefined): MatchSetup {
  if (!s || s.mode !== "external") return INTERNAL_SETUP;
  const date = typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : null;
  const time = typeof s.time === "string" && /^\d{1,2}:\d{2}$/.test(s.time) ? s.time : null;
  const location = typeof s.location === "string" && s.location.trim() ? s.location.trim().slice(0, 100) : null;
  const oppList = Array.isArray(s.oppList) ? [...new Set(s.oppList.filter((x) => Number.isInteger(x) && x > 0))].slice(0, 60) : null;
  return { mode: "external", opponentId: s.opponentId ?? null, ourName: s.ourName ?? null, ourLogo: s.ourLogo ?? "club", date, time, location, oppList };
}
