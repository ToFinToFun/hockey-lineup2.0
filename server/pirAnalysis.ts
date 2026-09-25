/**
 * Träffsäkerhet för PIR-prediktionen och förslag på bättre vikter.
 *
 * Varje match förutsägs med bara det som var känt innan den spelades.
 * Mått:
 *  - Rätt vinnare: andel avgjorda matcher där laget med högst chans vann.
 *  - Brier-poäng: medelkvadratfelet mellan chans och utfall (lägre = bättre).
 *    Att alltid gissa 50/50 ger 0,25 – PIR måste slå det för att tillföra något.
 *
 * Förslag tas fram genom att prova vikter en i taget (koordinatsökning) och
 * behålla det som ger lägst Brier-poäng. Med lite data är skillnaderna ofta
 * slump, så ett förslag visas bara som "bättre" om förbättringen är tydlig.
 */
import type { MatchResult } from "../drizzle/schema";
import {
  backtestPIR,
  countRatedMatches,
  DEFAULT_PIR_WEIGHTS,
  TEAM_ONLY_PIR_WEIGHTS,
  type BacktestPoint,
  type PirWeights,
} from "./pir";

export interface PirMetrics {
  /** Antal förutsagda matcher. */
  matches: number;
  /** Andel rätt vinnare (avgjorda matcher), 0–1. */
  hitRate: number | null;
  /** Brier-poäng, lägre är bättre. 50/50-gissning = 0,25. */
  brier: number | null;
  /** Genomsnittlig andel spelare med historik. */
  coverage: number | null;
  /** Kalibrering: hur ofta favoriten vann per sannolikhetsintervall. */
  calibration: Array<{ range: string; predicted: number; actual: number; count: number }>;
}

export function metricsFrom(points: BacktestPoint[]): PirMetrics {
  if (points.length === 0) return { matches: 0, hitRate: null, brier: null, coverage: null, calibration: [] };
  const decided = points.filter((p) => p.outcome !== 0.5);
  const hits = decided.filter((p) => (p.pWhite >= 0.5 ? 1 : 0) === p.outcome).length;
  const brier = points.reduce((s, p) => s + (p.pWhite - p.outcome) ** 2, 0) / points.length;
  const coverage = points.reduce((s, p) => s + p.coverage, 0) / points.length;

  // Kalibrering från favoritens perspektiv (50–60 %, 60–70 % …).
  const buckets = [0.5, 0.6, 0.7, 0.8, 1.01];
  const calibration = buckets.slice(0, -1).map((lo, i) => {
    const hi = buckets[i + 1];
    const inBucket = points
      .map((p) => (p.pWhite >= 0.5 ? { prob: p.pWhite, won: p.outcome } : { prob: 1 - p.pWhite, won: 1 - p.outcome }))
      .filter((f) => f.prob >= lo && f.prob < hi);
    return {
      range: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))} %`,
      predicted: inBucket.length ? inBucket.reduce((s, f) => s + f.prob, 0) / inBucket.length : 0,
      actual: inBucket.length ? inBucket.reduce((s, f) => s + f.won, 0) / inBucket.length : 0,
      count: inBucket.length,
    };
  });

  return { matches: points.length, hitRate: decided.length ? hits / decided.length : null, brier, coverage, calibration };
}

/** Minsta antal förutsagda matcher innan ett förslag kan tas på allvar. */
export const MIN_MATCHES_FOR_SUGGESTION = 30;
/** Förbättring i Brier-poäng som krävs för att ett förslag ska räknas som bättre. */
const MIN_IMPROVEMENT = 0.005;

const SEARCH_SPACE: Record<keyof PirWeights, number[]> = {
  goal: [0, 1, 2, 3, 5, 8],
  assist: [0, 1, 2, 3, 5],
  goalkeeper: [0, 1, 2, 3, 5],
  halfLifeDays: [45, 90, 180, 365],
};

export interface PirAnalysis {
  ratedMatches: number;
  current: { weights: PirWeights; metrics: PirMetrics };
  teamOnly: PirMetrics;
  suggestion: {
    weights: PirWeights;
    metrics: PirMetrics;
    /** true om förslaget är tydligt bättre och det finns tillräckligt med data. */
    recommended: boolean;
    reason: string;
  } | null;
}

/** Släpp fram andra förfrågningar mellan de tunga beräkningarna (servern ska inte frysa). */
const yieldToServer = () => new Promise<void>((r) => setImmediate(r));

const backtest = (matches: MatchResult[], weights: PirWeights) => backtestPIR(matches, weights, 5, yieldToServer);

async function brierOf(matches: MatchResult[], weights: PirWeights): Promise<number> {
  const m = metricsFrom(await backtest(matches, weights));
  return m.brier ?? 1;
}

/** Koordinatsökning: förbättra en vikt i taget, två varv. */
async function searchWeights(matches: MatchResult[], start: PirWeights): Promise<{ weights: PirWeights; brier: number }> {
  let best = { ...start };
  let bestBrier = await brierOf(matches, best);
  for (let round = 0; round < 2; round++) {
    let improved = false;
    for (const key of Object.keys(SEARCH_SPACE) as Array<keyof PirWeights>) {
      for (const value of SEARCH_SPACE[key]) {
        if (value === best[key]) continue;
        const candidate = { ...best, [key]: value };
        const b = await brierOf(matches, candidate);
        if (b < bestBrier - 1e-6) {
          best = candidate;
          bestBrier = b;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { weights: best, brier: bestBrier };
}

export async function analyzePir(matches: MatchResult[], currentWeights: PirWeights, withSuggestion: boolean): Promise<PirAnalysis> {
  const current = metricsFrom(await backtest(matches, currentWeights));
  const teamOnly = metricsFrom(await backtest(matches, TEAM_ONLY_PIR_WEIGHTS));
  const ratedMatches = countRatedMatches(matches);

  let suggestion: PirAnalysis["suggestion"] = null;
  if (withSuggestion && current.matches > 0) {
    const found = await searchWeights(matches, currentWeights);
    const metrics = metricsFrom(await backtest(matches, found.weights));
    const gain = (current.brier ?? 1) - (metrics.brier ?? 1);
    const enoughData = current.matches >= MIN_MATCHES_FOR_SUGGESTION;
    const clear = gain >= MIN_IMPROVEMENT;
    suggestion = {
      weights: found.weights,
      metrics,
      recommended: enoughData && clear,
      reason: !enoughData
        ? `För lite data (${current.matches} av minst ${MIN_MATCHES_FOR_SUGGESTION} matcher) – förslaget kan vara slump.`
        : !clear
          ? "Nuvarande vikter är i princip lika bra – ingen ändring behövs."
          : "Förslaget förutsade historiken tydligt bättre.",
    };
  }

  return { ratedMatches, current: { weights: currentWeights, metrics: current }, teamOnly, suggestion };
}

export function sanitizeWeights(input: Partial<PirWeights> | null | undefined): PirWeights {
  const w = { ...DEFAULT_PIR_WEIGHTS, ...(input ?? {}) };
  const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  return {
    goal: clamp(w.goal, 0, 20),
    assist: clamp(w.assist, 0, 20),
    goalkeeper: clamp(w.goalkeeper, 0, 20),
    halfLifeDays: clamp(w.halfLifeDays, 14, 730),
  };
}
