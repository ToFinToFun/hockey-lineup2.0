/**
 * SHL från en extern källa (Highlightly hockey-API): tabell och matcher i en
 * form som tidningen (Stålbladet) och senare andra delar av appen kan använda.
 * Rena funktioner – hämtning, nyckel och anropsräkning finns i server/externalSources.ts.
 */

export interface ShlStandingRow { pos: number; team: string; gp: number; w: number; otw: number; otl: number; l: number; gf: number; ga: number; pts: number }
export interface ShlMatch { id: number; date: string; home: string; away: string; homeScore: number | null; awayScore: number | null; status: "scheduled" | "live" | "finished" | "other"; statusText: string }

export interface ShlCache {
  /** Tabellen (null tills den hämtats första gången) */
  table: { season: number; rows: ShlStandingRow[]; fetchedAt: string } | null;
  /** Matcher runt dagens datum (igår, idag, i morgon) */
  matches: { rows: ShlMatch[]; fetchedAt: string } | null;
}

/** Svenska lagnamn utan föreningsändelse, med å/ä/ö (källan kan sakna dem) */
const NAMES: Array<[RegExp, string]> = [
  [/lule[aå]/i, "Luleå"], [/fr[oö]lunda/i, "Frölunda"], [/skellefte[aå]/i, "Skellefteå"], [/f[aä]rjestad/i, "Färjestad"],
  [/v[aä]xj[oö]/i, "Växjö"], [/r[oö]gle/i, "Rögle"], [/bryn[aä]s/i, "Brynäs"], [/link[oö]ping/i, "Linköping"],
  [/[oö]rebro/i, "Örebro"], [/hv\s*71/i, "HV71"], [/malm[oö]/i, "Malmö"], [/leksand/i, "Leksand"],
  [/djurg[aå]rden/i, "Djurgården"], [/timr[aå]/i, "Timrå"], [/modo/i, "Modo"], [/aik\b(?!.*skellefte)/i, "AIK"],
  [/s[oö]dert[aä]lje/i, "Södertälje"], [/mora/i, "Mora"], [/oskarshamn/i, "Oskarshamn"], [/v[aä]ster[aå]s/i, "Västerås"],
  [/bj[oö]rkl[oö]ven/i, "Björklöven"], [/karlskrona/i, "Karlskrona"], [/almtuna/i, "Almtuna"], [/tingsryd/i, "Tingsryd"],
];
export function shortTeam(name: string): string {
  for (const [re, n] of NAMES) if (re.test(name)) return n;
  return name.replace(/\s+(HC|HF|IF|IK|BK|SK|Hockey)$/i, "").trim();
}

/**
 * Poäng som i SHL: 3 för seger, 2 för seger efter förlängning/straffar, 1 för
 * förlust efter förlängning/straffar. Källans "wins" kan vara med eller utan
 * övertidssegrar – avgörs av att summan ska bli antalet matcher.
 */
export function standingRow(r: { position: number; team: { name: string }; gamesPlayed: number; wins: number; loses: number; winsOvertime: number; losesOvertime: number; scoredGoals: number; receivedGoals: number }): ShlStandingRow {
  const winsIncludeOt = r.wins + r.loses === r.gamesPlayed && r.winsOvertime + r.losesOvertime > 0;
  const w = winsIncludeOt ? r.wins - r.winsOvertime : r.wins;
  const l = winsIncludeOt ? r.loses - r.losesOvertime : r.loses;
  return { pos: r.position, team: shortTeam(r.team.name), gp: r.gamesPlayed, w, otw: r.winsOvertime, otl: r.losesOvertime, l, gf: r.scoredGoals, ga: r.receivedGoals, pts: 3 * w + 2 * r.winsOvertime + r.losesOvertime };
}

const LIVE = /period|over ?time|penalties|break/i;
export function matchRow(m: { id: number; date: string; homeTeam: { name: string }; awayTeam: { name: string }; state: { description: string; score?: { current?: string | null } } }): ShlMatch {
  const desc = m.state?.description ?? "";
  const status: ShlMatch["status"] = /^finished/i.test(desc) ? "finished" : /not started|to be announced/i.test(desc) ? "scheduled" : LIVE.test(desc) ? "live" : "other";
  const sc = m.state?.score?.current?.match(/(\d+)\s*[-–:]\s*(\d+)/);
  return { id: m.id, date: m.date, home: shortTeam(m.homeTeam.name), away: shortTeam(m.awayTeam.name), homeScore: sc ? Number(sc[1]) : null, awayScore: sc ? Number(sc[2]) : null, status, statusText: desc };
}

/** Säsongen i källan: SHL 2026/27 heter 2026 (säsongen börjar i september) */
export function shlSeason(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export interface UsageState { day: string; calls: number; remaining: number | null }

/**
 * Får vi göra ett anrop till? Under taket för dygnet (standard 90 av 100) och
 * inte när källan själv säger att det bara finns ett fåtal kvar.
 */
export function canCall(u: UsageState, today: string, cap: number): boolean {
  if (u.day !== today) return true;
  if (u.calls >= cap) return false;
  if (u.remaining != null && u.remaining <= 3) return false;
  return true;
}

/**
 * Hur gammal datan får vara innan nästa hämtning (minuter). Tabellen var 30:e
 * minut dagtid, matcherna var 10:e minut när en SHL-match pågår eller strax ska
 * börja, annars var tredje timme. Natten (00–07) vilar.
 */
export function refreshAfter(kind: "table" | "matches", hourLocal: number, matches: ShlMatch[], now: Date): number {
  if (hourLocal < 7) return 24 * 60;
  const liveOrSoon = matches.some((m) => m.status === "live" || (m.status === "scheduled" && Math.abs(+new Date(m.date) - +now) < 30 * 60_000));
  if (kind === "matches") return liveOrSoon ? 10 : 180;
  return liveOrSoon ? 30 : 60;
}
