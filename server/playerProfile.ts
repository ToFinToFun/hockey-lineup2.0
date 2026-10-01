/**
 * Spelarprofil för spelarsidan: matchlogg, form, rekord och kemi (med vilka
 * spelaren vinner). Allt räknas ur godkända matcher, samma underlag som
 * säsongshistoriken.
 */
import { isTeamAWhite } from "../shared/teams";
import type { MatchResult } from "../drizzle/schema";
import type { MatchOutcome } from "./playerHistory";

export interface MatchLogEntry {
  matchId: number;
  date: string; // ISO
  name: string;
  team: "white" | "green";
  position: "MV" | "B" | "C" | "LW" | "RW";
  own: number;
  opp: number;
  result: MatchOutcome;
  goals: number;
  assists: number;
}

export interface MateStat {
  id: string;
  name: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  /** Vinstprocent 0–100 */
  winPct: number;
}

export interface PlayerProfile {
  matchLog: MatchLogEntry[]; // nyast först
  form: string; // senaste 10, äldst först
  totals: { matches: number; wins: number; draws: number; losses: number; goals: number; assists: number };
  records: {
    bestMatch: { points: number; goals: number; assists: number; matchId: number; date: string } | null;
    longestWinStreak: number;
    longestUnbeaten: number;
    currentStreak: { result: MatchOutcome; length: number } | null;
    pointsPerMatch: number;
    goalsPerMatch: number;
  };
  /** Samma kedja/backpar (målvakter: hela laget) */
  linemates: MateStat[];
  /** Samma lag i matchen */
  teammates: MateStat[];
  /** Motståndare – mot vilka det går bäst/sämst */
  opponents: MateStat[];
}

type LineupWrap = { teamAName?: string; lineup?: Record<string, { id?: string; name?: string }> } | null;
type GoalEvent = { scorerId?: string; assistId?: string; other?: string; team?: string };

const matchDate = (m: MatchResult) => new Date((m.matchEndTime ?? m.matchStartTime ?? m.createdAt) as unknown as string);
const outcome = (own: number, opp: number): MatchOutcome => (own > opp ? "V" : own < opp ? "F" : "O");

function positionOfSlot(slot: string): MatchLogEntry["position"] {
  if (slot.includes("-gk-")) return "MV";
  if (slot.includes("-def-")) return "B";
  if (slot.endsWith("-c")) return "C";
  if (slot.endsWith("-rw")) return "RW";
  return "LW";
}

/** "team-a-fwd-2-lw" → "fwd-2", "team-b-def-1-2" → "def-1", målvakt → "gk". Exporteras för test. */
export function lineGroup(slot: string): string {
  const m = slot.match(/-(fwd|def)-(\d+)/);
  return m ? `${m[1]}-${m[2]}` : "gk";
}

function addMate(map: Map<string, MateStat>, id: string, name: string, res: MatchOutcome) {
  let s = map.get(id);
  if (!s) map.set(id, (s = { id, name, matches: 0, wins: 0, draws: 0, losses: 0, winPct: 0 }));
  s.name = name || s.name;
  s.matches++;
  if (res === "V") s.wins++;
  else if (res === "F") s.losses++;
  else s.draws++;
}

function finishMates(map: Map<string, MateStat>): MateStat[] {
  return [...map.values()]
    .map((s) => ({ ...s, winPct: s.matches ? Math.round((s.wins / s.matches) * 100) : 0 }))
    .sort((a, b) => b.matches - a.matches || b.winPct - a.winPct || a.name.localeCompare(b.name, "sv"));
}

