/**
 * Player Impact Rating (PIR) — Enhanced Elo-inspired rating system
 *
 * Features:
 * 1. Time-decay: recent matches weigh more (exponential decay, half-life ~90 days)
 * 2. Form (pilen): spelarens senaste 3 matcher jämfört med hans eget snitt
 * 3. Newcomer K-factor: new players' ratings change faster (first 10 matches)
 * 4. Minimum match threshold: players with < 3 matches get low confidence
 * 5. Inactivity decay: players who haven't played recently drift toward 1000
 * 6. Score margin bonus: bigger wins = slightly more impact
 * 7. Team strength adjustment: winning with weaker team = more credit
 * 8. Dual PIR: separate goalkeeper and outfield ratings based on slot placement
 * 9. Position-fair points: defenders' points are compared with other defenders
 *
 * Algorithm:
 * 1. Start all players at rating 1000
 * 2. For each match (chronologically), compute team average ratings
 * 3. Calculate expected win probability (Elo formula)
 * 4. Adjust individual ratings based on actual vs expected outcome
 * 5. Apply time-decay weighting to each match
 * 6. Iterate multiple times until ratings converge
 * 7. Compute form trend per player (last FORM_MATCHES vs own average)
 * 8. Separate goalkeeper/outfield ratings: one rating per player and role
 *    ("id#gk"/"id#out"), only that role's matches change it
 * 9. Goals/assists are compared within position (forwards vs forwards,
 *    defenders vs defenders)
 */

import { pirThresholds, FORM_MATCHES, FORM_MIN_MATCHES } from "../shared/pirThresholds";
import { isTeamAWhite as teamAIsWhite, normalizeTeamKey } from "../shared/teams";
import type { MatchResult } from "../drizzle/schema";

// ─── Types ─────────────────────────────────────────────────────────

export interface PIRResult {
  /** Spelarens ID (eller namn för gammal data utan ID). */
  playerKey: string;
  /** Spelarens namn (senast kända). */
  name: string;
  /** Manuell justering (ingår redan i rating och rollbetygen). */
  adjustment: number;
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

  /** PIR when playing as goalkeeper */
  goalkeeperRating: number | null;
  goalkeeperTrend: number | null;
  goalkeeperTrendLabel: "rising" | "slightly_rising" | "stable" | "slightly_falling" | "falling" | null;
  goalkeeperMatchesPlayed: number;
  goalkeeperConfidence: number;

  /** PIR when playing as outfield */
  outfieldRating: number | null;
  outfieldTrend: number | null;
  outfieldTrendLabel: "rising" | "slightly_rising" | "stable" | "slightly_falling" | "falling" | null;
  outfieldMatchesPlayed: number;
  outfieldConfidence: number;
}

/**
 * Vikter som styr beräkningen. Kan ändras av styrelsen och föreslås av
 * träffsäkerhetsanalysen (se pirAnalysis.ts).
 */
export interface PirWeights {
  /** Bonus per mål (utespelare). */
  goal: number;
  /** Bonus per assist (utespelare). */
  assist: number;
  /** Målvakt: bonus per mål färre insläppta än snittet (avdrag per mål fler). */
  goalkeeper: number;
  /** Halveringstid i dagar – hur snabbt gamla matcher tappar vikt. */
  halfLifeDays: number;
}

export const DEFAULT_PIR_WEIGHTS: PirWeights = {
  goal: 3,
  assist: 2,
  goalkeeper: 2,
  halfLifeDays: 90,
};

/** Tidigare beteende (endast lagresultat) – används som jämförelse i analysen. */
export const TEAM_ONLY_PIR_WEIGHTS: PirWeights = { goal: 0, assist: 0, goalkeeper: 0, halfLifeDays: 90 };

export interface PirOptions {
  weights?: PirWeights;
  /** Manuella justeringar per spelare (spelar-ID → poäng; namn för gammal data utan ID), läggs ovanpå beräkningen. */
  adjustments?: Record<string, number>;
  /** Beräkna som om det vore detta datum (används vid analys bakåt i tiden). */
  now?: Date;
  /** Hoppa över trendberäkningen (snabbare, används vid analys). */
  skipTrend?: boolean;
  /** Rollbetyg även före visningsgränsen (kurvan visar dem som preliminära). */
  provisionalRoles?: boolean;
  /** Antal varv i beräkningen (standard 20). Färre varv används vid analys. */
  iterations?: number;
}

