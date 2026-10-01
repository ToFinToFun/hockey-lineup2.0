/**
 * Alternativ position för en spelare – visas som tvåfärgad positionsbricka och
 * används av Auto när en plats annars blir tom.
 *
 *  1. Manuell (hybridspelare): satt i spelarkortet – går alltid före.
 *  2. Från matchhistoriken: den position (MV, B, C eller F) spelaren spelat mest
 *     utöver sin egen, om den står för minst X % av matcherna (inställning i
 *     Lineup, standard 20 %) och spelaren har minst 5 matcher.
 * Vänster/höger räknas som F.
 */
export type PosGroup = "MV" | "B" | "C" | "F";

export function posGroup(pos: string | null | undefined): PosGroup | null {
  if (!pos) return null;
  if (pos === "MV" || pos === "RES") return "MV";
  if (pos === "B") return "B";
  if (pos === "C") return "C";
  if (pos === "F" || pos === "LW" || pos === "RW") return "F";
  return null; // IB m.fl.
}

export const MIN_MATCHES_FOR_ALT = 5;

/** Vanligaste andra positionen enligt historiken, eller null. Exporteras för test. */
export function secondaryFromStats(own: string | null | undefined, stats: Record<string, number> | undefined, thresholdPct: number): { pos: PosGroup; share: number } | null {
  if (!stats || thresholdPct <= 0) return null;
  const counts: Record<PosGroup, number> = { MV: 0, B: 0, C: 0, F: 0 };
  let total = 0;
  for (const [k, n] of Object.entries(stats)) {
    const g = posGroup(k);
    if (!g || !n) continue;
    counts[g] += n;
    total += n;
  }
  if (total < MIN_MATCHES_FOR_ALT) return null;
  const ownG = posGroup(own);
  let best: PosGroup | null = null;
  for (const g of ["MV", "B", "C", "F"] as PosGroup[]) {
    if (g === ownG || !counts[g]) continue;
    if (!best || counts[g] > counts[best]) best = g;
  }
  if (!best) return null;
  const share = counts[best] / total;
  return share * 100 >= thresholdPct ? { pos: best, share } : null;
}

// ─── Inställningen (per enhet) ────────────────────────────────────────────────
const KEY = "lineup-alt-pos-threshold";
export const DEFAULT_ALT_THRESHOLD = 20;
export function getAltThreshold(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && localStorage.getItem(KEY) !== null ? v : DEFAULT_ALT_THRESHOLD;
  } catch {
    return DEFAULT_ALT_THRESHOLD;
  }
}
export function setAltThreshold(v: number) {
  try { localStorage.setItem(KEY, String(v)); } catch { /* privat läge */ }
}
