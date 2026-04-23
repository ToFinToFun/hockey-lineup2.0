/**
 * Player Impact Rating (PIR) — Enhanced Elo-inspired rating system
 *
 * Features:
 * 1. Time-decay: recent matches weigh more (exponential decay, half-life ~90 days)
 * 2. Trend: compare recent form (last 5-10 matches) vs overall rating
 * 3. Newcomer K-factor: new players' ratings change faster (first 10 matches)
 * 4. Minimum match threshold: players with < 3 matches get low confidence
 * 5. Inactivity decay: players who haven't played recently drift toward 1000
 * 6. Score margin bonus: bigger wins = slightly more impact
 * 7. Team strength adjustment: winning with weaker team = more credit
 *
 * Algorithm:
 * 1. Start all players at rating 1000
 * 2. For each match (chronologically), compute team average ratings
 * 3. Calculate expected win probability (Elo formula)
 * 4. Adjust individual ratings based on actual vs expected outcome
 * 5. Apply time-decay weighting to each match
 * 6. Iterate multiple times until ratings converge
 * 7. Compute trend from recent matches vs overall
 */

import type { MatchResult } from "../drizzle/schema";

// ─── Types ─────────────────────────────────────────────────────────

export interface PIRResult {
  playerKey: string;
  /** Overall rating (time-weighted) */
  rating: number;
  /** Recent form rating (last N matches only) */
  recentRating: number;
  /** Trend: recentRating - rating. Positive = improving, negative = declining */
  trend: number;
  /** Trend label for display */
  trendLabel: "rising" | "slightly_rising" | "stable" | "slightly_falling" | "falling";
  matchesPlayed: number;
  recentMatchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  /** Confidence: 0-1, based on matches played + recency */
  confidence: number;
  /** Days since last match */
  daysSinceLastMatch: number | null;
}

interface MatchPlayerData {
  matchId: number;
  matchDate: Date;
  whiteTeam: string[];
  greenTeam: string[];
  whiteScore: number;
  greenScore: number;
}

// ─── Constants ─────────────────────────────────────────────────────

/** Base K-factor for rating adjustments */
const BASE_K = 32;

/** K-factor multiplier for newcomers (first N matches) */
const NEWCOMER_K_MULTIPLIER = 1.8;

/** Number of matches before K-factor normalizes */
const NEWCOMER_THRESHOLD = 10;

/** Minimum matches for full confidence */
const MIN_MATCHES_FULL_CONFIDENCE = 10;

/** Minimum matches to show rating at all */
const MIN_MATCHES_SHOW = 3;

/** Number of iterations for convergence */
const ITERATIONS = 20;

/** Starting rating */
const INITIAL_RATING = 1000;

/** Time decay half-life in days (matches older than this have ~50% weight) */
const DECAY_HALF_LIFE_DAYS = 90;

/** Number of recent matches for trend calculation */
const RECENT_MATCHES_COUNT = 8;

/** Inactivity decay: days without playing before rating starts drifting to 1000 */
const INACTIVITY_THRESHOLD_DAYS = 60;

/** Inactivity decay rate per day beyond threshold */
const INACTIVITY_DECAY_PER_DAY = 0.5;

/** Max inactivity decay (won't pull more than this toward 1000) */
const MAX_INACTIVITY_DECAY = 100;

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Extract structured match data from raw match results.
 * Sorted chronologically (oldest first).
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
      // Use just the name as key to consolidate players across matches
      // where they may have had different or missing numbers
      const playerKey = (pl.name as string).trim();

      if (slotId.startsWith("team-a")) {
        if (isTeamAWhite) whiteTeam.push(playerKey);
        else greenTeam.push(playerKey);
      } else if (slotId.startsWith("team-b")) {
        if (isTeamAWhite) greenTeam.push(playerKey);
        else whiteTeam.push(playerKey);
      }
    }

    if (whiteTeam.length > 0 && greenTeam.length > 0) {
      // Use matchEndTime, matchStartTime, or createdAt for date
      const matchDate = match.matchStartTime ?? match.matchEndTime ?? match.createdAt;

      result.push({
        matchId: match.id,
        matchDate: new Date(matchDate),
        whiteTeam,
        greenTeam,
        whiteScore: match.teamWhiteScore,
        greenScore: match.teamGreenScore,
      });
    }
  }

  // Sort chronologically (oldest first)
  result.sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());

  return result;
}