/** Role a player had in a specific match */
type MatchRole = "goalkeeper" | "outfield";

interface MatchPlayerData {
  matchId: number;
  matchDate: Date;
  whiteTeam: string[];
  greenTeam: string[];
  whiteScore: number;
  greenScore: number;
  /** Per-player role in this match (goalkeeper or outfield) */
  playerRoles: Map<string, MatchRole>;
  /** Backar (def-platser) – deras poäng jämförs med andra backars */
  defenders: Set<string>;
  /** Mål och assist per spelare i matchen */
  points: Map<string, { goals: number; assists: number }>;
  /** Visningsnamn per spelarnyckel */
  playerNames: Map<string, string>;
}

// ─── Constants ─────────────────────────────────────────────────────

/** Base K-factor for rating adjustments */
const BASE_K = 32;

/** K-factor multiplier for newcomers (first N matches) */
const NEWCOMER_K_MULTIPLIER = 1.8;

// Nykomlingsgräns, full säkerhet och visningsgräns kan ändras i Inställningar → PIR
// (shared/pirThresholds.ts); standard 10, 10 och 3 matcher.

/** Number of iterations for convergence */
const ITERATIONS = 20;

/** Starting rating */
const INITIAL_RATING = 1000;

/** Time decay half-life in days (matches older than this have ~50% weight) */
const DECAY_HALF_LIFE_DAYS = 90;

// Formpilen: FORM_MATCHES och FORM_MIN_MATCHES i shared/pirThresholds.ts

/** Inactivity decay: days without playing before rating starts drifting to 1000 */
const INACTIVITY_THRESHOLD_DAYS = 60;

/** Inactivity decay rate per day beyond threshold */
const INACTIVITY_DECAY_PER_DAY = 0.5;

/** Max inactivity decay (won't pull more than this toward 1000) */
const MAX_INACTIVITY_DECAY = 100;

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Determine if a slot ID represents a goalkeeper position.
 * Slot IDs follow pattern: team-a-gk-1, team-b-gk-2, etc.
 */
function isGoalkeeperSlot(slotId: string): boolean {
  return slotId.includes("-gk-");
}

/**
 * Extract structured match data from raw match results.
 * Sorted chronologically (oldest first).
 * Now also tracks each player's role (goalkeeper vs outfield) per match.
 */
