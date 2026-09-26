/**
 * Spelarhistorik per säsong – räknas fram ur godkända matcher.
 *
 * Varje sparad match innehåller uppställningen som den såg ut då, så vi vet
 * vilka som spelade, i vilket lag och på vilken position. Spelarna kopplas via
 * fast ID (se playersDb.canonicalizeMatch), så historiken följer med vid namn-
 * och nummerbyte. En säsong räknas från 1 augusti till 31 juli.
 */
import type { MatchResult } from "../drizzle/schema";

export type PositionCode = "MV" | "B" | "C" | "F";

export interface SeasonLine {
  season: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  positions: Record<PositionCode, number>;
  teams: { white: number; green: number };
}

const SEASON_START_MONTH = 7; // augusti (0-indexerat)

export function seasonOf(date: Date): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= SEASON_START_MONTH ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

function matchDate(m: MatchResult): Date {
  return new Date((m.matchEndTime ?? m.matchStartTime ?? m.createdAt) as unknown as string);
}

function positionOfSlot(slot: string): PositionCode {
  if (slot.includes("-gk-")) return "MV";
  if (slot.includes("-def-")) return "B";
  if (slot.endsWith("-c")) return "C";
  return "F";
}

const empty = (season: string): SeasonLine => ({
  season, matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0,
  positions: { MV: 0, B: 0, C: 0, F: 0 }, teams: { white: 0, green: 0 },
});

/** Historik per säsong för alla spelare (nyckel: spelar-ID). */
export function seasonHistory(matches: MatchResult[]): Map<string, SeasonLine[]> {
  const byPlayer = new Map<string, Map<string, SeasonLine>>();
  const line = (id: string, season: string) => {
    let seasons = byPlayer.get(id);
    if (!seasons) byPlayer.set(id, (seasons = new Map()));
    let l = seasons.get(season);
    if (!l) seasons.set(season, (l = empty(season)));
    return l;
  };

  for (const m of matches) {
    const wrap = m.lineup as { teamAName?: string; lineup?: Record<string, { id?: string }> } | null;
    if (!wrap?.lineup) continue;
    const season = seasonOf(matchDate(m));
    const teamAWhite = (wrap.teamAName ?? "VITA").toLowerCase().includes("vit");
    const seen = new Set<string>();
    for (const [slot, p] of Object.entries(wrap.lineup)) {
      if (!p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      const inA = slot.startsWith("team-a");
      const team: "white" | "green" = inA === teamAWhite ? "white" : "green";
      const own = team === "white" ? m.teamWhiteScore : m.teamGreenScore;
      const opp = team === "white" ? m.teamGreenScore : m.teamWhiteScore;
      const l = line(p.id, season);
      l.matches++;
      l.positions[positionOfSlot(slot)]++;
      l.teams[team]++;
      if (own > opp) l.wins++;
      else if (own < opp) l.losses++;
      else l.draws++;
    }
    for (const g of (m.goalHistory as Array<{ scorerId?: string; assistId?: string; other?: string }> | null) ?? []) {
      if (g.other === "Självmål") continue;
      if (g.scorerId) line(g.scorerId, season).goals++;
      if (g.assistId) line(g.assistId, season).assists++;
    }
  }

  const out = new Map<string, SeasonLine[]>();
  for (const [id, seasons] of byPlayer) {
    out.set(id, [...seasons.values()].sort((a, b) => b.season.localeCompare(a.season)));
  }
  return out;
}
