/**
 * Spelarens styrka för prediktion och auto-fördelning.
 *
 * - Rollens betyg (målvakt/utespelare) om spelaren har minst 3 matcher.
 * - Annars 1000 (okänd) plus eventuell manuell justering från styrelsen, så
 *   att en ny spelare man vet är stark kan viktas in direkt.
 */
import type { Player } from "@/lib/players";

export const PIR_DEFAULT = 1000;
export const PIR_MIN_MATCHES = 3;

export function hasPirHistory(p: Player): boolean {
  return (p.pirMatchesPlayed ?? 0) >= PIR_MIN_MATCHES && p.pir != null;
}

export function effectivePir(p: Player, asGoalkeeper: boolean): number {
  if (!hasPirHistory(p)) return PIR_DEFAULT + (p.pirAdjustment ?? 0);
  if (asGoalkeeper && p.pirGoalkeeper != null) return p.pirGoalkeeper;
  if (!asGoalkeeper && p.pirOutfield != null) return p.pirOutfield;
  return p.pir ?? PIR_DEFAULT;
}

/** Elo: sannolikheten att lag A vinner mot lag B. */
export function winProbability(avgA: number, avgB: number): number {
  return 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
}
