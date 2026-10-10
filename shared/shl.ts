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

/** Laget tidningen följer extra (klubben finns i Luleå) */
export const FOCUS_TEAM = "Luleå";
export const isFocus = (team: string) => team === FOCUS_TEAM;

export interface FocusSummary {
  team: string;
  last: ShlMatch | null;
  next: ShlMatch | null;
  /** Senaste fem (äldst först): V = vinst, F = förlust (efter förl./straffar: "V*"/"F*") */
  form: Array<"V" | "F">;
  pos: number | null;
  pts: number | null;
  gp: number | null;
}

/**
 * Lagets senaste och nästa match, formen och tabellplatsen. Dagens matcher
 * (tätare uppdaterade) går före säsongens schema för samma match.
 */
export function focusSummary(season: ShlMatch[], today: ShlMatch[], table: ShlStandingRow[] | null | undefined, team = FOCUS_TEAM, now = new Date()): FocusSummary {
  const byId = new Map<number, ShlMatch>();
  for (const m of season) if (m.home === team || m.away === team) byId.set(m.id, m);
  for (const m of today) if (m.home === team || m.away === team) byId.set(m.id, m);
  const games = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  const played = games.filter((m) => m.status === "finished" && m.homeScore != null);
  const live = games.find((m) => m.status === "live") ?? null;
  const upcoming = games.filter((m) => m.status === "scheduled" && +new Date(m.date) > +now - 3 * 3600_000);
  const won = (m: ShlMatch) => (m.home === team ? m.homeScore! > m.awayScore! : m.awayScore! > m.homeScore!);
  const row = table?.find((r) => r.team === team);
  return {
    team,
    last: live ?? played[played.length - 1] ?? null,
    next: upcoming[0] ?? null,
    form: played.slice(-5).map((m) => (won(m) ? "V" : "F")),
    pos: row?.pos ?? null, pts: row?.pts ?? null, gp: row?.gp ?? null,
  };
}

/** Senaste omgången: alla färdigspelade matcher den senaste dagen det spelades */
export function lastRound(season: ShlMatch[], dayOf: (iso: string) => string): { day: string; rows: ShlMatch[] } | null {
  const done = season.filter((m) => m.status === "finished");
  if (!done.length) return null;
  const day = done.map((m) => dayOf(m.date)).sort().pop()!;
  return { day, rows: season.filter((m) => dayOf(m.date) === day).sort((a, b) => a.date.localeCompare(b.date)) };
}

/** Lag i Norrbotten (för rutan "Hockey i Norrbotten" – Hockeyallsvenskan, SDHL m.fl.) */
export const NORRBOTTEN = /lule|boden|pite|kalix|kiruna|älvsby|alvsby|haparanda|gällivare|gallivare/i;

export interface LocalTeamRow { league: string; team: string; last: ShlMatch | null; next: ShlMatch | null }

/** Senaste (eller pågående) och nästa match för varje Norrbottenslag i en serie */
export function localTeams(matches: ShlMatch[], league: string, now = new Date()): LocalTeamRow[] {
  const teams = new Set<string>();
  for (const m of matches) for (const t of [m.home, m.away]) if (NORRBOTTEN.test(t)) teams.add(t);
  return [...teams].sort((a, b) => a.localeCompare(b, "sv")).map((team) => {
    const games = matches.filter((m) => m.home === team || m.away === team).sort((a, b) => a.date.localeCompare(b.date));
    const live = games.find((m) => m.status === "live") ?? null;
    const played = games.filter((m) => m.status === "finished" && m.homeScore != null);
    const next = games.find((m) => m.status === "scheduled" && +new Date(m.date) > +now - 3 * 3600_000) ?? null;
    return { league, team, last: live ?? played[played.length - 1] ?? null, next };
  }).filter((r) => r.last || r.next);
}