export function playerProfile(matches: MatchResult[], playerId: string, names: Map<string, string> = new Map()): PlayerProfile {
  const sorted = [...matches].sort((a, b) => matchDate(a).getTime() - matchDate(b).getTime());
  const log: MatchLogEntry[] = [];
  const linemates = new Map<string, MateStat>();
  const teammates = new Map<string, MateStat>();
  const opponents = new Map<string, MateStat>();

  for (const m of sorted) {
    const wrap = m.lineup as LineupWrap;
    if (!wrap?.lineup) continue;
    const entries = Object.entries(wrap.lineup).filter(([, p]) => p?.id);
    const mine = entries.find(([, p]) => p.id === playerId);
    if (!mine) continue;

    const teamAWhite = isTeamAWhite(wrap.teamAName);
    const [mySlot] = mine;
    const inA = mySlot.startsWith("team-a");
    const team: "white" | "green" = inA === teamAWhite ? "white" : "green";
    const own = team === "white" ? m.teamWhiteScore : m.teamGreenScore;
    const opp = team === "white" ? m.teamGreenScore : m.teamWhiteScore;
    const res = outcome(own, opp);
    const myGroup = lineGroup(mySlot);

    let goals = 0;
    let assists = 0;
    for (const g of (m.goalHistory as GoalEvent[] | null) ?? []) {
      if (g.other === "Självmål") continue;
      if (g.scorerId === playerId) goals++;
      if (g.assistId === playerId) assists++;
    }

    log.push({
      matchId: m.id, date: matchDate(m).toISOString(), name: m.name ?? "",
      team, position: positionOfSlot(mySlot), own, opp, result: res, goals, assists,
    });

    const seen = new Set<string>([playerId]);
    for (const [slot, p] of entries) {
      const id = p.id!;
      if (seen.has(id)) continue;
      seen.add(id);
      const name = names.get(id) ?? p.name ?? id;
      const sameTeam = slot.startsWith("team-a") === inA;
      if (!sameTeam) {
        // Motståndarens perspektiv ur spelarens resultat
        addMate(opponents, id, name, res);
        continue;
      }
      addMate(teammates, id, name, res);
      const group = lineGroup(slot);
      if (myGroup === "gk" || group === myGroup) addMate(linemates, id, name, res);
    }
  }

  // Rekord och sviter
  let bestMatch: PlayerProfile["records"]["bestMatch"] = null;
  let winRun = 0, longestWin = 0, unbeatenRun = 0, longestUnbeaten = 0;
  const totals = { matches: log.length, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0 };
  for (const e of log) {
    if (e.result === "V") totals.wins++;
    else if (e.result === "F") totals.losses++;
    else totals.draws++;
    totals.goals += e.goals;
    totals.assists += e.assists;
    const pts = e.goals + e.assists;
    if (pts > 0 && (!bestMatch || pts > bestMatch.points)) {
      bestMatch = { points: pts, goals: e.goals, assists: e.assists, matchId: e.matchId, date: e.date };
    }
    winRun = e.result === "V" ? winRun + 1 : 0;
    unbeatenRun = e.result === "F" ? 0 : unbeatenRun + 1;
    longestWin = Math.max(longestWin, winRun);
    longestUnbeaten = Math.max(longestUnbeaten, unbeatenRun);
  }
  let currentStreak: PlayerProfile["records"]["currentStreak"] = null;
  if (log.length) {
    const last = log[log.length - 1].result;
    let n = 0;
    for (let i = log.length - 1; i >= 0 && log[i].result === last; i--) n++;
    currentStreak = { result: last, length: n };
  }
  const round1 = (x: number) => Math.round(x * 100) / 100;

  return {
    matchLog: [...log].reverse(),
    form: log.slice(-10).map((e) => e.result).join(""),
    totals,
    records: {
      bestMatch,
      longestWinStreak: longestWin,
      longestUnbeaten,
      currentStreak,
      pointsPerMatch: log.length ? round1((totals.goals + totals.assists) / log.length) : 0,
      goalsPerMatch: log.length ? round1(totals.goals / log.length) : 0,
    },
    linemates: finishMates(linemates),
    teammates: finishMates(teammates),
    opponents: finishMates(opponents),
  };
}
