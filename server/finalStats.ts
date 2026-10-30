/**
 * Finalen för innevarande hockeyår: lagen seedas efter grundserien (ettan till
 * vänster, tvåan till höger), matchserien i slutspelet och – när styrelsen
 * markerat vinnaren – mästarlaget med alla som spelat minst 10 matcher för laget
 * under säsong och slutspel.
 */
import { getAllMatchResults, getConfigValue, setConfigValue } from "./scoreDb";
import { listPlayers } from "./playersDb";
import { getCurrentPeriods } from "./periodsConfig";
import { isTeamAWhite as teamAIsWhite } from "../shared/teams";
import { series, standings, seasonShort, type TeamKey } from "../shared/standings";

type MatchRow = Awaited<ReturnType<typeof getAllMatchResults>>[number];
const KEY = "final_results";
export const CHAMPION_MIN_MATCHES = 10;

const inRange = (from: string, to: string) => (m: MatchRow) => {
  const d = new Date(m.matchEndTime ?? m.createdAt ?? 0);
  return d >= new Date(`${from}T00:00:00`) && d <= new Date(`${to}T23:59:59`);
};

type Results = Record<string, { winner: TeamKey; at: string; by?: string }>;
async function readResults(): Promise<Results> {
  try { return JSON.parse((await getConfigValue(KEY)) ?? "{}") as Results; } catch { return {}; }
}

type RosterInfo = { name: string; number: string | null; captainRole?: string | null; teamColor?: string | null };

/**
 * Mästarlaget (exporteras för test): lagkapten (C) först, sedan assisterande (A) – de är
 * alltid med – och sedan alla som spelat minst `min` matcher för laget, flest matcher först.
 */
export function teamRoster(matches: MatchRow[], team: TeamKey, names: Map<string, RosterInfo>, min = CHAMPION_MIN_MATCHES) {
  const count = new Map<string, number>();
  for (const m of matches) {
    const lu = m.lineup as { teamAName?: string; lineup?: Record<string, { id?: string } | null> } | null;
    const aWhite = teamAIsWhite((lu?.teamAName ?? "").toLowerCase());
    const prefix = (team === "white") === aWhite ? "team-a-" : "team-b-";
    const seen = new Set<string>();
    for (const [slot, p] of Object.entries(lu?.lineup ?? {})) {
      if (!slot.startsWith(prefix) || !p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      count.set(p.id, (count.get(p.id) ?? 0) + 1);
    }
  }
  const role = (id: string) => {
    const r = names.get(id)?.captainRole;
    return r === "C" || r === "A" ? r : null;
  };
  // C och A i laget: lagfärgen är laget, eller så har de spelat för laget
  const ids = new Set([...count.keys()].filter((id) => (count.get(id) ?? 0) >= min || role(id)));
  for (const [id, info] of names) if (role(id) && info.teamColor === team) ids.add(id);
  const rank = (id: string) => (role(id) === "C" ? 0 : role(id) === "A" ? 1 : 2);
  return [...ids]
    .map((id) => ({ id, name: names.get(id)?.name ?? id, number: names.get(id)?.number ?? null, role: role(id), matches: count.get(id) ?? 0 }))
    .sort((a, b) => rank(a.id) - rank(b.id) || b.matches - a.matches || a.name.localeCompare(b.name, "sv"));
}

export async function finalStatus() {
  const p = await getCurrentPeriods();
  const all = await getAllMatchResults();
  const season = all.filter(inRange(p.seasonFrom, p.seasonTo));
  const playoff = all.filter(inRange(p.playoffFrom, p.playoffTo));
  const table = standings(season);
  const label = seasonShort(p.playoffFrom);
  const result = (await readResults())[label] ?? null;
  let champions: ReturnType<typeof teamRoster> = [];
  if (result) {
    const names = new Map((await listPlayers()).filter((r) => r.active).map((r) => [r.id, { name: r.name, number: r.number ?? null, captainRole: r.captainRole, teamColor: r.teamColor }]));
    champions = teamRoster([...season, ...playoff], result.winner, names);
  }
  return {
    season: label,
    playoffFrom: p.playoffFrom, playoffTo: p.playoffTo,
    // Ettan i grundserien till vänster (lika: Vita först)
    seeds: [table[0].team, table[1].team] as [TeamKey, TeamKey],
    seasonPoints: Object.fromEntries(table.map((r) => [r.team, r.pts])) as Record<TeamKey, number>,
    seasonRank: Object.fromEntries(table.map((r, i) => [r.team, i + 1])) as Record<TeamKey, number>,
    series: series(playoff),
    started: playoff.length > 0,
    winner: result?.winner ?? null,
    finishedAt: result?.at ?? null,
    champions,
    minMatches: CHAMPION_MIN_MATCHES,
  };
}

export async function setFinalWinner(season: string, winner: TeamKey | null, by: string) {
  const r = await readResults();
  if (winner) r[season] = { winner, at: new Date().toISOString(), by };
  else delete r[season];
  await setConfigValue(KEY, JSON.stringify(r));
}
