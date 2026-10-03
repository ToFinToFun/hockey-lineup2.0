/**
 * Vilka positioner och vilket lag varje spelare spelat mest i sparade matcher.
 * Används av Lineup (via lineup.positionHistory) och av Auto-lag på servern.
 */

export interface PositionHistory { mostPlayed: string; stats: Record<string, number>; mostPlayedTeam?: string; teamStats?: Record<string, number> }

export function positionAndTeamHistory(matches: Array<{ lineup?: unknown }>): Record<string, PositionHistory> {
  const positionCounts: Record<string, Record<string, number>> = {};
  const teamCounts: Record<string, Record<string, number>> = {};
  for (const match of matches) {
    const lineup = match.lineup as { lineup?: Record<string, { id?: string } | null> } | null;
    if (!lineup) continue;
    for (const [slotId, p] of Object.entries(lineup.lineup || {})) {
      const playerKey = p?.id;
      if (!playerKey) continue;
      let position = "";
      if (slotId.includes("-gk-")) position = "MV";
      else if (slotId.includes("-fwd-")) {
        const last = slotId.split("-").pop();
        position = last === "c" ? "C" : last === "lw" ? "LW" : last === "rw" ? "RW" : "F";
      } else if (slotId.includes("-def-")) position = "B";
      if (!position) continue;
      (positionCounts[playerKey] ??= {})[position] = (positionCounts[playerKey][position] || 0) + 1;
      // Sparade matcher har alltid Vita som lag A
      const team = slotId.startsWith("team-a-") ? "white" : slotId.startsWith("team-b-") ? "green" : "";
      if (team) (teamCounts[playerKey] ??= {})[team] = (teamCounts[playerKey][team] || 0) + 1;
    }
  }
  const maxKey = (o: Record<string, number> | undefined) => {
    let best: string | undefined, n = 0;
    for (const [k, c] of Object.entries(o ?? {})) if (c > n) { n = c; best = k; }
    return best;
  };
  const result: Record<string, PositionHistory> = {};
  for (const [key, stats] of Object.entries(positionCounts)) {
    result[key] = { mostPlayed: maxKey(stats) ?? "", stats, mostPlayedTeam: maxKey(teamCounts[key]), teamStats: teamCounts[key] };
  }
  return result;
}
