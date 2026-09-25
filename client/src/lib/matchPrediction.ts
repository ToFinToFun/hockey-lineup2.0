/**
 * Matchprediktion från PIR (Elo-modell) – experimentell, visas bara för styrelsen.
 *
 * Varje spelares styrka = PIR för rollen (målvakt eller utespelare). Spelare
 * med färre än 3 matcher räknas som snitt (1000), och andelen spelare med
 * riktig data visas som säkerhet.
 */
import type { Player } from "@/lib/players";

const DEFAULT_RATING = 1000;
const MIN_MATCHES = 3;

function effectiveRating(slotId: string, p: Player): number | null {
  if ((p.pirMatchesPlayed ?? 0) < MIN_MATCHES || p.pir == null) return null;
  const isGk = slotId.includes("-gk-");
  if (isGk && p.pirGoalkeeper != null) return p.pirGoalkeeper;
  if (!isGk && p.pirOutfield != null) return p.pirOutfield;
  return p.pir;
}

export interface MatchPrediction {
  teamAWinPct: number;
  teamBWinPct: number;
  /** Andel spelare (0–1) som har tillräckligt med matchdata. */
  confidence: number;
  playersA: number;
  playersB: number;
}

export function predictMatch(lineup: Record<string, Player>): MatchPrediction | null {
  const team = (prefix: string) => {
    const ratings = Object.entries(lineup)
      .filter(([slot]) => slot.startsWith(prefix))
      .map(([slot, p]) => effectiveRating(slot, p));
    const known = ratings.filter((r): r is number => r != null).length;
    const avg = ratings.length ? ratings.reduce<number>((s, r) => s + (r ?? DEFAULT_RATING), 0) / ratings.length : DEFAULT_RATING;
    return { avg, count: ratings.length, known };
  };
  const a = team("team-a-");
  const b = team("team-b-");
  if (a.count === 0 || b.count === 0) return null;
  const teamAWinPct = 1 / (1 + Math.pow(10, (b.avg - a.avg) / 400));
  return {
    teamAWinPct,
    teamBWinPct: 1 - teamAWinPct,
    confidence: (a.known + b.known) / (a.count + b.count),
    playersA: a.count,
    playersB: b.count,
  };
}
