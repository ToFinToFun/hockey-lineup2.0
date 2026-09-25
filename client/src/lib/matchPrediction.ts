/**
 * Matchprediktion från PIR (Elo-modell) – experimentell, visas bara för styrelsen.
 *
 * Varje spelares styrka = PIR för rollen (se pirValue.ts). Andelen spelare
 * med riktig historik visas som säkerhet.
 */
import type { Player } from "@/lib/players";
import { effectivePir, hasPirHistory, winProbability } from "@/lib/pirValue";

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
    const entries = Object.entries(lineup).filter(([slot]) => slot.startsWith(prefix));
    const known = entries.filter(([, p]) => hasPirHistory(p)).length;
    const sum = entries.reduce((s, [slot, p]) => s + effectivePir(p, slot.includes("-gk-")), 0);
    return { avg: entries.length ? sum / entries.length : 1000, count: entries.length, known };
  };
  const a = team("team-a-");
  const b = team("team-b-");
  if (a.count === 0 || b.count === 0) return null;
  const teamAWinPct = winProbability(a.avg, b.avg);
  return {
    teamAWinPct,
    teamBWinPct: 1 - teamAWinPct,
    confidence: (a.known + b.known) / (a.count + b.count),
    playersA: a.count,
    playersB: b.count,
  };
}