/**
 * Elo expected score: probability that team A beats team B
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

/**
 * Time decay weight: exponential decay based on days since match.
 * Returns value between 0 and 1 (1 = today, 0.5 = half-life days ago).
 */
function timeDecayWeight(matchDate: Date, now: Date): number {
  const daysSince = Math.max(0, (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, daysSince / DECAY_HALF_LIFE_DAYS);
}

/**
 * K-factor for a player based on their experience.
 * Newcomers have higher K-factor for faster convergence.
 */
function playerKFactor(matchesPlayed: number): number {
  if (matchesPlayed < NEWCOMER_THRESHOLD) {
    // Linear interpolation from NEWCOMER_K_MULTIPLIER down to 1.0
    const progress = matchesPlayed / NEWCOMER_THRESHOLD;
    const multiplier = NEWCOMER_K_MULTIPLIER - (NEWCOMER_K_MULTIPLIER - 1) * progress;
    return BASE_K * multiplier;
  }
  return BASE_K;
}

/**
 * Determine trend label from trend value.
 */
function getTrendLabel(trend: number): PIRResult["trendLabel"] {
  if (trend > 20) return "rising";
  if (trend > 8) return "slightly_rising";
  if (trend < -20) return "falling";
  if (trend < -8) return "slightly_falling";
  return "stable";
}

// ─── Core Rating Engine ───────────────────────────────────────────

/**
 * Run the iterative Elo calculation on a set of matches.
 * Returns final ratings map.
 */
function runEloIterations(
  matchData: MatchPlayerData[],
  allPlayers: Set<string>,
  now: Date,
  useTimeDecay: boolean,
  matchCountMap?: Map<string, number>,
): Map<string, number> {
  const ratings = new Map<string, number>();
  for (const p of allPlayers) {
    ratings.set(p, INITIAL_RATING);
  }

  // Track per-player match count during iterations (for newcomer K-factor)
  const iterMatchCount = new Map<string, number>();
  for (const p of allPlayers) {
    iterMatchCount.set(p, 0);
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const newRatings = new Map<string, number>();
    for (const p of allPlayers) {
      newRatings.set(p, INITIAL_RATING);
    }

    // Reset match counts for this iteration
    for (const p of allPlayers) {
      iterMatchCount.set(p, 0);
    }

    for (const m of matchData) {
      const whiteAvg = teamAvgRating(m.whiteTeam, ratings);
      const greenAvg = teamAvgRating(m.greenTeam, ratings);

      const expectedWhite = expectedScore(whiteAvg, greenAvg);
      const expectedGreen = 1 - expectedWhite;

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

      // Score margin bonus
      const scoreDiff = Math.abs(m.whiteScore - m.greenScore);
      const marginMultiplier = 1 + Math.min(scoreDiff, 5) * 0.1;

      // Time decay weight
      const decayW = useTimeDecay ? timeDecayWeight(m.matchDate, now) : 1;

      // Update white team
      for (const p of m.whiteTeam) {
        const mc = iterMatchCount.get(p) ?? 0;
        iterMatchCount.set(p, mc + 1);
        const k = playerKFactor(matchCountMap?.get(p) ?? mc) * marginMultiplier * decayW / Math.sqrt(m.whiteTeam.length);
        const current = newRatings.get(p) ?? INITIAL_RATING;
        newRatings.set(p, current + k * (actualWhite - expectedWhite));
      }

      // Update green team
      for (const p of m.greenTeam) {
        const mc = iterMatchCount.get(p) ?? 0;
        iterMatchCount.set(p, mc + 1);
        const k = playerKFactor(matchCountMap?.get(p) ?? mc) * marginMultiplier * decayW / Math.sqrt(m.greenTeam.length);
        const current = newRatings.get(p) ?? INITIAL_RATING;
        newRatings.set(p, current + k * (actualGreen - expectedGreen));
      }
    }

    for (const [p, r] of newRatings) {
      ratings.set(p, r);
    }
  }

  return ratings;
}

// ─── Main PIR Calculation ──────────────────────────────────────────

/**
 * Calculate Player Impact Ratings from match history.
 * Enhanced with time-decay, trend, newcomer K-factor, and inactivity decay.
 */
export function calculatePIR(matches: MatchResult[]): PIRResult[] {
  const matchData = extractMatchData(matches);

  if (matchData.length === 0) return [];

  const now = new Date();

  // Collect all unique players
  const allPlayers = new Set<string>();
  for (const m of matchData) {
    for (const p of m.whiteTeam) allPlayers.add(p);
    for (const p of m.greenTeam) allPlayers.add(p);
  }

  // ── Stats (count once) ──
  const stats = new Map<string, { played: number; wins: number; losses: number; draws: number; lastMatchDate: Date }>();
  for (const p of allPlayers) {
    stats.set(p, { played: 0, wins: 0, losses: 0, draws: 0, lastMatchDate: new Date(0) });
  }

  for (const m of matchData) {
    const isDraw = m.whiteScore === m.greenScore;
    const whiteWin = m.whiteScore > m.greenScore;

    for (const p of m.whiteTeam) {
      const s = stats.get(p)!;
      s.played++;
      if (m.matchDate > s.lastMatchDate) s.lastMatchDate = m.matchDate;
      if (isDraw) s.draws++;
      else if (whiteWin) s.wins++;
      else s.losses++;
    }
    for (const p of m.greenTeam) {
      const s = stats.get(p)!;
      s.played++;
      if (m.matchDate > s.lastMatchDate) s.lastMatchDate = m.matchDate;
      if (isDraw) s.draws++;
      else if (!whiteWin && !isDraw) s.wins++;
      else if (whiteWin) s.losses++;
      else s.draws++;
    }
  }

  // Build match count map for newcomer K-factor
  const matchCountMap = new Map<string, number>();
  for (const [p, s] of stats) {
    matchCountMap.set(p, s.played);
  }

  // ── Overall rating (with time decay) ──
  const overallRatings = runEloIterations(matchData, allPlayers, now, true, matchCountMap);

  // ── Recent rating (last N matches per player) ──
  // Build per-player recent match sets
  const playerMatches = new Map<string, MatchPlayerData[]>();
  for (const p of allPlayers) {
    playerMatches.set(p, []);
  }
  for (const m of matchData) {
    for (const p of m.whiteTeam) playerMatches.get(p)!.push(m);
    for (const p of m.greenTeam) playerMatches.get(p)!.push(m);
  }

  // Collect all matches that are "recent" for at least one player
  const recentMatchIds = new Set<number>();
  const playerRecentCount = new Map<string, number>();
  for (const [p, pMatches] of playerMatches) {
    const recent = pMatches.slice(-RECENT_MATCHES_COUNT);
    playerRecentCount.set(p, recent.length);
    for (const m of recent) recentMatchIds.add(m.matchId);
  }

  // For trend: run a separate calculation using only each player's recent matches
  // Simplified approach: use the last RECENT_MATCHES_COUNT matches overall
  const recentMatches = matchData.slice(-Math.min(matchData.length, RECENT_MATCHES_COUNT * 2));
  const recentPlayers = new Set<string>();
  for (const m of recentMatches) {
    for (const p of m.whiteTeam) recentPlayers.add(p);
    for (const p of m.greenTeam) recentPlayers.add(p);
  }
  const recentRatings = runEloIterations(recentMatches, allPlayers, now, false, matchCountMap);

  // ── Apply inactivity decay ──
  for (const p of allPlayers) {
    const s = stats.get(p)!;
    const daysSince = (now.getTime() - s.lastMatchDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > INACTIVITY_THRESHOLD_DAYS) {
      const excessDays = daysSince - INACTIVITY_THRESHOLD_DAYS;
      const decay = Math.min(excessDays * INACTIVITY_DECAY_PER_DAY, MAX_INACTIVITY_DECAY);
      const currentRating = overallRatings.get(p) ?? INITIAL_RATING;
      // Pull toward 1000
      const direction = currentRating > INITIAL_RATING ? -1 : 1;
      const newRating = currentRating + direction * decay;
      // Don't overshoot 1000
      if ((currentRating > INITIAL_RATING && newRating < INITIAL_RATING) ||
          (currentRating < INITIAL_RATING && newRating > INITIAL_RATING)) {
        overallRatings.set(p, INITIAL_RATING);
      } else {
        overallRatings.set(p, newRating);
      }
    }
  }

  // ── Build results ──
  const results: PIRResult[] = [];
  for (const p of allPlayers) {
    const s = stats.get(p)!;
    const rating = Math.round(overallRatings.get(p) ?? INITIAL_RATING);
    const recentRating = Math.round(recentRatings.get(p) ?? INITIAL_RATING);
    const trend = recentRating - rating;
    const daysSince = s.lastMatchDate.getTime() > 0
      ? Math.round((now.getTime() - s.lastMatchDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Enhanced confidence: based on matches + recency
    let confidence = Math.min(s.played / MIN_MATCHES_FULL_CONFIDENCE, 1);
    // Reduce confidence if player hasn't played recently
    if (daysSince != null && daysSince > INACTIVITY_THRESHOLD_DAYS) {
      confidence *= Math.max(0.3, 1 - (daysSince - INACTIVITY_THRESHOLD_DAYS) / 180);
    }

    const winRate = s.played > 0 ? s.wins / s.played : 0;

    results.push({
      playerKey: p,
      rating,
      recentRating,
      trend,
      trendLabel: getTrendLabel(trend),
      matchesPlayed: s.played,
      recentMatchesPlayed: playerRecentCount.get(p) ?? 0,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      winRate,
      confidence,
      daysSinceLastMatch: daysSince,
    });
  }

  results.sort((a, b) => b.rating - a.rating);

  return results;
}

/**
 * Calculate expected win probability for a team matchup.
 * Takes two arrays of player ratings and returns probability for team A.
 */
export function predictMatchOutcome(teamARatings: number[], teamBRatings: number[]): {
  teamAWinPct: number;
  teamBWinPct: number;
  teamAPirSum: number;
  teamBPirSum: number;
  teamAAvgPir: number;
  teamBAvgPir: number;
  balance: "even" | "slight" | "uneven";
} {
  const avgA = teamARatings.length > 0
    ? teamARatings.reduce((s, r) => s + r, 0) / teamARatings.length
    : INITIAL_RATING;
  const avgB = teamBRatings.length > 0
    ? teamBRatings.reduce((s, r) => s + r, 0) / teamBRatings.length
    : INITIAL_RATING;

  const teamAWinPct = expectedScore(avgA, avgB);
  const teamBWinPct = 1 - teamAWinPct;

  const teamAPirSum = teamARatings.reduce((s, r) => s + r, 0);
  const teamBPirSum = teamBRatings.reduce((s, r) => s + r, 0);

  const diff = Math.abs(teamAWinPct - teamBWinPct);
  const balance = diff < 0.06 ? "even" : diff < 0.15 ? "slight" : "uneven";

  return {
    teamAWinPct: Math.round(teamAWinPct * 100),
    teamBWinPct: Math.round(teamBWinPct * 100),
    teamAPirSum: Math.round(teamAPirSum),
    teamBPirSum: Math.round(teamBPirSum),
    teamAAvgPir: Math.round(avgA),
    teamBAvgPir: Math.round(avgB),
    balance,
  };
}
