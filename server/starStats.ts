/**
 * Matchens stjärnor per spelare: hur många ★★★, ★★ och ★ var och en fått.
 * Samma stjärnor som i matchrapporten – de sparade om de finns, annars de
 * automatiska (starsOfGame). Motståndarnas spelare räknas inte.
 */
import { starCandidates, autoStars } from "../client/src/lib/starsOfGame";
import { isOpponentPlayerId } from "../shared/matchSetup";

export interface StarCount { key: string; name: string; number: string; team: "white" | "green"; stars3: number; stars2: number; stars1: number; total: number; points: number }

type MatchLike = {
  id: number; teamWhiteScore: number; teamGreenScore: number;
  goalHistory: unknown; lineup: unknown; report?: { stars?: string[] } | null;
};

/** Stjärnorna i en match (nycklar, ★★★ först) */
export function starsOfMatch(m: MatchLike) {
  const cands = starCandidates({
    teamWhiteScore: m.teamWhiteScore, teamGreenScore: m.teamGreenScore,
    goalHistory: (m.goalHistory ?? []) as never, lineup: m.lineup as never,
  });
  const saved = m.report?.stars?.filter((k) => cands.some((c) => c.key === k));
  const keys = saved && saved.length === 3 ? saved : autoStars(cands, m.id);
  return keys.map((k) => cands.find((c) => c.key === k)).filter(Boolean) as ReturnType<typeof starCandidates>;
}

/** Stjärnor per spelare, flest först (★★★ = 3 poäng, ★★ = 2, ★ = 1) */
export function starCounts(matches: MatchLike[]): StarCount[] {
  const by = new Map<string, StarCount>();
  for (const m of matches) {
    starsOfMatch(m).forEach((c, i) => {
      if (isOpponentPlayerId(c.key)) return;
      const s = by.get(c.key) ?? { key: c.key, name: c.name, number: c.number, team: c.team, stars3: 0, stars2: 0, stars1: 0, total: 0, points: 0 };
      if (i === 0) s.stars3++; else if (i === 1) s.stars2++; else s.stars1++;
      s.total++;
      s.points += 3 - i;
      by.set(c.key, s);
    });
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.stars3 - a.stars3 || b.total - a.total);
}
