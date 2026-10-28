/** PIR-inställningar i app_config: vikter och manuella justeringar per spelare. */
import { getConfigValue } from "./scoreDb";
import { DEFAULT_PIR_WEIGHTS, type PirWeights } from "./pir";
import { sanitizeWeights } from "./pirAnalysis";
import { setPirThresholds, pirThresholds, type PirThresholds } from "../shared/pirThresholds";

export const PIR_WEIGHTS_KEY = "pir_weights";
export const PIR_ADJUSTMENTS_KEY = "pir_adjustments";
export const PIR_THRESHOLDS_KEY = "pir_thresholds";
export const PIR_VISIBILITY_KEY = "pir_visibility";

/**
 * Vem som ser PIR (betyg, pilar, ranking, kurvor):
 * - "board": bara styrelsen (Admin) – standard
 * - "access": även de med Statistik, Spelare, Kort eller Lineup (som tidigare)
 */
export type PirVisibility = "board" | "access";

export async function getPirVisibility(): Promise<PirVisibility> {
  return (await getConfigValue(PIR_VISIBILITY_KEY)) === "access" ? "access" : "board";
}

/**
 * Vikter och justeringar. Läser också gränserna (pirThresholds) och sätter dem
 * för beräkningarna, så att allt som räknar PIR använder de sparade värdena.
 */
export async function loadPirConfig(): Promise<{ weights: PirWeights; adjustments: Record<string, number>; thresholds: PirThresholds }> {
  const [w, a, t] = await Promise.all([getConfigValue(PIR_WEIGHTS_KEY), getConfigValue(PIR_ADJUSTMENTS_KEY), getConfigValue(PIR_THRESHOLDS_KEY)]);
  try { setPirThresholds(t ? JSON.parse(t) : null); } catch { setPirThresholds(null); }
  let weights = DEFAULT_PIR_WEIGHTS;
  let adjustments: Record<string, number> = {};
  try { if (w) weights = sanitizeWeights(JSON.parse(w)); } catch { /* standardvikter */ }
  try { if (a) adjustments = JSON.parse(a); } catch { /* inga justeringar */ }
  return { weights, adjustments, thresholds: pirThresholds() };
}
