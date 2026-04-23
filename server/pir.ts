/**
 * Player Impact Rating (PIR) — Elo-inspired rating system
 *
 * Measures how much each player contributes to their team winning,
 * adjusted for teammate and opponent strength.
 *
 * Algorithm:
 * 1. Start all players at rating 1000
 * 2. For each match, compute team average ratings
 * 3. Calculate expected win probability (Elo formula)
 * 4. Adjust individual ratings based on actual vs expected outcome
 * 5. Iterate multiple times until ratings converge
 */

import type { MatchResult } from "../drizzle/schema";

// ─── Types ─────────────────────────────────────────────────────────

export interface PIRResult {
  playerKey: string;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  /** Confidence: 0-1, based on matches played */
  confidence: number;
}

interface MatchPlayerData {
  matchId: number;
  whiteTeam: string[];   // playerKeys on white team
  greenTeam: string[];   // playerKeys on green team
  whiteScore: number;
  greenScore: number;
}

// ─── Constants ─────────────────────────────────────────────────────

/** Base K-factor for rating adjustments */
const BASE_K = 32;

/** Minimum matches for full confidence */
const MIN_MATCHES_FULL_CONFIDENCE = 10;

/** Number of iterations for convergence */
const ITERATIONS = 20;

/** Starting rating */
const INITIAL_RATING = 1000;

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Extract structured match data from raw match results.
 * Maps slot IDs to white/green teams based on teamAName.
 */
function extractMatchData(matches: MatchResult[]): MatchPlayerData[] {
  const result: MatchPlayerData[] = [];

  for (const match of matches) {
    const lineup = match.lineup as any;
    if (!lineup || !lineup.lineup) continue;

    const lineupEntries = lineup.lineup as Record<string, any>;
    const teamAName = ((lineup.teamAName || "") as string).toLowerCase();
    const isTeamAWhite = teamAName.includes("vit");

    const whiteTeam: string[] = [];
    const greenTeam: string[] = [];

    for (const [slotId, p] of Object.entries(lineupEntries)) {
      if (!p || typeof p !== "object" || !(p as any).name) continue;
      const pl = p as any;
      const playerKey = pl.number ? `${pl.name} #${pl.number}` : pl.name;

      if (slotId.startsWith("team-a")) {
        if (isTeamAWhite) whiteTeam.push(playerKey);
        else greenTeam.push(playerKey);
      } else if (slotId.startsWith("team-b")) {
        if (isTeamAWhite) greenTeam.push(playerKey);
        else whiteTeam.push(playerKey);
      }
    }

    // Only include matches with players on both sides
    if (whiteTeam.length > 0 && greenTeam.length > 0) {
      result.push({
        matchId: match.id,
        whiteTeam,
        greenTeam,
        whiteScore: match.teamWhiteScore,
        greenScore: match.teamGreenScore,
      });
    }
  }

  return result;
}

/**
 * Elo expected score: probability that team A beats team B
 * given their average ratings.
 */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Compute the average rating of a team.
 */
function teamAvgRating(team: string[], ratings: Map<string, number>): number {
  if (team.length === 0) return INITIAL_RATING;
  let sum = 0;
  for (const p of team) {
    sum += ratings.get(p) ?? INITIAL_RATING;
  }
  return sum / team.length;
}

// ─── Main PIR Calculation ──────────────────────────────────────────

/**
 * Calculate Player Impact Ratings from match history.
 * Uses iterative Elo-like algorithm with team strength adjustment.
 */
export function calculatePIR(matches: MatchResult[]): PIRResult[] {
  const matchData = extractMatchData(matches);

  if (matchData.length === 0) return [];

  // Collect all unique players
  const allPlayers = new Set<string>();
  for (const m of matchData) {
    for (const p of m.whiteTeam) allPlayers.add(p);
    for (const p of m.greenTeam) allPlayers.add(p);
  }

  // Initialize ratings
  const ratings = new Map<string, number>();
  for (const p of allPlayers) {
    ratings.set(p, INITIAL_RATING);
  }

  // Track stats
  const stats = new Map<string, { played: number; wins: number; losses: number; draws: number }>();
  for (const p of allPlayers) {
    stats.set(p, { played: 0, wins: 0, losses: 0, draws: 0 });
  }

  // Count stats (only once, not per iteration)
  for (const m of matchData) {
    const isDraw = m.whiteScore === m.greenScore;
    const whiteWin = m.whiteScore > m.greenScore;

    for (const p of m.whiteTeam) {
      const s = stats.get(p)!;
      s.played++;
      if (isDraw) s.draws++;
      else if (whiteWin) s.wins++;
      else s.losses++;
    }
    for (const p of m.greenTeam) {
      const s = stats.get(p)!;
      s.played++;
      if (isDraw) s.draws++;
      else if (!whiteWin && !isDraw) s.wins++;
      else if (whiteWin) s.losses++;
      else s.draws++;
    }
  }

  // Iterative rating calculation
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Reset ratings each iteration but use previous as starting point
    const newRatings = new Map<string, number>();
    for (const p of allPlayers) {
      newRatings.set(p, INITIAL_RATING);
    }

    // Process all matches chronologically
    for (const m of matchData) {
      const whiteAvg = teamAvgRating(m.whiteTeam, ratings);
      const greenAvg = teamAvgRating(m.greenTeam, ratings);

      // Expected scores
      const expectedWhite = expectedScore(whiteAvg, greenAvg);
      const expectedGreen = 1 - expectedWhite;

      // Actual scores (1 = win, 0.5 = draw, 0 = loss)
      let actualWhite: number;
      let actualGreen: number;
      if (m.whiteScore > m.greenScore) {
        actualWhite = 1;
        actualGreen = 0;
      } else if (m.greenScore > m.whiteScore) {
        actualWhite = 0;
        actualGreen = 1;
      } else {
        actualWhite = 0.5;
        actualGreen = 0.5;
      }

      // Score margin bonus (bigger wins = slightly more impact)
      const scoreDiff = Math.abs(m.whiteScore - m.greenScore);
      const marginMultiplier = 1 + Math.min(scoreDiff, 5) * 0.1;

      // K-factor adjusted by team size (smaller teams = more individual impact)
      const kWhite = BASE_K * marginMultiplier / Math.sqrt(m.whiteTeam.length);
      const kGreen = BASE_K * marginMultiplier / Math.sqrt(m.greenTeam.length);

      // Update white team players
      for (const p of m.whiteTeam) {
        const current = newRatings.get(p) ?? INITIAL_RATING;
        const adjustment = kWhite * (actualWhite - expectedWhite);
        newRatings.set(p, current + adjustment);
      }

      // Update green team players
      for (const p of m.greenTeam) {
        const current = newRatings.get(p) ?? INITIAL_RATING;
        const adjustment = kGreen * (actualGreen - expectedGreen);
        newRatings.set(p, current + adjustment);
      }
    }

    // Use new ratings for next iteration
    for (const [p, r] of newRatings) {
      ratings.set(p, r);
    }
  }

  // Build results
  const results: PIRResult[] = [];
  for (const p of allPlayers) {
    const s = stats.get(p)!;
    const rating = Math.round(ratings.get(p) ?? INITIAL_RATING);
    const confidence = Math.min(s.played / MIN_MATCHES_FULL_CONFIDENCE, 1);
    const winRate = s.played > 0 ? s.wins / s.played : 0;

    results.push({
      playerKey: p,
      rating,
      matchesPlayed: s.played,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      winRate,
      confidence,
    });
  }

  // Sort by rating descending
  results.sort((a, b) => b.rating - a.rating);

  return results;
}
