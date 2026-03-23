/*
 * Hook: useIceTimeCalculator
 * Beräknar optimal positionsfördelning för ishockeylag
 * baserat på antal anmälda utespelare.
 *
 * På isen samtidigt: 2 backar + 1 center + 2 ytterforwards = 5 utespelare
 */

import { useMemo } from "react";

export interface Distribution {
  backs: number;
  centers: number;
  forwards: number;
  timePerBack: number;
  timePerCenter: number;
  timePerForward: number;
  maxDifference: number;
  rank: number;
}

export interface CalculatorResult {
  totalPlayers: number;
  matchTime: number;
  distributions: Distribution[];
  best: Distribution | null;
  isValid: boolean;
  errorMessage: string;
}

const ICE_SLOTS = {
  backs: 2,
  centers: 1,
  forwards: 2,
} as const;

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 20;

export const POSITION_LIMITS = {
  backs: { min: 3, max: 6 },
  centers: { min: 2, max: 3 },
  forwards: { min: 3, max: 9 },
} as const;

export function calculateDistributions(
  totalPlayers: number,
  matchTime: number = 60
): CalculatorResult {
  if (totalPlayers < MIN_PLAYERS) {
    return {
      totalPlayers,
      matchTime,
      distributions: [],
      best: null,
      isValid: false,
      errorMessage: `Minst ${MIN_PLAYERS} utespelare krävs (2 backar + 1 center + 2 forwards)`,
    };
  }

  if (totalPlayers > MAX_PLAYERS) {
    return {
      totalPlayers,
      matchTime,
      distributions: [],
      best: null,
      isValid: false,
      errorMessage: `Max ${MAX_PLAYERS} utespelare stöds`,
    };
  }

  const results: Distribution[] = [];

  for (let nBacks = POSITION_LIMITS.backs.min; nBacks <= Math.min(POSITION_LIMITS.backs.max, totalPlayers - POSITION_LIMITS.centers.min - POSITION_LIMITS.forwards.min); nBacks++) {
    for (let nCenters = POSITION_LIMITS.centers.min; nCenters <= Math.min(POSITION_LIMITS.centers.max, totalPlayers - nBacks - POSITION_LIMITS.forwards.min); nCenters++) {
      const nForwards = totalPlayers - nBacks - nCenters;
      if (nForwards < POSITION_LIMITS.forwards.min || nForwards > POSITION_LIMITS.forwards.max) continue;

      const timePerBack = (ICE_SLOTS.backs / nBacks) * matchTime;
      const timePerCenter = (ICE_SLOTS.centers / nCenters) * matchTime;
      const timePerForward = (ICE_SLOTS.forwards / nForwards) * matchTime;

      const times = [timePerBack, timePerCenter, timePerForward];
      const maxDifference = Math.max(...times) - Math.min(...times);

      results.push({
        backs: nBacks,
        centers: nCenters,
        forwards: nForwards,
        timePerBack: Math.round(timePerBack * 10) / 10,
        timePerCenter: Math.round(timePerCenter * 10) / 10,
        timePerForward: Math.round(timePerForward * 10) / 10,
        maxDifference: Math.round(maxDifference * 10) / 10,
        rank: 0,
      });
    }
  }

  results.sort((a, b) => a.maxDifference - b.maxDifference);
  results.forEach((r, i) => (r.rank = i + 1));

  return {
    totalPlayers,
    matchTime,
    distributions: results,
    best: results[0] || null,
    isValid: true,
    errorMessage: "",
  };
}

export function useIceTimeCalculator(
  totalPlayers: number,
  matchTime: number = 60
): CalculatorResult {
  return useMemo(
    () => calculateDistributions(totalPlayers, matchTime),
    [totalPlayers, matchTime]
  );
}

export function formatTime(minutes: number): string {
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  if (secs === 0) return `${mins} min`;
  return `${mins}:${secs.toString().padStart(2, "0")} min`;
}
