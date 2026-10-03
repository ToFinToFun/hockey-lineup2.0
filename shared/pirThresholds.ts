/**
 * PIR-gränser som styrelsen kan ändra (Inställningar → PIR). Standard = som
 * det alltid varit. Servern läser värdena ur app_config; webbläsaren hämtar
 * dem (pir.thresholds) så att Lineup, prediktion och Auto räknar likadant.
 */
export interface PirThresholds {
  /** Betyget visas och används först efter så många matcher i rollen */
  minMatchesShow: number;
  /** Full säkerhet (konfidens 100 %) efter så många matcher */
  fullConfidence: number;
  /** Nykomlingar rör sig snabbare de första så många matcherna */
  newcomerMatches: number;
  /** Träffsäkerhet: så många av de första matcherna används bara som uppvärmning */
  backtestWarmup: number;
  /** Förslag på vikter kräver minst så många analyserade matcher */
  minMatchesForSuggestion: number;
}

export const DEFAULT_PIR_THRESHOLDS: PirThresholds = {
  minMatchesShow: 3,
  fullConfidence: 10,
  newcomerMatches: 10,
  backtestWarmup: 5,
  minMatchesForSuggestion: 6,
};

export const PIR_THRESHOLD_LIMITS: Record<keyof PirThresholds, [number, number]> = {
  minMatchesShow: [1, 20],
  fullConfidence: [1, 50],
  newcomerMatches: [0, 50],
  backtestWarmup: [1, 30],
  minMatchesForSuggestion: [3, 50],
};

export function sanitizeThresholds(input: Partial<PirThresholds> | null | undefined): PirThresholds {
  const out = { ...DEFAULT_PIR_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_PIR_THRESHOLDS) as Array<keyof PirThresholds>) {
    const v = Number(input?.[key]);
    if (!Number.isFinite(v)) continue;
    const [min, max] = PIR_THRESHOLD_LIMITS[key];
    out[key] = Math.min(max, Math.max(min, Math.round(v)));
  }
  return out;
}

let current: PirThresholds = DEFAULT_PIR_THRESHOLDS;
export const pirThresholds = (): PirThresholds => current;
export function setPirThresholds(t: Partial<PirThresholds> | null | undefined) {
  current = sanitizeThresholds(t);
}
