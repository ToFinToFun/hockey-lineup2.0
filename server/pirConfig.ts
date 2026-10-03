/** PIR-inställningar i app_config: vikter och manuella justeringar per spelare. */
import { getConfigValue } from "./scoreDb";
import { DEFAULT_PIR_WEIGHTS, type PirWeights } from "./pir";
import { sanitizeWeights } from "./pirAnalysis";

export const PIR_WEIGHTS_KEY = "pir_weights";
export const PIR_ADJUSTMENTS_KEY = "pir_adjustments";

export async function loadPirConfig(): Promise<{ weights: PirWeights; adjustments: Record<string, number> }> {
  const [w, a] = await Promise.all([getConfigValue(PIR_WEIGHTS_KEY), getConfigValue(PIR_ADJUSTMENTS_KEY)]);
  let weights = DEFAULT_PIR_WEIGHTS;
  let adjustments: Record<string, number> = {};
  try { if (w) weights = sanitizeWeights(JSON.parse(w)); } catch { /* standardvikter */ }
  try { if (a) adjustments = JSON.parse(a); } catch { /* inga justeringar */ }
  return { weights, adjustments };
}