function extractMatchData(matches: MatchResult[]): MatchPlayerData[] {
  const result: MatchPlayerData[] = [];

  for (const match of matches) {
    const lineup = match.lineup as any;
    if (!lineup || !lineup.lineup) continue;

    const lineupEntries = lineup.lineup as Record<string, any>;
    const teamAName = ((lineup.teamAName || "") as string).toLowerCase();
    const isTeamAWhite = teamAIsWhite(teamAName);

    const whiteTeam: string[] = [];
    const greenTeam: string[] = [];
    const playerRoles = new Map<string, MatchRole>();
    const playerNames = new Map<string, string>();
    const defenders = new Set<string>();

    for (const [slotId, p] of Object.entries(lineupEntries)) {
      if (!p || typeof p !== "object" || !(p as any).name) continue;
      const pl = p as any;
      // Spelarens fasta ID (registret) – namnet bara för mycket gammal data utan ID.
      if (!pl.id) continue;
      const playerKey = String(pl.id);
      playerNames.set(playerKey, String(pl.name).trim());

      // Determine role from slot ID
      const role: MatchRole = isGoalkeeperSlot(slotId) ? "goalkeeper" : "outfield";
      playerRoles.set(playerKey, role);
      if (slotId.includes("-def-")) defenders.add(playerKey);

      if (slotId.startsWith("team-a")) {
        if (isTeamAWhite) whiteTeam.push(playerKey);
        else greenTeam.push(playerKey);
      } else if (slotId.startsWith("team-b")) {
        if (isTeamAWhite) greenTeam.push(playerKey);
        else whiteTeam.push(playerKey);
      }
    }

    // Mål och assist per spelare (målskytt sparas som "Namn #nr" eller fritext)
    const points = new Map<string, { goals: number; assists: number }>();
    const goalList = (match.goalHistory as Array<{ scorer?: string; assist?: string; scorerId?: string; assistId?: string; other?: string }> | null) ?? [];
    for (const g of goalList) {
      if (g.other === "Självmål") continue; // ingen poäng för självmål
      for (const [idField, kind] of [["scorerId", "goals"], ["assistId", "assists"]] as const) {
        const key = g[idField];
        if (!key || !playerRoles.has(key)) continue; // gäst eller spelare utanför uppställningen
        const entry = points.get(key) ?? { goals: 0, assists: 0 };
        entry[kind]++;
        points.set(key, entry);
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
        playerRoles,
        defenders,
        points,
        playerNames,
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
function timeDecayWeight(matchDate: Date, now: Date, halfLifeDays = DECAY_HALF_LIFE_DAYS): number {
  const daysSince = Math.max(0, (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, daysSince / halfLifeDays);
}

/**
 * Individuell bonus per spelare i en match (mål, assist, målvaktsinsats).
 * Poängen nollsummeras inom positionen – forwards mot forwards och backar mot
 * backar – så att backar, som gör färre poäng, inte hamnar under bara för att
 * de spelar back. Målvaktens bonus är redan relativ (mot snittet av insläppta
 * mål) och nollsummeras inte.
 */
function individualBonuses(m: MatchPlayerData, weights: PirWeights, avgGoalsPerTeam: number): Map<string, number> {
  const bonus = new Map<string, number>();
  const groups = new Map<"fwd" | "def", string[]>([["fwd", []], ["def", []]]);
  for (const p of [...m.whiteTeam, ...m.greenTeam]) {
    if (m.playerRoles.get(p) === "goalkeeper") {
      const conceded = m.whiteTeam.includes(p) ? m.greenScore : m.whiteScore;
      bonus.set(p, weights.goalkeeper * (avgGoalsPerTeam - conceded));
      continue;
    }
    const pts = m.points.get(p);
    bonus.set(p, pts ? weights.goal * pts.goals + weights.assist * pts.assists : 0);
    groups.get(m.defenders.has(p) ? "def" : "fwd")!.push(p);
  }
  for (const members of groups.values()) {
    if (members.length === 0) continue;
    const mean = members.reduce((s, p) => s + bonus.get(p)!, 0) / members.length;
    for (const p of members) bonus.set(p, bonus.get(p)! - mean);
  }
  return bonus;
}

/**
 * K-factor for a player based on their experience.
 * Newcomers have higher K-factor for faster convergence.
 */
function playerKFactor(matchesPlayed: number): number {
  if (matchesPlayed < pirThresholds().newcomerMatches) {
    // Linear interpolation from NEWCOMER_K_MULTIPLIER down to 1.0
    const progress = matchesPlayed / pirThresholds().newcomerMatches;
    const multiplier = NEWCOMER_K_MULTIPLIER - (NEWCOMER_K_MULTIPLIER - 1) * progress;
    return BASE_K * multiplier;
  }
  return BASE_K;
}

/**
 * Determine trend label from trend value.
 */
function getTrendLabel(trend: number): PIRResult["trendLabel"] {
  if (trend > 25) return "rising";
  if (trend > 10) return "slightly_rising";
  if (trend < -25) return "falling";
  if (trend < -10) return "slightly_falling";
  return "stable";
}

/**
 * Spelarens prestation i varje match (äldst först): lagresultatet mot det
 * förväntade utifrån betygen, plus individuell bonus (mål, assist,
 * målvaktsinsats) – samma delar som betyget byggs av, utan tidsvikt.
 */
function matchPerformances(
  matchData: MatchPlayerData[],
  ratings: Map<string, number>,
  weights: PirWeights,
  avgGoalsPerTeam: number,
): Map<string, Array<{ role: MatchRole; value: number }>> {
  const out = new Map<string, Array<{ role: MatchRole; value: number }>>();
  for (const m of matchData) {
    const bonus = individualBonuses(m, weights, avgGoalsPerTeam);
    const expWhite = expectedScore(teamAvgRating(m.whiteTeam, ratings), teamAvgRating(m.greenTeam, ratings));
    const actWhite = m.whiteScore > m.greenScore ? 1 : m.whiteScore < m.greenScore ? 0 : 0.5;
    const margin = 1 + Math.min(Math.abs(m.whiteScore - m.greenScore), 5) * 0.1;
    for (const [team, actual, expected] of [[m.whiteTeam, actWhite, expWhite], [m.greenTeam, 1 - actWhite, 1 - expWhite]] as const) {
      for (const p of team) {
        const value = (BASE_K * margin / Math.sqrt(team.length)) * (actual - expected) + (bonus.get(p) ?? 0);
        const list = out.get(p) ?? [];
        list.push({ role: m.playerRoles.get(p) ?? "outfield", value });
        out.set(p, list);
      }
    }
  }
  return out;
}

/**
 * Formen: summan av de senaste FORM_MATCHES matcherna minus vad spelaren
 * brukade prestera på lika många matcher innan dess (snittet av de tidigare
 * matcherna). 0 om spelaren har för få matcher.
 */
export function formTrend(perf: Array<{ value: number }>): number {
  if (perf.length < FORM_MIN_MATCHES) return 0;
  const earlier = perf.slice(0, -FORM_MATCHES);
  const avg = earlier.reduce((s, x) => s + x.value, 0) / earlier.length;
  const recent = perf.slice(-FORM_MATCHES).reduce((s, x) => s + x.value, 0);
  return Math.round(recent - avg * FORM_MATCHES);
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
  weights: PirWeights = DEFAULT_PIR_WEIGHTS,
  avgGoalsPerTeam = 0,
  iterations = ITERATIONS,
): Map<string, number> {
  // Individuella bonusar beror inte på betygen – räkna dem en gång.
  const bonusByMatch = new Map<number, Map<string, number>>();
  for (const m of matchData) bonusByMatch.set(m.matchId, individualBonuses(m, weights, avgGoalsPerTeam));

  const ratings = new Map<string, number>();
  for (const p of allPlayers) {
    ratings.set(p, INITIAL_RATING);
  }

  // Track per-player match count during iterations (for newcomer K-factor)
  const iterMatchCount = new Map<string, number>();
  for (const p of allPlayers) {
    iterMatchCount.set(p, 0);
  }

  for (let iter = 0; iter < iterations; iter++) {
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
      const decayW = useTimeDecay ? timeDecayWeight(m.matchDate, now, weights.halfLifeDays) : 1;
      const bonus = bonusByMatch.get(m.matchId)!;

      // Update white team
      for (const p of m.whiteTeam) {
        const mc = iterMatchCount.get(p) ?? 0;
        iterMatchCount.set(p, mc + 1);
        const k = playerKFactor(matchCountMap?.get(p) ?? mc) * marginMultiplier * decayW / Math.sqrt(m.whiteTeam.length);
        const current = newRatings.get(p) ?? INITIAL_RATING;
        newRatings.set(p, current + k * (actualWhite - expectedWhite) + decayW * (bonus.get(p) ?? 0));
      }

      // Update green team
      for (const p of m.greenTeam) {
        const mc = iterMatchCount.get(p) ?? 0;
        iterMatchCount.set(p, mc + 1);
        const k = playerKFactor(matchCountMap?.get(p) ?? mc) * marginMultiplier * decayW / Math.sqrt(m.greenTeam.length);
        const current = newRatings.get(p) ?? INITIAL_RATING;
        newRatings.set(p, current + k * (actualGreen - expectedGreen) + decayW * (bonus.get(p) ?? 0));
      }
    }

    for (const [p, r] of newRatings) {
      ratings.set(p, r);
    }
  }

  return ratings;
}

/** Matchen med rollnycklar: "id#gk" för målvakter, "id#out" för utespelare. */
function toRoleKeys(m: MatchPlayerData): MatchPlayerData {
  const key = (p: string) => `${p}#${m.playerRoles.get(p) === "goalkeeper" ? "gk" : "out"}`;
  const mapKeys = <T,>(src: Map<string, T>) => new Map([...src].filter(([p]) => m.playerRoles.has(p)).map(([p, v]) => [key(p), v] as [string, T]));
  return {
    ...m,
    whiteTeam: m.whiteTeam.map(key),
    greenTeam: m.greenTeam.map(key),
    playerRoles: new Map([...m.playerRoles].map(([p, r]) => [key(p), r] as [string, MatchRole])),
    defenders: new Set([...m.defenders].map(key)),
    points: mapKeys(m.points),
    playerNames: mapKeys(m.playerNames),
  };
}

/** Den som inte spelat på länge dras mot 1000 (högst MAX_INACTIVITY_DECAY). */
function applyInactivityDecay(ratings: Map<string, number>, key: string, lastMatch: Date, now: Date) {
  const current = ratings.get(key);
  if (current == null || lastMatch.getTime() === 0) return;
  const daysSince = (now.getTime() - lastMatch.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= INACTIVITY_THRESHOLD_DAYS) return;
  const decay = Math.min((daysSince - INACTIVITY_THRESHOLD_DAYS) * INACTIVITY_DECAY_PER_DAY, MAX_INACTIVITY_DECAY);
  // Dra mot 1000 utan att gå förbi
  ratings.set(key, current > INITIAL_RATING ? Math.max(INITIAL_RATING, current - decay) : Math.min(INITIAL_RATING, current + decay));
}

// ─── Main PIR Calculation ──────────────────────────────────────────

/**
 * Calculate Player Impact Ratings from match history.
 * Enhanced with time-decay, trend, newcomer K-factor, inactivity decay,
 * and dual goalkeeper/outfield ratings.
 */
export function calculatePIR(matches: MatchResult[], options: PirOptions = {}): PIRResult[] {
  return calculatePIRFromData(extractMatchData(matches), options);
}

function calculatePIRFromData(matchData: MatchPlayerData[], options: PirOptions = {}): PIRResult[] {
  if (matchData.length === 0) return [];

  const now = options.now ?? new Date();
  const weights = options.weights ?? DEFAULT_PIR_WEIGHTS;
  const adjustments = options.adjustments ?? {};
  const avgGoalsPerTeam = matchData.reduce((s, m) => s + m.whiteScore + m.greenScore, 0) / (matchData.length * 2);
  const elo = (data: MatchPlayerData[], decay: boolean, counts: Map<string, number>) =>
    runEloIterations(data, allPlayers, now, decay, counts, weights, avgGoalsPerTeam, options.iterations ?? ITERATIONS);

  // Collect all unique players
  const allPlayers = new Set<string>();
  const latestName = new Map<string, string>();
  for (const m of matchData) {
    for (const p of m.whiteTeam) allPlayers.add(p);
    for (const p of m.greenTeam) allPlayers.add(p);
    for (const [k, n] of m.playerNames) latestName.set(k, n); // äldst → nyast, senaste vinner
  }

  // ── Stats (count once) ──
  const stats = new Map<string, { played: number; wins: number; losses: number; draws: number; lastMatchDate: Date }>();
  for (const p of allPlayers) {
    stats.set(p, { played: 0, wins: 0, losses: 0, draws: 0, lastMatchDate: new Date(0) });
  }

  // Per-role stats
  const roleStats = new Map<string, { gkPlayed: number; outPlayed: number; gkLastMatch: Date; outLastMatch: Date }>();
  for (const p of allPlayers) {
    roleStats.set(p, { gkPlayed: 0, outPlayed: 0, gkLastMatch: new Date(0), outLastMatch: new Date(0) });
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

      // Track role stats
      const rs = roleStats.get(p)!;
      const role = m.playerRoles.get(p);
      if (role === "goalkeeper") {
        rs.gkPlayed++;
        if (m.matchDate > rs.gkLastMatch) rs.gkLastMatch = m.matchDate;
      } else {
        rs.outPlayed++;
        if (m.matchDate > rs.outLastMatch) rs.outLastMatch = m.matchDate;
      }
    }
    for (const p of m.greenTeam) {
      const s = stats.get(p)!;
      s.played++;
      if (m.matchDate > s.lastMatchDate) s.lastMatchDate = m.matchDate;
      if (isDraw) s.draws++;
      else if (!whiteWin && !isDraw) s.wins++;
      else if (whiteWin) s.losses++;
      else s.draws++;

      // Track role stats
      const rs = roleStats.get(p)!;
      const role = m.playerRoles.get(p);
      if (role === "goalkeeper") {
        rs.gkPlayed++;
        if (m.matchDate > rs.gkLastMatch) rs.gkLastMatch = m.matchDate;
      } else {
        rs.outPlayed++;
        if (m.matchDate > rs.outLastMatch) rs.outLastMatch = m.matchDate;
      }
    }
  }

  // Build match count map for newcomer K-factor
  const matchCountMap = new Map<string, number>();
  for (const [p, s] of stats) {
    matchCountMap.set(p, s.played);
  }

  // ── Overall rating (with time decay) ──
  const overallRatings = elo(matchData, true, matchCountMap);

  // Antal matcher per spelare (visas som recentMatchesPlayed)
  const playerRecentCount = new Map<string, number>();
  for (const [p, st] of stats) playerRecentCount.set(p, Math.min(st.played, FORM_MATCHES));

  // ── Rollbetyg: målvakt och utespelare var för sig ──
  // Varje spelare har ett betyg per roll ("id#gk" / "id#out"). I en match
  // används rollens betyg för lagstyrkan, och bara den rollens betyg ändras –
  // målvaktsmatcher påverkar alltså inte utespelarbetyget och tvärtom.
  const roleData = matchData.map(toRoleKeys);
  const rolePlayers = new Set<string>();
  const roleCounts = new Map<string, number>();
  for (const m of roleData) {
    for (const p of [...m.whiteTeam, ...m.greenTeam]) {
      rolePlayers.add(p);
      roleCounts.set(p, (roleCounts.get(p) ?? 0) + 1);
    }
  }
  const roleRatings = runEloIterations(roleData, rolePlayers, now, true, roleCounts, weights, avgGoalsPerTeam, options.iterations ?? ITERATIONS);

  // ── Form (pilen): prestation per match mot förväntan ──
  const form = options.skipTrend ? null : matchPerformances(matchData, overallRatings, weights, avgGoalsPerTeam);
  const roleForm = options.skipTrend ? null : matchPerformances(roleData, roleRatings, weights, avgGoalsPerTeam);

  // ── Apply inactivity decay ──
  for (const p of allPlayers) {
    const rs = roleStats.get(p)!;
    applyInactivityDecay(overallRatings, p, stats.get(p)!.lastMatchDate, now);
    applyInactivityDecay(roleRatings, `${p}#gk`, rs.gkLastMatch, now);
    applyInactivityDecay(roleRatings, `${p}#out`, rs.outLastMatch, now);
  }

  // ── Build results ──
  const results: PIRResult[] = [];
  for (const p of allPlayers) {
    const s = stats.get(p)!;
    const rs = roleStats.get(p)!;
    const rating = Math.round(overallRatings.get(p) ?? INITIAL_RATING);
    const trend = form ? formTrend(form.get(p) ?? []) : 0;
    const recentRating = rating + trend;
    const daysSince = s.lastMatchDate.getTime() > 0
      ? Math.round((now.getTime() - s.lastMatchDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Enhanced confidence: based on matches + recency
    let confidence = Math.min(s.played / pirThresholds().fullConfidence, 1);
    // Reduce confidence if player hasn't played recently
    if (daysSince != null && daysSince > INACTIVITY_THRESHOLD_DAYS) {
      confidence *= Math.max(0.3, 1 - (daysSince - INACTIVITY_THRESHOLD_DAYS) / 180);
    }

    const winRate = s.played > 0 ? s.wins / s.played : 0;

    // Goalkeeper role-specific PIR
    let goalkeeperRating: number | null = null;
    let goalkeeperTrend: number | null = null;
    let goalkeeperTrendLabel: PIRResult["goalkeeperTrendLabel"] = null;
    let goalkeeperConfidence = 0;

    if (rs.gkPlayed >= (options.provisionalRoles ? 1 : pirThresholds().minMatchesShow)) {
      goalkeeperRating = Math.round(roleRatings.get(`${p}#gk`) ?? INITIAL_RATING);
      goalkeeperTrend = roleForm ? formTrend(roleForm.get(`${p}#gk`) ?? []) : 0;
      goalkeeperTrendLabel = getTrendLabel(goalkeeperTrend);
      goalkeeperConfidence = Math.min(rs.gkPlayed / pirThresholds().fullConfidence, 1);
    }

    // Outfield role-specific PIR
    let outfieldRating: number | null = null;
    let outfieldTrend: number | null = null;
    let outfieldTrendLabel: PIRResult["outfieldTrendLabel"] = null;
    let outfieldConfidence = 0;

    if (rs.outPlayed >= (options.provisionalRoles ? 1 : pirThresholds().minMatchesShow)) {
      outfieldRating = Math.round(roleRatings.get(`${p}#out`) ?? INITIAL_RATING);
      outfieldTrend = roleForm ? formTrend(roleForm.get(`${p}#out`) ?? []) : 0;
      outfieldTrendLabel = getTrendLabel(outfieldTrend);
      outfieldConfidence = Math.min(rs.outPlayed / pirThresholds().fullConfidence, 1);
    }

    // Manuell justering från styrelsen läggs ovanpå (påverkar inte trenden).
    const adj = Math.round(adjustments[p] ?? 0);
    if (goalkeeperRating != null) goalkeeperRating += adj;
    if (outfieldRating != null) outfieldRating += adj;

    results.push({
      playerKey: p,
      name: latestName.get(p) ?? p,
      rating: rating + adj,
      recentRating: recentRating + adj,
      adjustment: adj,
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
      goalkeeperRating,
      goalkeeperTrend,
      goalkeeperTrendLabel,
      goalkeeperMatchesPlayed: rs.gkPlayed,
      goalkeeperConfidence,
      outfieldRating,
      outfieldTrend,
      outfieldTrendLabel,
      outfieldMatchesPlayed: rs.outPlayed,
      outfieldConfidence,
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

// ─── Analys bakåt i tiden ──────────────────────────────────────────

export interface BacktestPoint {
  matchId: number;
  matchDate: Date;
  /** Förutsagd vinstchans för Vita. */
  pWhite: number;
  /** Utfall: 1 = Vita vann, 0 = Gröna vann, 0.5 = oavgjort. */
  outcome: number;
  /** Andel spelare med tillräcklig historik vid tillfället. */
  coverage: number;
}

/**
 * Förutsäger varje match med enbart matcher som spelats före den, precis som
 * prediktionen fungerar i appen. Hoppar över de första `warmup` matcherna.
 */
export async function backtestPIR(
  matches: MatchResult[],
  weights: PirWeights,
  warmup = pirThresholds().backtestWarmup,
  yieldFn: () => Promise<void> = async () => {},
): Promise<BacktestPoint[]> {
  const data = extractMatchData(matches);
  const points: BacktestPoint[] = [];
  // Räkna om betygen före varje match i början, sedan glesare (högst ~60
  // omräkningar) – annars växer tiden kvadratiskt med antalet matcher.
  const step = Math.max(1, Math.ceil((data.length - warmup) / 60));
  let ratings = new Map<string, PIRResult>();
  for (let i = warmup; i < data.length; i++) {
    const m = data[i];
    if ((i - warmup) % step === 0) {
      await yieldFn();
      ratings = new Map(
        calculatePIRFromData(data.slice(0, i), { weights, now: m.matchDate, skipTrend: true, iterations: 8 })
          .map((r) => [r.playerKey, r])
      );
    }
    let known = 0;
    const strength = (team: string[]) =>
      team.reduce((sum, p) => {
        const r = ratings.get(p);
        if (!r) return sum + INITIAL_RATING;
        if (r.matchesPlayed < pirThresholds().minMatchesShow) return sum + INITIAL_RATING + r.adjustment;
        known++;
        const role = m.playerRoles.get(p);
        const v = role === "goalkeeper" ? r.goalkeeperRating ?? r.rating : r.outfieldRating ?? r.rating;
        return sum + v;
      }, 0) / Math.max(1, team.length);
    const white = strength(m.whiteTeam);
    const green = strength(m.greenTeam);
    points.push({
      matchId: m.matchId,
      matchDate: m.matchDate,
      pWhite: expectedScore(white, green),
      outcome: m.whiteScore > m.greenScore ? 1 : m.whiteScore < m.greenScore ? 0 : 0.5,
      coverage: known / (m.whiteTeam.length + m.greenTeam.length),
    });
  }
  return points;
}

/** Antal matcher med uppställning som kan användas i beräkningen. */
export function countRatedMatches(matches: MatchResult[]): number {
  return extractMatchData(matches).length;
}
